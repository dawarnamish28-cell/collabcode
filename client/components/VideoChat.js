/**
 * VideoChat v12.0 — Production-Grade WebRTC Video Chat (Complete Rewrite)
 *
 * Architecture (mirrors VoiceChat v15):
 *  - Single-direction offer: ONLY the joiner (video:peers receiver) creates offers.
 *    Existing users (video:user-joined) wait for incoming offers and answer them.
 *  - ICE candidate queuing: candidates buffered until remoteDescription is set.
 *  - TURN server support for NAT traversal.
 *  - All WebRTC state managed via refs (no stale closures).
 *  - Polite-peer glare handling as safety net for ICE restarts.
 *  - Explicit video.play() with autoplay-policy fallback.
 *  - Remote stream re-attach on videoUsers state change (DOM timing fix).
 *
 * made with <3 by Namish
 */

import { useState, useEffect, useRef, useCallback, memo } from 'react';

// Fallback ICE servers — used if /api/ice-servers endpoint is unreachable
const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turns:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// Fetch fresh ICE servers from backend (production-grade: server manages credentials)
let cachedIceServers = null;
let cacheExpiry = 0;
function getServerBaseUrl() {
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL;
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin.includes('-sandbox') || origin.includes('.sandbox.')) {
      return origin.replace(/\/\/3000-/, '//4000-');
    }
    return origin.replace(':3000', ':4000');
  }
  return 'http://localhost:4000';
}
async function getIceServers() {
  const now = Date.now();
  if (cachedIceServers && now < cacheExpiry) return cachedIceServers;
  try {
    const baseUrl = getServerBaseUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`${baseUrl}/api/ice-servers`, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) throw new Error('Failed to fetch ICE servers');
    const data = await resp.json();
    cachedIceServers = data.iceServers;
    cacheExpiry = now + ((data.ttl || 3600) * 500); // refresh at half-TTL
    console.log('[Video] Fetched ICE servers from backend:', cachedIceServers.length, 'servers');
    return cachedIceServers;
  } catch (err) {
    console.warn('[Video] Using fallback ICE servers:', err.message);
    return FALLBACK_ICE_SERVERS;
  }
}

const MAX_PEERS = 8;
const PEER_TIMEOUT_MS = 20000;
const ICE_RESTART_MAX = 2;
const ICE_RESTART_DELAY = 3000;

const VideoChat = memo(function VideoChat({ socket, currentUser, users = [] }) {
  // ─── State ─────────────────────────────────────────────────────
  const [isInVideo, setIsInVideo] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [videoUsers, setVideoUsers] = useState([]);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [expanded, setExpanded] = useState(true);

  // ─── Refs ──────────────────────────────────────────────────────
  const localVideoRef = useRef(null);
  const localStream = useRef(null);
  const screenStream = useRef(null);
  const peers = useRef(new Map());            // socketId -> { pc, userId, username, iceCandidateQueue, remoteDescSet }
  const remoteStreams = useRef(new Map());     // userId -> MediaStream
  const peerTimers = useRef(new Map());
  const iceRestarts = useRef(new Map());
  const isInVideoRef = useRef(false);
  const socketRef = useRef(socket);
  const mounted = useRef(true);

  // Keep refs in sync
  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { isInVideoRef.current = isInVideo; }, [isInVideo]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const safe = useCallback((fn) => { if (mounted.current) fn(); }, []);

  // Stable leaveVideo ref
  const leaveVideoRef = useRef(null);

  // ─── Cleanup ───────────────────────────────────────────────────
  const doLeaveVideo = useCallback(() => {
    // Stop all local tracks
    if (localStream.current) {
      localStream.current.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
      localStream.current = null;
    }
    if (screenStream.current) {
      screenStream.current.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
      screenStream.current = null;
    }
    // Close all peer connections
    for (const [sid, peer] of peers.current) {
      try { peer.pc.close(); } catch (e) {}
    }
    peers.current.clear();
    remoteStreams.current.clear();
    // Clear timers
    for (const t of peerTimers.current.values()) clearTimeout(t);
    peerTimers.current.clear();
    iceRestarts.current.clear();
    // Clean up remote video elements
    try {
      document.querySelectorAll('[id^="remote-video-"]').forEach(el => {
        try { el.srcObject = null; } catch (e) {}
      });
    } catch (e) {}

    socketRef.current?.emit('video:leave');

    safe(() => {
      setIsInVideo(false);
      setIsCameraOn(true);
      setIsMicOn(true);
      setIsScreenSharing(false);
      setVideoUsers([]);
    });
  }, []);

  leaveVideoRef.current = doLeaveVideo;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (leaveVideoRef.current && isInVideoRef.current) {
        leaveVideoRef.current();
      }
    };
  }, []);

  // ─── Destroy single peer ──────────────────────────────────────
  function destroyPeer(socketId, userId) {
    const peer = peers.current.get(socketId);
    if (peer) {
      try { peer.pc.close(); } catch (e) {}
      peers.current.delete(socketId);
    }
    if (userId) {
      const el = document.getElementById(`remote-video-${userId}`);
      if (el) try { el.srcObject = null; } catch (e) {}
      remoteStreams.current.delete(userId);
    }
    const t = peerTimers.current.get(socketId);
    if (t) { clearTimeout(t); peerTimers.current.delete(socketId); }
    iceRestarts.current.delete(socketId);
  }

  // ─── Attach remote stream to video element ─────────────────────
  function attachRemoteStream(userId, stream) {
    if (!stream) return;
    const el = document.getElementById(`remote-video-${userId}`);
    if (el) {
      el.srcObject = stream;
      const p = el.play();
      if (p && p.catch) {
        p.catch(() => {
          const retry = () => {
            el.play().catch(() => {});
            document.removeEventListener('click', retry);
          };
          document.addEventListener('click', retry, { once: true });
        });
      }
    }
  }

  // ─── Create RTCPeerConnection ──────────────────────────────────
  async function makePeerConnection(targetSocketId, userId, username) {
    // Clean up stale connection
    const existing = peers.current.get(targetSocketId);
    if (existing) {
      const state = existing.pc.connectionState;
      if (state !== 'failed' && state !== 'closed') {
        return existing.pc; // Reuse live connection
      }
      try { existing.pc.close(); } catch (e) {}
      peers.current.delete(targetSocketId);
    }
    if (peers.current.size >= MAX_PEERS) return null;

    // Fetch ICE servers from backend (cached, production-grade)
    const iceServers = await getIceServers();

    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 4,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });

    const peerData = { pc, userId, username, iceCandidateQueue: [], remoteDescSet: false };
    peers.current.set(targetSocketId, peerData);

    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current) {
        socketRef.current.emit('video:ice-candidate', { to: targetSocketId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      if (!mounted.current) return;
      const remoteStream = e.streams[0] || new MediaStream([e.track]);
      remoteStreams.current.set(userId, remoteStream);
      attachRemoteStream(userId, remoteStream);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        const t = peerTimers.current.get(targetSocketId);
        if (t) { clearTimeout(t); peerTimers.current.delete(targetSocketId); }
        iceRestarts.current.delete(targetSocketId);
      } else if (state === 'failed') {
        attemptIceRestart(targetSocketId, pc);
      } else if (state === 'disconnected') {
        setTimeout(() => {
          if (mounted.current && pc.connectionState === 'disconnected') {
            attemptIceRestart(targetSocketId, pc);
          }
        }, 5000);
      } else if (state === 'closed') {
        destroyPeer(targetSocketId, userId);
      }
    };

    // Connection timeout
    const timer = setTimeout(() => {
      const p = peers.current.get(targetSocketId);
      if (p && p.pc.connectionState !== 'connected') {
        destroyPeer(targetSocketId, userId);
      }
      peerTimers.current.delete(targetSocketId);
    }, PEER_TIMEOUT_MS);
    peerTimers.current.set(targetSocketId, timer);

    return pc;
  }

  // ─── Flush queued ICE candidates ───────────────────────────────
  async function flushIceCandidates(socketId) {
    const peer = peers.current.get(socketId);
    if (!peer) return;
    peer.remoteDescSet = true;
    for (const candidate of peer.iceCandidateQueue) {
      try { await peer.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
    }
    peer.iceCandidateQueue = [];
  }

  // ─── ICE restart ───────────────────────────────────────────────
  function attemptIceRestart(socketId, pc) {
    const attempts = iceRestarts.current.get(socketId) || 0;
    if (attempts >= ICE_RESTART_MAX) {
      const peer = peers.current.get(socketId);
      destroyPeer(socketId, peer?.userId);
      return;
    }
    iceRestarts.current.set(socketId, attempts + 1);
    setTimeout(async () => {
      if (!mounted.current) return;
      const peer = peers.current.get(socketId);
      if (!peer || pc.connectionState === 'closed') return;
      try {
        pc.restartIce();
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        socketRef.current?.emit('video:offer', { to: socketId, offer: pc.localDescription });
      } catch (e) {
        const p = peers.current.get(socketId);
        destroyPeer(socketId, p?.userId);
      }
    }, ICE_RESTART_DELAY * Math.pow(2, attempts));
  }

  // ─── JOINER: Send offer to an existing peer ────────────────────
  async function sendOffer(targetSocketId, userId, username) {
    if (!localStream.current || !socketRef.current) return;
    try {
      const pc = await makePeerConnection(targetSocketId, userId, username);
      if (!pc) return;
      // Add local tracks
      localStream.current.getTracks().forEach(t => {
        try { pc.addTrack(t, localStream.current); } catch (e) {}
      });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current.emit('video:offer', { to: targetSocketId, offer: pc.localDescription });
    } catch (err) {
      console.error('[Video] sendOffer error:', err);
      destroyPeer(targetSocketId, userId);
    }
  }

  // ─── Socket event handlers ─────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // New user joined video → update UI only (do NOT send offer)
    const onVideoUserJoined = (user) => {
      if (!mounted.current) return;
      setVideoUsers(prev => {
        if (prev.find(u => u.userId === user.userId)) return prev;
        return [...prev, user];
      });
      // The new user will send us an offer via video:peers → sendOffer
    };

    const onVideoUserLeft = (data) => {
      if (!mounted.current) return;
      setVideoUsers(prev => prev.filter(u => u.userId !== data.userId));
      for (const [sid, peer] of peers.current) {
        if (peer.userId === data.userId) destroyPeer(sid, data.userId);
      }
    };

    // Joiner receives list of existing video users → send offers to each
    const onVideoPeers = (peerList) => {
      if (!mounted.current) return;
      setVideoUsers(peerList);
      if (localStream.current) {
        peerList.forEach(p => sendOffer(p.socketId, p.userId, p.username));
      }
    };

    // Incoming offer → we are the answerer
    const onVideoOffer = async (data) => {
      if (!localStream.current) return;
      try {
        let peer = peers.current.get(data.from);
        let pc;

        if (peer) {
          pc = peer.pc;
          // Glare handling (ICE restart race)
          if (pc.signalingState === 'have-local-offer') {
            const weArePolite = socket.id > data.from;
            if (!weArePolite) return;
            await pc.setLocalDescription({ type: 'rollback' });
          }
        } else {
          pc = await makePeerConnection(data.from, data.userId, data.username);
          if (!pc) return;
          localStream.current.getTracks().forEach(t => {
            try { pc.addTrack(t, localStream.current); } catch (e) {}
          });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        await flushIceCandidates(data.from);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('video:answer', { to: data.from, answer: pc.localDescription });
      } catch (err) {
        console.error('[Video] onVideoOffer error:', err);
        destroyPeer(data.from, data.userId);
      }
    };

    // Incoming answer
    const onVideoAnswer = async (data) => {
      const peer = peers.current.get(data.from);
      if (!peer) return;
      try {
        if (peer.pc.signalingState === 'have-local-offer') {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          await flushIceCandidates(data.from);
        }
      } catch (err) {
        console.error('[Video] onVideoAnswer error:', err);
      }
    };

    // Incoming ICE candidate → queue if remote desc not set
    const onVideoIceCandidate = async (data) => {
      const peer = peers.current.get(data.from);
      if (!peer || !data.candidate) return;
      if (peer.remoteDescSet) {
        try { await peer.pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) {}
      } else {
        peer.iceCandidateQueue.push(data.candidate);
      }
    };

    socket.on('video:user-joined', onVideoUserJoined);
    socket.on('video:user-left', onVideoUserLeft);
    socket.on('video:peers', onVideoPeers);
    socket.on('video:offer', onVideoOffer);
    socket.on('video:answer', onVideoAnswer);
    socket.on('video:ice-candidate', onVideoIceCandidate);

    return () => {
      socket.off('video:user-joined', onVideoUserJoined);
      socket.off('video:user-left', onVideoUserLeft);
      socket.off('video:peers', onVideoPeers);
      socket.off('video:offer', onVideoOffer);
      socket.off('video:answer', onVideoAnswer);
      socket.off('video:ice-candidate', onVideoIceCandidate);
    };
  }, [socket]);

  // Attach local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream.current) {
      localVideoRef.current.srcObject = localStream.current;
    }
  }, [isInVideo, isCameraOn]);

  // Re-attach remote streams when videoUsers changes (DOM timing fix)
  useEffect(() => {
    if (!isInVideo) return;
    const timer = setTimeout(() => {
      for (const [userId, stream] of remoteStreams.current) {
        attachRemoteStream(userId, stream);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [videoUsers, isInVideo]);

  // ─── Join Video ────────────────────────────────────────────────
  const joinVideo = useCallback(async () => {
    if (!socket || isInVideo || connecting) return;
    setConnecting(true);
    setError('');

    try {
      const mediaPromise = navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 360, max: 720 },
          facingMode: 'user',
          frameRate: { ideal: 24, max: 30 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const stream = await Promise.race([
        mediaPromise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('MEDIA_TIMEOUT')), 10000)),
      ]);

      if (!mounted.current) { stream.getTracks().forEach(t => t.stop()); return; }

      localStream.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      setIsCameraOn(true);
      setIsMicOn(true);
      setIsInVideo(true);
      setConnecting(false);
      setExpanded(true);

      socket.emit('video:join', { userId: currentUser.userId, username: currentUser.username });
    } catch (err) {
      if (!mounted.current) return;
      setConnecting(false);
      const msg =
        err.message === 'MEDIA_TIMEOUT' ? 'Camera access timed out. Try again.' :
        err.name === 'NotAllowedError' ? 'Camera permission denied. Check browser settings.' :
        err.name === 'NotFoundError' ? 'No camera found on this device.' :
        err.name === 'NotReadableError' ? 'Camera is already in use by another app.' :
        'Failed to access camera. Try again.';
      setError(msg);
    }
  }, [socket, isInVideo, connecting, currentUser]);

  // ─── Toggle Camera ─────────────────────────────────────────────
  const toggleCamera = useCallback(() => {
    if (!localStream.current) return;
    const track = localStream.current.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsCameraOn(track.enabled); }
  }, []);

  // ─── Toggle Mic ────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    if (!localStream.current) return;
    const track = localStream.current.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsMicOn(track.enabled); }
  }, []);

  // ─── Screen Share ──────────────────────────────────────────────
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      // Stop sharing
      if (screenStream.current) {
        screenStream.current.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
        screenStream.current = null;
      }
      // Swap back to camera track
      if (localStream.current) {
        const videoTrack = localStream.current.getVideoTracks()[0];
        if (videoTrack) {
          peers.current.forEach(({ pc }) => {
            try {
              const sender = pc.getSenders().find(s => s.track?.kind === 'video');
              if (sender) sender.replaceTrack(videoTrack).catch(() => {});
            } catch (e) {}
          });
        }
        if (localVideoRef.current) localVideoRef.current.srcObject = localStream.current;
      }
      setIsScreenSharing(false);
      socketRef.current?.emit('video:screen-share-stop');
      return;
    }

    try {
      const ss = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStream.current = ss;
      const screenTrack = ss.getVideoTracks()[0];

      peers.current.forEach(({ pc }) => {
        try {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack).catch(() => {});
        } catch (e) {}
      });

      if (localVideoRef.current) localVideoRef.current.srcObject = ss;

      screenTrack.onended = () => {
        if (!mounted.current) return;
        setIsScreenSharing(false);
        if (localStream.current && localVideoRef.current) {
          localVideoRef.current.srcObject = localStream.current;
          const videoTrack = localStream.current.getVideoTracks()[0];
          if (videoTrack) {
            peers.current.forEach(({ pc }) => {
              try {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) sender.replaceTrack(videoTrack).catch(() => {});
              } catch (e) {}
            });
          }
        }
        socketRef.current?.emit('video:screen-share-stop');
      };

      setIsScreenSharing(true);
      socketRef.current?.emit('video:screen-share-start');
    } catch (err) {
      // User cancelled
    }
  }, [isScreenSharing]);

  const totalInCall = videoUsers.length + (isInVideo ? 1 : 0);

  // ─── NOT in video: compact join bar ────────────────────────────
  if (!isInVideo) {
    return (
      <div className="px-2 sm:px-3 py-2 bg-[#19191c] border-b border-[#282828] flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(196, 181, 253, 0.06)' }}>
              <svg className="w-3 h-3 text-[#c4b5fd]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-[11px] font-mono text-[#888] truncate">video chat</span>
          </div>
          <button
            onClick={joinVideo}
            disabled={connecting}
            className="text-[10px] px-3 py-1.5 rounded-lg font-mono transition-all active:scale-95 disabled:opacity-50 bg-[#c4b5fd]/12 hover:bg-[#c4b5fd]/22 text-[#c4b5fd] border border-[#c4b5fd]/15"
          >
            {connecting ? (
              <span className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 border border-[#c4b5fd] border-t-transparent rounded-full animate-spin" />
                joining...
              </span>
            ) : 'join video'}
          </button>
        </div>
        {error && (
          <div className="flex items-center gap-2 mt-1.5 px-1" style={{ animation: 'fadeUp 0.2s ease' }}>
            <svg className="w-3 h-3 text-[#ff6b6b] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-[#ff6b6b] text-[10px] font-mono flex-1">{error}</p>
            <button onClick={() => setError('')} className="text-[#666] hover:text-[#aaa] p-0.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── IN video: video panel ─────────────────────────────────────
  return (
    <div className="bg-[#19191c] border-b border-[#282828] flex-shrink-0">
      <div className="px-2 sm:px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: isScreenSharing ? 'rgba(196, 181, 253, 0.15)' : 'rgba(91, 216, 130, 0.08)' }}>
              {isScreenSharing ? (
                <svg className="w-3 h-3 text-[#c4b5fd]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className={`w-3 h-3 ${isCameraOn ? 'text-[#5bd882]' : 'text-[#ff6b6b]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </div>
            {isInVideo && isCameraOn && (
              <div className="absolute inset-0 rounded-full border border-[#5bd882]/30 animate-ping" style={{ animationDuration: '2s' }} />
            )}
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-mono text-[#888] block truncate">
              <span className={isScreenSharing ? 'text-[#c4b5fd]' : !isCameraOn ? 'text-[#ff6b6b]' : 'text-[#5bd882]'}>
                {isScreenSharing ? 'sharing screen' : !isCameraOn ? 'camera off' : 'live'}
                <span className="text-[#666]"> · {totalInCall} in call</span>
              </span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setExpanded(prev => !prev)}
            className="p-2 sm:p-1.5 rounded-lg transition-all active:scale-90 bg-[#222] text-[#aaa] hover:text-white hover:bg-[#2a2b30]"
            title={expanded ? 'Collapse video' : 'Expand video'}>
            <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button onClick={toggleCamera}
            className={`p-2 sm:p-1.5 rounded-lg transition-all active:scale-90 ${isCameraOn ? 'bg-[#222] text-[#aaa] hover:text-white hover:bg-[#2a2b30]' : 'bg-[#ff6b6b]/15 text-[#ff6b6b] hover:bg-[#ff6b6b]/25'}`}
            title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}>
            {isCameraOn ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
            )}
          </button>
          <button onClick={toggleMic}
            className={`p-2 sm:p-1.5 rounded-lg transition-all active:scale-90 ${isMicOn ? 'bg-[#222] text-[#aaa] hover:text-white hover:bg-[#2a2b30]' : 'bg-[#ff6b6b]/15 text-[#ff6b6b] hover:bg-[#ff6b6b]/25'}`}
            title={isMicOn ? 'Mute mic' : 'Unmute mic'}>
            {isMicOn ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
            )}
          </button>
          <button onClick={toggleScreenShare}
            className={`hidden sm:block p-2 sm:p-1.5 rounded-lg transition-all active:scale-90 ${isScreenSharing ? 'bg-[#c4b5fd]/15 text-[#c4b5fd] hover:bg-[#c4b5fd]/25' : 'bg-[#222] text-[#aaa] hover:text-white hover:bg-[#2a2b30]'}`}
            title={isScreenSharing ? 'Stop sharing' : 'Share screen'}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </button>
          <button onClick={doLeaveVideo}
            className="text-[10px] px-3 py-1.5 rounded-lg font-mono transition-all active:scale-95 bg-[#ff6b6b]/12 hover:bg-[#ff6b6b]/22 text-[#ff6b6b] border border-[#ff6b6b]/15">
            leave
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-2 pb-2">
          <div className="grid gap-1" style={{
            gridTemplateColumns: totalInCall <= 1 ? '1fr' : totalInCall <= 2 ? 'repeat(2, 1fr)' : totalInCall <= 4 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
          }}>
            <div className="relative rounded-lg overflow-hidden bg-[#111] border border-[#282828]" style={{ aspectRatio: '16/9' }}>
              <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)', display: (isCameraOn || isScreenSharing) ? 'block' : 'none' }} />
              {!isCameraOn && !isScreenSharing && (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a1b1e] to-[#222]">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold font-mono"
                    style={{ background: (currentUser?.color || '#c4b5fd') + '25', color: currentUser?.color || '#c4b5fd' }}>
                    {(currentUser?.username || 'Y')[0].toUpperCase()}
                  </div>
                </div>
              )}
              <div className="absolute bottom-1 left-1 flex items-center gap-1 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[9px] font-mono text-[#ccc]">
                <span>You</span>
                {isScreenSharing && <span className="text-[#c4b5fd] animate-pulse">sharing</span>}
                {!isMicOn && (
                  <svg className="w-2 h-2 text-[#ff6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6" />
                  </svg>
                )}
              </div>
            </div>
            {videoUsers.map(user => (
              <div key={user.userId} className="relative rounded-lg overflow-hidden bg-[#111] border border-[#282828]" style={{ aspectRatio: '16/9' }}>
                <video id={`remote-video-${user.userId}`} autoPlay playsInline className="w-full h-full object-cover"
                  ref={(el) => {
                    if (el && remoteStreams.current.has(user.userId)) {
                      try { el.srcObject = remoteStreams.current.get(user.userId); } catch (e) {}
                    }
                  }} />
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a1b1e] to-[#222]" style={{ zIndex: 0 }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold font-mono"
                    style={{ background: (user.color || '#5e9eff') + '25', color: user.color || '#5e9eff' }}>
                    {(user.username || '?')[0].toUpperCase()}
                  </div>
                </div>
                <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[9px] font-mono text-[#ccc]">
                  {user.username}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!expanded && videoUsers.length > 0 && (
        <div className="flex flex-wrap gap-1 px-2 pb-2">
          {videoUsers.map(u => (
            <span key={u.userId} className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 bg-[#c4b5fd]/6 text-[#c4b5fd] rounded-md font-mono border border-[#c4b5fd]/10">
              <span className="w-1 h-1 rounded-full bg-[#c4b5fd] animate-pulse" />
              {u.username}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});

export default VideoChat;
