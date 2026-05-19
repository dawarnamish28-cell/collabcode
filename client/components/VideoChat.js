/**
 * VideoChat v11.0 — Phase 4.1: Fix dual-offer race condition
 * 
 * v11.0 fixes:
 *  - FIXED: Both sides sent offers simultaneously (joiner via video:peers with
 *    isInitiator=true, existing user via video:user-joined with isInitiator=true).
 *    The createPeerConnection dedup guard returned the existing PC but both sides
 *    were trying to set local offers, causing glare and broken handshakes.
 *  - FIX: Only the JOINER (video:peers) creates offers with isInitiator=true.
 *    Existing users (video:user-joined) create the PC with isInitiator=false and
 *    WAIT for the joiner's incoming offer.
 *  - onVideoOffer glare handling retained as safety net for ICE restarts.
 *
 * v9.0 hardening (retained):
 *  - Stable leaveVideo ref via useRef
 *  - ICE restart on failure with backoff
 *  - Connection timeout, getUserMedia timeout
 *  - Max peer cap, safe cleanup
 *
 * made with <3 by Namish
 */

import { useState, useEffect, useRef, useCallback, memo } from 'react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

const MAX_PEERS = 8;
const PEER_CONNECT_TIMEOUT = 15000; // 15s to establish connection
const ICE_RESTART_DELAY_BASE = 2000;
const ICE_RESTART_MAX_ATTEMPTS = 3;

const VideoChat = memo(function VideoChat({ socket, currentUser, users = [] }) {
  const [isInVideo, setIsInVideo] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [videoUsers, setVideoUsers] = useState([]);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const remoteVideosRef = useRef(new Map());
  const peerTimeoutsRef = useRef(new Map()); // v9: track connection timeouts
  const iceRestartAttemptsRef = useRef(new Map()); // v9: track ICE restart attempts
  const isInVideoRef = useRef(false); // v9: stable ref for cleanup
  const socketRef = useRef(socket);
  const mountedRef = useRef(true);

  // Keep refs in sync
  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { isInVideoRef.current = isInVideo; }, [isInVideo]);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // v9: Stable leaveVideo via ref to avoid stale closures
  const leaveVideoRef = useRef(null);

  const doLeaveVideo = useCallback(() => {
    // Stop all local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
      screenStreamRef.current = null;
    }
    // Clear all peer connection timeouts
    for (const [, timer] of peerTimeoutsRef.current) {
      clearTimeout(timer);
    }
    peerTimeoutsRef.current.clear();
    iceRestartAttemptsRef.current.clear();
    // Close all peer connections
    peersRef.current.forEach(({ pc }) => {
      try { pc.close(); } catch (e) {}
    });
    peersRef.current.clear();
    remoteVideosRef.current.clear();
    // Clean up remote video elements
    try {
      document.querySelectorAll('[id^="remote-video-"]').forEach(el => {
        try { el.srcObject = null; } catch (e) {}
      });
    } catch (e) {}

    if (socketRef.current) {
      socketRef.current.emit('video:leave');
    }

    if (mountedRef.current) {
      setIsInVideo(false);
      setIsCameraOn(true);
      setIsMicOn(true);
      setIsScreenSharing(false);
      setVideoUsers([]);
    }
  }, []);

  leaveVideoRef.current = doLeaveVideo;

  // Cleanup on unmount — uses ref, no stale closure
  useEffect(() => {
    return () => {
      if (leaveVideoRef.current && isInVideoRef.current) {
        leaveVideoRef.current();
      }
    };
  }, []);

  // ─── Create Peer Connection (v11: fixed dual-offer race) ────
  function createPeerConnection(targetSocketId, isInitiator, stream, userInfo = {}) {
    // v11: Dedup — if connection is alive, reuse it; if dead, clean up first
    const existingPeer = peersRef.current.get(targetSocketId);
    if (existingPeer) {
      const state = existingPeer.pc.connectionState;
      if (state !== 'failed' && state !== 'closed') {
        return existingPeer.pc;
      }
      // Dead connection — clean it up before creating new one
      cleanupPeer(targetSocketId, existingPeer.userId);
    }

    // v9: Max peer cap
    if (peersRef.current.size >= MAX_PEERS) {
      console.warn('[Video] Max peer cap reached, rejecting new connection');
      return null;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks
    if (stream) {
      stream.getTracks().forEach(track => {
        try { pc.addTrack(track, stream); } catch (e) {}
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('video:ice-candidate', { to: targetSocketId, candidate: event.candidate });
      }
    };

    // v10: Robust ontrack handler — attach stream + explicit play() for autoplay policy
    pc.ontrack = (event) => {
      if (!mountedRef.current) return;
      const remoteStream = event.streams[0];
      if (!remoteStream) return;
      remoteVideosRef.current.set(userInfo.userId, remoteStream);
      // Try to attach immediately if DOM element exists
      attachRemoteStream(userInfo.userId, remoteStream);
    };

    // v9: ICE restart on failure with backoff
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        if (peerTimeoutsRef.current.has(targetSocketId)) {
          clearTimeout(peerTimeoutsRef.current.get(targetSocketId));
          peerTimeoutsRef.current.delete(targetSocketId);
        }
        iceRestartAttemptsRef.current.delete(targetSocketId);
      } else if (state === 'disconnected') {
        setTimeout(() => {
          if (pc.connectionState === 'disconnected') {
            attemptIceRestart(targetSocketId, pc);
          }
        }, 3000);
      } else if (state === 'failed') {
        attemptIceRestart(targetSocketId, pc);
      } else if (state === 'closed') {
        cleanupPeer(targetSocketId, userInfo.userId);
      }
    };

    pc.onicecandidateerror = () => {
      // Silently handle ICE candidate errors
    };

    // v10: REMOVED onnegotiationneeded handler — it raced with the explicit
    // createOffer() below, sending duplicate offers that broke the handshake.
    // Renegotiation (e.g. screen share track swap) is handled via replaceTrack()
    // which does NOT require a new offer/answer exchange.

    peersRef.current.set(targetSocketId, { pc, userId: userInfo.userId, username: userInfo.username });

    // v9: Connection timeout
    const timeoutId = setTimeout(() => {
      if (pc.connectionState !== 'connected') {
        console.warn(`[Video] Peer ${targetSocketId} connection timeout`);
        cleanupPeer(targetSocketId, userInfo.userId);
      }
    }, PEER_CONNECT_TIMEOUT);
    peerTimeoutsRef.current.set(targetSocketId, timeoutId);

    // v10: Only the initiator creates and sends an offer
    if (isInitiator) {
      (async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (socketRef.current) {
            socketRef.current.emit('video:offer', { to: targetSocketId, offer: pc.localDescription });
          }
        } catch (err) {
          console.error('[Video] Create offer error:', err);
        }
      })();
    }

    return pc;
  }

  // v10: Helper to attach a remote stream to its video element + play()
  function attachRemoteStream(userId, stream) {
    if (!stream) return;
    const videoEl = document.getElementById(`remote-video-${userId}`);
    if (videoEl) {
      videoEl.srcObject = stream;
      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay blocked — retry on interaction
          const resume = () => {
            videoEl.play().catch(() => {});
            document.removeEventListener('click', resume);
          };
          document.addEventListener('click', resume, { once: true });
        });
      }
    }
  }

  // v9: ICE restart with backoff
  function attemptIceRestart(targetSocketId, pc) {
    const attempts = iceRestartAttemptsRef.current.get(targetSocketId) || 0;
    if (attempts >= ICE_RESTART_MAX_ATTEMPTS) {
      console.warn(`[Video] ICE restart failed after ${ICE_RESTART_MAX_ATTEMPTS} attempts for ${targetSocketId}`);
      const peer = peersRef.current.get(targetSocketId);
      cleanupPeer(targetSocketId, peer?.userId);
      return;
    }

    iceRestartAttemptsRef.current.set(targetSocketId, attempts + 1);
    const delay = ICE_RESTART_DELAY_BASE * Math.pow(2, attempts);

    setTimeout(async () => {
      try {
        if (pc.connectionState === 'closed') return;
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        if (socketRef.current) {
          socketRef.current.emit('video:offer', { to: targetSocketId, offer: pc.localDescription });
        }
      } catch (err) {
        console.error('[Video] ICE restart error:', err);
      }
    }, delay);
  }

  // v9: Safe peer cleanup
  function cleanupPeer(targetSocketId, userId) {
    if (peerTimeoutsRef.current.has(targetSocketId)) {
      clearTimeout(peerTimeoutsRef.current.get(targetSocketId));
      peerTimeoutsRef.current.delete(targetSocketId);
    }
    iceRestartAttemptsRef.current.delete(targetSocketId);

    const peer = peersRef.current.get(targetSocketId);
    if (peer) {
      try { peer.pc.close(); } catch (e) {}
      peersRef.current.delete(targetSocketId);
    }

    if (userId) {
      const el = document.getElementById(`remote-video-${userId}`);
      if (el) try { el.srcObject = null; } catch (e) {}
      remoteVideosRef.current.delete(userId);
    }
  }

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    const onVideoUserJoined = (user) => {
      if (!mountedRef.current) return;
      setVideoUsers(prev => {
        if (prev.find(u => u.userId === user.userId)) return prev;
        return [...prev, user];
      });
      // v11: Do NOT create an offer here! The new joiner will receive video:peers
      // and create offers TO US via isInitiator=true. We just wait for their offer
      // in onVideoOffer. Creating offers from both sides caused a dual-offer race.
    };

    const onVideoUserLeft = (data) => {
      if (!mountedRef.current) return;
      setVideoUsers(prev => prev.filter(u => u.userId !== data.userId));
      // Clean up all peer connections for this user
      for (const [sid, peer] of peersRef.current) {
        if (peer.userId === data.userId) {
          cleanupPeer(sid, data.userId);
        }
      }
    };

    const onVideoPeers = (peers) => {
      if (!mountedRef.current) return;
      setVideoUsers(peers);
      if (localStreamRef.current) {
        // v11: The joiner is the ONLY side that initiates offers.
        // Existing users do NOT send offers (fixed in onVideoUserJoined).
        // This eliminates the dual-offer race condition.
        peers.forEach(peer => {
          createPeerConnection(peer.socketId, true, localStreamRef.current, peer);
        });
      }
    };

    const onVideoOffer = async (data) => {
      if (!localStreamRef.current) return;
      try {
        let peer = peersRef.current.get(data.from);
        let pc;
        if (peer) {
          pc = peer.pc;
          // v10: Handle "glare" condition — both sides sent offers simultaneously.
          // If we're in have-local-offer state, we need to resolve the collision.
          // The "polite" peer (one with higher socket ID) rolls back its own offer.
          if (pc.signalingState === 'have-local-offer') {
            const isPolite = socket.id > data.from; // higher ID is polite (yields)
            if (!isPolite) {
              // We are impolite — ignore incoming offer, keep ours
              console.log('[Video] Glare: impolite peer, ignoring incoming offer');
              return;
            }
            // We are polite — rollback our offer and accept theirs
            console.log('[Video] Glare: polite peer, rolling back our offer');
            await pc.setLocalDescription({ type: 'rollback' });
          }
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        } else {
          pc = createPeerConnection(data.from, false, localStreamRef.current, { userId: data.userId, username: data.username });
          if (!pc) return; // max peers reached
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('video:answer', { to: data.from, answer });
      } catch (err) {
        console.error('[Video] Offer handling error:', err);
      }
    };

    const onVideoAnswer = async (data) => {
      const peer = peersRef.current.get(data.from);
      if (peer?.pc) {
        try {
          if (peer.pc.signalingState === 'have-local-offer') {
            await peer.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          }
        } catch (e) {
          console.error('[Video] Answer handling error:', e);
        }
      }
    };

    const onVideoIceCandidate = async (data) => {
      const peer = peersRef.current.get(data.from);
      if (peer?.pc && data.candidate) {
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          // Silently ignore late ICE candidates
        }
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
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [isInVideo, isCameraOn]);

  // v10: Re-attach remote streams whenever videoUsers changes
  // This handles the case where ontrack fires before the DOM element is rendered
  useEffect(() => {
    if (!isInVideo) return;
    // Give React a tick to render the new video elements
    const timer = setTimeout(() => {
      for (const [userId, stream] of remoteVideosRef.current) {
        attachRemoteStream(userId, stream);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [videoUsers, isInVideo]);

  // ─── Join Video ─────────────────────────────────────────────────
  const joinVideo = useCallback(async () => {
    if (!socket || isInVideo || connecting) return;
    setConnecting(true);
    setError('');

    try {
      // v9: getUserMedia with timeout protection
      const mediaPromise = navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 360, max: 720 },
          facingMode: 'user',
          frameRate: { ideal: 24, max: 30 },
        },
        audio: true,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('MEDIA_TIMEOUT')), 10000)
      );

      const stream = await Promise.race([mediaPromise, timeoutPromise]);

      if (!mountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setIsCameraOn(true);
      setIsMicOn(true);
      setIsInVideo(true);
      setConnecting(false);
      setExpanded(true);

      socket.emit('video:join', { userId: currentUser.userId, username: currentUser.username });
    } catch (err) {
      if (!mountedRef.current) return;
      setConnecting(false);
      if (err.message === 'MEDIA_TIMEOUT') {
        setError('Camera access timed out. Try again.');
      } else if (err.name === 'NotAllowedError') {
        setError('Camera permission denied. Check browser settings.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else if (err.name === 'NotReadableError') {
        setError('Camera is already in use by another app.');
      } else {
        setError('Failed to access camera. Try again.');
      }
    }
  }, [socket, isInVideo, connecting, currentUser]);

  // ─── Toggle Camera ──────────────────────────────────────────────
  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsCameraOn(videoTrack.enabled);
    }
  }, []);

  // ─── Toggle Mic ─────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicOn(audioTrack.enabled);
    }
  }, []);

  // ─── Screen Share ───────────────────────────────────────────────
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
        screenStreamRef.current = null;
      }
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          peersRef.current.forEach(({ pc }) => {
            try {
              const sender = pc.getSenders().find(s => s.track?.kind === 'video');
              if (sender) sender.replaceTrack(videoTrack).catch(() => {});
            } catch (e) {}
          });
        }
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      }
      setIsScreenSharing(false);
      if (socketRef.current) socketRef.current.emit('video:screen-share-stop');
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];

      peersRef.current.forEach(({ pc }) => {
        try {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack).catch(() => {});
        } catch (e) {}
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream;
      }

      screenTrack.onended = () => {
        if (!mountedRef.current) return;
        setIsScreenSharing(false);
        if (localStreamRef.current && localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          if (videoTrack) {
            peersRef.current.forEach(({ pc }) => {
              try {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) sender.replaceTrack(videoTrack).catch(() => {});
              } catch (e) {}
            });
          }
        }
        if (socketRef.current) socketRef.current.emit('video:screen-share-stop');
      };

      setIsScreenSharing(true);
      if (socketRef.current) socketRef.current.emit('video:screen-share-start');
    } catch (err) {
      // User cancelled — do nothing
    }
  }, [isScreenSharing]);

  const totalInCall = videoUsers.length + (isInVideo ? 1 : 0);

  // ─── NOT in video: compact join bar ─────────────────────────────
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

  // ─── IN video: video panel ──────────────────────────────────────
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
                  ref={(el) => { if (el && remoteVideosRef.current.has(user.userId)) { try { el.srcObject = remoteVideosRef.current.get(user.userId); } catch (e) {} } }} />
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
