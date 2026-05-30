/**
 * VoiceChat v15.0 — Production-Grade WebRTC Voice Chat (Complete Rewrite)
 *
 * Architecture:
 *  - Single-direction offer: ONLY the joiner (voice:peers receiver) creates offers.
 *    Existing users (voice:user-joined) wait for incoming offers and answer them.
 *  - ICE candidate queuing: candidates buffered until remoteDescription is set.
 *  - TURN server support for NAT traversal (STUN-only fails behind symmetric NATs).
 *  - All WebRTC state managed via refs (no stale closures).
 *  - Polite-peer glare handling as safety net for ICE restarts.
 *  - Explicit audio.play() with autoplay-policy fallback.
 *
 * Signaling flow:
 *  1. B clicks "Join Voice" → getUserMedia → emit('voice:join')
 *  2. Server adds B → broadcasts 'voice:user-joined' to A → sends 'voice:peers' to B
 *  3. B receives voice:peers → for each peer A: createOffer(A) → emit('voice:offer')
 *  4. A receives voice:offer → createPeerConnection → setRemoteDescription → createAnswer → emit('voice:answer')
 *  5. B receives voice:answer → setRemoteDescription → connection established
 *  6. ICE candidates exchanged in parallel via voice:ice-candidate
 *
 * made with <3 by Namish
 */

import { useState, useRef, useEffect, useCallback, memo } from 'react';

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
  // Use environment variable set by Next.js
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL;
  // Fallback: replace port in current origin
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    // Handle sandbox URLs like https://3000-xxx.sandbox.novita.ai → https://4000-xxx.sandbox.novita.ai
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
    console.log('[Voice] Fetched ICE servers from backend:', cachedIceServers.length, 'servers');
    return cachedIceServers;
  } catch (err) {
    console.warn('[Voice] Using fallback ICE servers:', err.message);
    return FALLBACK_ICE_SERVERS;
  }
}

const MAX_PEERS = 8;
const PEER_TIMEOUT_MS = 20000;    // 20s to establish connection
const ICE_RESTART_MAX = 2;        // max ICE restart attempts
const ICE_RESTART_DELAY = 3000;   // base delay for ICE restart

const VoiceChat = memo(function VoiceChat({ socket, currentUser }) {
  // ─── State ─────────────────────────────────────────────────────
  const [isInVoice, setIsInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [voiceUsers, setVoiceUsers] = useState([]);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioBars, setAudioBars] = useState([0, 0, 0]);

  // ─── Refs (all mutable state for WebRTC lives here, not in React state) ──
  const peers = useRef(new Map());          // socketId -> { pc, userId, username, iceCandidateQueue }
  const localStream = useRef(null);
  const audioElements = useRef(new Map());  // socketId -> HTMLAudioElement
  const audioCtx = useRef(null);
  const analyser = useRef(null);
  const animFrame = useRef(null);
  const mounted = useRef(true);
  const socketRef = useRef(socket);
  const peerTimers = useRef(new Map());     // socketId -> timeout id
  const iceRestarts = useRef(new Map());    // socketId -> attempt count
  const isDeafenedRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { isDeafenedRef.current = isDeafened; }, [isDeafened]);

  // ─── Mounted guard ─────────────────────────────────────────────
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      fullCleanup();
    };
  }, []);

  const safe = useCallback((fn) => { if (mounted.current) fn(); }, []);

  // ─── Full cleanup (all resources) ──────────────────────────────
  function fullCleanup() {
    stopAudioMonitor();
    // Stop local mic
    if (localStream.current) {
      localStream.current.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
      localStream.current = null;
    }
    // Close all peer connections
    for (const [sid, peer] of peers.current) {
      try { peer.pc.close(); } catch (e) {}
    }
    peers.current.clear();
    // Remove audio elements
    for (const [, el] of audioElements.current) {
      try { el.srcObject = null; el.remove(); } catch (e) {}
    }
    audioElements.current.clear();
    // Clear timers
    for (const t of peerTimers.current.values()) clearTimeout(t);
    peerTimers.current.clear();
    iceRestarts.current.clear();
    // Close AudioContext
    if (audioCtx.current) {
      try { audioCtx.current.close(); } catch (e) {}
      audioCtx.current = null;
    }
    // Tell server we left
    try { socketRef.current?.emit('voice:leave'); } catch (e) {}
  }

  // ─── Destroy a single peer ─────────────────────────────────────
  function destroyPeer(socketId) {
    const peer = peers.current.get(socketId);
    if (peer) {
      try { peer.pc.close(); } catch (e) {}
      peers.current.delete(socketId);
    }
    const el = audioElements.current.get(socketId);
    if (el) {
      try { el.srcObject = null; el.remove(); } catch (e) {}
      audioElements.current.delete(socketId);
    }
    const t = peerTimers.current.get(socketId);
    if (t) { clearTimeout(t); peerTimers.current.delete(socketId); }
    iceRestarts.current.delete(socketId);
  }

  // ─── Play remote audio stream ──────────────────────────────────
  function playRemoteAudio(stream, socketId) {
    if (!stream) return;
    let el = audioElements.current.get(socketId);
    if (!el) {
      el = document.createElement('audio');
      el.id = `voice-audio-${socketId}`;
      el.autoplay = true;
      el.playsInline = true;
      // MUST NOT set el.muted = true — that would silence remote audio
      document.body.appendChild(el);
      audioElements.current.set(socketId, el);
    }
    el.srcObject = stream;
    el.muted = isDeafenedRef.current;
    // Force play with autoplay policy fallback
    const p = el.play();
    if (p && p.catch) {
      p.catch(() => {
        // Retry on user gesture
        const retry = () => {
          el.play().catch(() => {});
          document.removeEventListener('click', retry);
          document.removeEventListener('keydown', retry);
        };
        document.addEventListener('click', retry, { once: true });
        document.addEventListener('keydown', retry, { once: true });
      });
    }
  }

  // ─── Create RTCPeerConnection ──────────────────────────────────
  async function makePeerConnection(targetSocketId, userId, username) {
    // Clean up stale connection if exists
    const existing = peers.current.get(targetSocketId);
    if (existing) {
      try { existing.pc.close(); } catch (e) {}
      peers.current.delete(targetSocketId);
    }
    if (peers.current.size >= MAX_PEERS) return null;

    // Fetch ICE servers from backend (cached, production-grade)
    const iceServers = await getIceServers();

    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 4,       // Pre-allocate ICE candidates for faster connection
      bundlePolicy: 'max-bundle',    // Multiplex all media on one transport
      rtcpMuxPolicy: 'require',      // Require RTCP muxing
    });

    const peerData = { pc, userId, username, iceCandidateQueue: [], remoteDescSet: false };
    peers.current.set(targetSocketId, peerData);

    // ICE candidates → send to remote
    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current) {
        socketRef.current.emit('voice:ice-candidate', {
          to: targetSocketId,
          candidate: e.candidate,
        });
      }
    };

    // Remote audio track received
    pc.ontrack = (e) => {
      const remoteStream = e.streams[0] || new MediaStream([e.track]);
      playRemoteAudio(remoteStream, targetSocketId);
    };

    // Connection state monitoring
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        // Success — clear timer and restart counter
        const t = peerTimers.current.get(targetSocketId);
        if (t) { clearTimeout(t); peerTimers.current.delete(targetSocketId); }
        iceRestarts.current.delete(targetSocketId);
      } else if (state === 'failed') {
        attemptIceRestart(targetSocketId, pc);
      } else if (state === 'disconnected') {
        // Wait before treating as failure — often recovers
        setTimeout(() => {
          if (mounted.current && pc.connectionState === 'disconnected') {
            attemptIceRestart(targetSocketId, pc);
          }
        }, 5000);
      }
    };

    // Connection timeout
    const timer = setTimeout(() => {
      const p = peers.current.get(targetSocketId);
      if (p && p.pc.connectionState !== 'connected') {
        console.warn('[Voice] Peer timeout:', targetSocketId);
        destroyPeer(targetSocketId);
      }
      peerTimers.current.delete(targetSocketId);
    }, PEER_TIMEOUT_MS);
    peerTimers.current.set(targetSocketId, timer);

    return pc;
  }

  // ─── Flush queued ICE candidates after remoteDescription is set ──
  async function flushIceCandidates(socketId) {
    const peer = peers.current.get(socketId);
    if (!peer) return;
    peer.remoteDescSet = true;
    for (const candidate of peer.iceCandidateQueue) {
      try { await peer.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
    }
    peer.iceCandidateQueue = [];
  }

  // ─── ICE restart with backoff ──────────────────────────────────
  function attemptIceRestart(socketId, pc) {
    const attempts = iceRestarts.current.get(socketId) || 0;
    if (attempts >= ICE_RESTART_MAX) {
      destroyPeer(socketId);
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
        socketRef.current?.emit('voice:offer', { to: socketId, offer: pc.localDescription });
      } catch (e) {
        destroyPeer(socketId);
      }
    }, ICE_RESTART_DELAY * Math.pow(2, attempts));
  }

  // ─── JOINER: Create offer to an existing peer ──────────────────
  async function sendOffer(targetSocketId, username, userId) {
    if (!localStream.current || !socketRef.current) return;
    try {
      const pc = await makePeerConnection(targetSocketId, userId, username);
      if (!pc) return;
      // Add our audio tracks to the connection
      localStream.current.getTracks().forEach(t => {
        pc.addTrack(t, localStream.current);
      });
      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current.emit('voice:offer', {
        to: targetSocketId,
        offer: pc.localDescription,
      });
    } catch (err) {
      console.error('[Voice] sendOffer error:', err);
      destroyPeer(targetSocketId);
    }
  }

  // ─── Socket event handlers ─────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Joiner receives list of existing voice users → send offers to each
    const onPeers = (peerList) => {
      safe(() => setVoiceUsers(peerList.map(p => ({ userId: p.userId, username: p.username }))));
      peerList.forEach(p => sendOffer(p.socketId, p.username, p.userId));
    };

    // A new user joined voice → update UI only, do NOT send offer
    // (the new user will send us an offer via voice:peers → sendOffer)
    const onUserJoined = (data) => {
      safe(() => setVoiceUsers(prev => {
        if (prev.find(u => u.userId === data.userId)) return prev;
        return [...prev, { userId: data.userId, username: data.username }];
      }));
    };

    // A user left voice → cleanup
    const onUserLeft = (data) => {
      safe(() => setVoiceUsers(prev => prev.filter(u => u.userId !== data.userId)));
      for (const [sid, peer] of peers.current) {
        if (peer.userId === data.userId) destroyPeer(sid);
      }
    };

    // Incoming offer → we are the answerer
    const onOffer = async (data) => {
      if (!localStream.current) return;
      try {
        let peer = peers.current.get(data.from);
        let pc;

        if (peer) {
          pc = peer.pc;
          // Glare handling: both sent offers (e.g. ICE restart race)
          if (pc.signalingState === 'have-local-offer') {
            // Polite peer = higher socket ID → rolls back
            const weArePolite = socket.id > data.from;
            if (!weArePolite) return; // impolite → keep our offer, ignore theirs
            await pc.setLocalDescription({ type: 'rollback' });
          }
        } else {
          // First time receiving offer from this peer — create PC and add tracks
          pc = await makePeerConnection(data.from, data.userId, data.username);
          if (!pc) return;
          localStream.current.getTracks().forEach(t => {
            pc.addTrack(t, localStream.current);
          });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        await flushIceCandidates(data.from);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current?.emit('voice:answer', { to: data.from, answer: pc.localDescription });
      } catch (err) {
        console.error('[Voice] onOffer error:', err);
        destroyPeer(data.from);
      }
    };

    // Incoming answer → we are the offerer
    const onAnswer = async (data) => {
      const peer = peers.current.get(data.from);
      if (!peer) return;
      try {
        if (peer.pc.signalingState === 'have-local-offer') {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          await flushIceCandidates(data.from);
        }
      } catch (err) {
        console.error('[Voice] onAnswer error:', err);
      }
    };

    // Incoming ICE candidate → queue if remote desc not set yet
    const onIceCandidate = async (data) => {
      const peer = peers.current.get(data.from);
      if (!peer || !data.candidate) return;
      if (peer.remoteDescSet) {
        try { await peer.pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) {}
      } else {
        peer.iceCandidateQueue.push(data.candidate);
      }
    };

    socket.on('voice:peers', onPeers);
    socket.on('voice:user-joined', onUserJoined);
    socket.on('voice:user-left', onUserLeft);
    socket.on('voice:offer', onOffer);
    socket.on('voice:answer', onAnswer);
    socket.on('voice:ice-candidate', onIceCandidate);

    return () => {
      socket.off('voice:peers', onPeers);
      socket.off('voice:user-joined', onUserJoined);
      socket.off('voice:user-left', onUserLeft);
      socket.off('voice:offer', onOffer);
      socket.off('voice:answer', onAnswer);
      socket.off('voice:ice-candidate', onIceCandidate);
    };
  }, [socket]);

  // ─── Audio monitoring (visualizer) ─────────────────────────────
  function startAudioMonitor(stream) {
    try {
      if (!audioCtx.current || audioCtx.current.state === 'closed') {
        audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.current.state === 'suspended') {
        audioCtx.current.resume().catch(() => {});
      }
      const src = audioCtx.current.createMediaStreamSource(stream);
      const a = audioCtx.current.createAnalyser();
      a.fftSize = 256;
      a.smoothingTimeConstant = 0.5;
      src.connect(a);
      analyser.current = { analyser: a, src };

      const data = new Uint8Array(a.frequencyBinCount);
      const tick = () => {
        if (!mounted.current) return;
        a.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setAudioLevel(Math.min(1, avg / 80));
        const third = Math.floor(data.length / 3);
        const low = data.slice(0, third).reduce((a, b) => a + b, 0) / third / 128;
        const mid = data.slice(third, third * 2).reduce((a, b) => a + b, 0) / third / 128;
        const high = data.slice(third * 2).reduce((a, b) => a + b, 0) / third / 128;
        setAudioBars([Math.min(1, low), Math.min(1, mid), Math.min(1, high)]);
        animFrame.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {}
  }

  function stopAudioMonitor() {
    if (animFrame.current) { cancelAnimationFrame(animFrame.current); animFrame.current = null; }
    if (analyser.current?.src) { try { analyser.current.src.disconnect(); } catch (e) {} }
    analyser.current = null;
    if (audioCtx.current?.state === 'running') { audioCtx.current.suspend().catch(() => {}); }
    safe(() => { setAudioLevel(0); setAudioBars([0, 0, 0]); });
  }

  // ─── Join / Leave ──────────────────────────────────────────────
  const joinVoice = useCallback(async () => {
    if (!mounted.current || !socketRef.current) return;
    safe(() => { setError(''); setConnecting(true); });
    try {
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
          },
          video: false,
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('MIC_TIMEOUT')), 10000)),
      ]);
      if (!mounted.current) { stream.getTracks().forEach(t => t.stop()); return; }

      localStream.current = stream;
      safe(() => { setIsInVoice(true); setConnecting(false); });
      startAudioMonitor(stream);
      socketRef.current.emit('voice:join');
    } catch (err) {
      if (!mounted.current) return;
      safe(() => setConnecting(false));
      const msg =
        err.name === 'NotAllowedError' ? 'Microphone access denied. Check browser permissions.' :
        err.name === 'NotFoundError' ? 'No microphone found.' :
        err.message === 'MIC_TIMEOUT' ? 'Microphone request timed out.' :
        'Could not access microphone.';
      safe(() => setError(msg));
    }
  }, []);

  const leaveVoice = useCallback(() => {
    stopAudioMonitor();
    if (localStream.current) {
      localStream.current.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
      localStream.current = null;
    }
    for (const [sid] of peers.current) destroyPeer(sid);
    safe(() => {
      setIsInVoice(false);
      setIsMuted(false);
      setIsDeafened(false);
      setVoiceUsers([]);
      setAudioLevel(0);
      setAudioBars([0, 0, 0]);
    });
    socketRef.current?.emit('voice:leave');
  }, []);

  const toggleMute = useCallback(() => {
    if (!localStream.current) return;
    const newMuted = !isMuted;
    localStream.current.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    setIsMuted(newMuted);
  }, [isMuted]);

  const toggleDeafen = useCallback(() => {
    const newDeaf = !isDeafened;
    setIsDeafened(newDeaf);
    for (const el of audioElements.current.values()) { el.muted = newDeaf; }
    if (newDeaf && !isMuted) {
      localStream.current?.getAudioTracks().forEach(t => { t.enabled = false; });
      setIsMuted(true);
    } else if (!newDeaf && isMuted) {
      localStream.current?.getAudioTracks().forEach(t => { t.enabled = true; });
      setIsMuted(false);
    }
  }, [isDeafened, isMuted]);

  // ─── Render ────────────────────────────────────────────────────
  const totalInCall = voiceUsers.length + (isInVoice ? 1 : 0);

  return (
    <div className="px-2 sm:px-3 py-2 bg-[#19191c] border-b border-[#282828] flex-shrink-0">
      {/* Main row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Mic icon with audio bars */}
          <div className="relative flex-shrink-0">
            {isInVoice && !isMuted && audioLevel > 0.05 ? (
              <div className="w-6 h-6 rounded-full flex items-center justify-center gap-[2px]"
                style={{
                  background: `rgba(91, 216, 130, ${0.08 + audioLevel * 0.12})`,
                  boxShadow: audioLevel > 0.15 ? `0 0 ${4 + audioLevel * 10}px rgba(91, 216, 130, ${audioLevel * 0.25})` : 'none',
                  transition: 'box-shadow 0.1s, background 0.2s',
                }}>
                {audioBars.map((bar, i) => (
                  <div key={i} className="w-[2px] rounded-full bg-[#5bd882] transition-all duration-75"
                    style={{ height: `${Math.max(3, bar * 12)}px` }} />
                ))}
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{
                  background: isInVoice
                    ? (isMuted ? 'rgba(255, 107, 107, 0.12)' : 'rgba(91, 216, 130, 0.08)')
                    : 'rgba(255,255,255,0.03)',
                }}>
                {isMuted || isDeafened ? (
                  <svg className="w-3 h-3 text-[#ff6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : (
                  <svg className={`w-3 h-3 ${isInVoice ? 'text-[#5bd882]' : 'text-[#555]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
              </div>
            )}
            {/* Speaking pulse */}
            {isInVoice && !isMuted && audioLevel > 0.2 && (
              <div className="absolute inset-0 rounded-full border border-[#5bd882]/30 animate-ping" style={{ animationDuration: '1.5s' }} />
            )}
          </div>

          <div className="min-w-0">
            <span className="text-[11px] font-mono text-[#888] block truncate">
              {isInVoice ? (
                <span className={isDeafened ? 'text-[#ff6b6b]' : isMuted ? 'text-[#ff6b6b]' : 'text-[#5bd882]'}>
                  {isDeafened ? 'deafened' : isMuted ? 'muted' : 'live'}
                  <span className="text-[#666]"> · {totalInCall} in call</span>
                </span>
              ) : (
                'voice chat'
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {isInVoice && (
            <>
              {/* Mute button */}
              <button onClick={toggleMute}
                className={`p-2 sm:p-1.5 rounded-lg transition-all active:scale-90 ${
                  isMuted
                    ? 'bg-[#ff6b6b]/15 text-[#ff6b6b] hover:bg-[#ff6b6b]/25'
                    : 'bg-[#222] text-[#aaa] hover:text-white hover:bg-[#2a2b30]'
                }`}
                title={isMuted ? 'Unmute' : 'Mute'}>
                {isMuted ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
              </button>

              {/* Deafen button */}
              <button onClick={toggleDeafen}
                className={`p-2 sm:p-1.5 rounded-lg transition-all active:scale-90 ${
                  isDeafened
                    ? 'bg-[#ff6b6b]/15 text-[#ff6b6b] hover:bg-[#ff6b6b]/25'
                    : 'bg-[#222] text-[#aaa] hover:text-white hover:bg-[#2a2b30]'
                }`}
                title={isDeafened ? 'Undeafen' : 'Deafen'}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isDeafened ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  ) : (
                    <>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </>
                  )}
                </svg>
              </button>
            </>
          )}

          <button
            onClick={isInVoice ? leaveVoice : joinVoice}
            disabled={connecting}
            className={`text-[10px] sm:text-[10px] px-3 py-1.5 rounded-lg font-mono transition-all active:scale-95 disabled:opacity-50 ${
              isInVoice
                ? 'bg-[#ff6b6b]/12 hover:bg-[#ff6b6b]/22 text-[#ff6b6b] border border-[#ff6b6b]/15'
                : 'bg-[#5bd882]/12 hover:bg-[#5bd882]/22 text-[#5bd882] border border-[#5bd882]/15'
            }`}
          >
            {connecting ? (
              <span className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 border border-[#5bd882] border-t-transparent rounded-full animate-spin" />
                joining...
              </span>
            ) : isInVoice ? 'leave' : 'join voice'}
          </button>
        </div>
      </div>

      {/* Error */}
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
});

export default VoiceChat;
