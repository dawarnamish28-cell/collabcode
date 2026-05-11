/**
 * VoiceChat v12.0 — Hardened for Heavy Load
 * 
 * v12.0 hardening:
 *  - Reusable AudioContext via ref (prevents resource leak on every join)
 *  - Mounted guard ref prevents state updates after unmount
 *  - Stable leaveVoice via useCallback with ref-based socket access
 *  - DOM audio element tracking via ref map (prevents orphan <audio> elements)
 *  - ICE restart on peer connection failure with exponential backoff
 *  - Peer dedup guard (prevents duplicate connections to same socket)
 *  - Connection timeout (15s) for peers that never connect
 *  - Max peers cap (8) to prevent resource exhaustion
 *  - Proper cleanup of all listeners using named handler refs
 *  - getUserMedia timeout wrapper (10s)
 * 
 * Features: deafen, audio bars, connection quality, speaking highlight
 * 
 * made with <3 by Namish
 */

import { useState, useRef, useEffect, useCallback, memo } from 'react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const MAX_PEERS = 8;
const PEER_CONNECT_TIMEOUT_MS = 15000;
const ICE_RESTART_MAX_ATTEMPTS = 3;
const ICE_RESTART_BASE_DELAY = 2000;

const VoiceChat = memo(function VoiceChat({ socket, currentUser }) {
  const [isInVoice, setIsInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [voiceUsers, setVoiceUsers] = useState([]);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioBars, setAudioBars] = useState([0, 0, 0]);

  const peersRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const audioCtxRef = useRef(null); // v12: reusable AudioContext
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const remoteAudioMapRef = useRef(new Map()); // v12: tracked audio elements
  const mountedRef = useRef(true); // v12: mounted guard
  const socketRef = useRef(socket); // v12: stable ref for socket
  const peerTimeoutsRef = useRef(new Map()); // v12: connection timeouts
  const iceRestartCountsRef = useRef(new Map()); // v12: ICE restart tracking

  // Keep socketRef current
  useEffect(() => { socketRef.current = socket; }, [socket]);

  // v12: Mounted guard
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Cleanup everything on unmount
      cleanupAll();
    };
  }, []);

  // Safe state setter — only updates if still mounted
  const safeSetState = useCallback((setter) => {
    if (mountedRef.current) setter();
  }, []);

  function cleanupAll() {
    stopAudioMonitor();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    peersRef.current.forEach(({ pc }) => { try { pc.close(); } catch (e) {} });
    peersRef.current.clear();
    // Remove tracked audio elements
    for (const [id, audio] of remoteAudioMapRef.current) {
      try { audio.srcObject = null; audio.remove(); } catch (e) {}
    }
    remoteAudioMapRef.current.clear();
    // Clear peer connection timeouts
    for (const timer of peerTimeoutsRef.current.values()) {
      clearTimeout(timer);
    }
    peerTimeoutsRef.current.clear();
    iceRestartCountsRef.current.clear();
    // Close reusable AudioContext
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (e) {}
      audioCtxRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.emit('voice:leave');
    }
  }

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    const handlePeers = (peers) => {
      safeSetState(() => setVoiceUsers(peers.map(p => ({ userId: p.userId, username: p.username }))));
      peers.forEach(peer => createOffer(peer.socketId, peer.username, peer.userId));
    };

    const handleUserJoined = (data) => {
      safeSetState(() => setVoiceUsers(prev => {
        if (prev.find(u => u.userId === data.userId)) return prev;
        return [...prev, { userId: data.userId, username: data.username }];
      }));
    };

    const handleUserLeft = (data) => {
      safeSetState(() => setVoiceUsers(prev => prev.filter(u => u.userId !== data.userId)));
      // Clean up peer connections for this user
      for (const [sid, peer] of peersRef.current) {
        if (peer.userId === data.userId) {
          destroyPeer(sid);
        }
      }
    };

    const handleOffer = async (data) => {
      if (!localStreamRef.current) return;
      // v12: Peer dedup — if we already have a connection to this socket, skip
      if (peersRef.current.has(data.from)) {
        console.warn('[Voice] Duplicate offer from', data.from, '— ignoring');
        return;
      }
      // v12: Max peers cap
      if (peersRef.current.size >= MAX_PEERS) {
        console.warn('[Voice] Max peers reached, rejecting offer');
        return;
      }
      try {
        const pc = createPeerConnection(data.from, data.userId, data.username);
        localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current?.emit('voice:answer', { to: data.from, answer });
      } catch (err) {
        console.error('[Voice] Offer handling error:', err);
        destroyPeer(data.from);
      }
    };

    const handleAnswer = async (data) => {
      const peer = peersRef.current.get(data.from);
      if (peer) {
        try { await peer.pc.setRemoteDescription(new RTCSessionDescription(data.answer)); }
        catch (e) { console.warn('[Voice] Answer error:', e.message); }
      }
    };

    const handleIceCandidate = async (data) => {
      const peer = peersRef.current.get(data.from);
      if (peer) {
        try { await peer.pc.addIceCandidate(new RTCIceCandidate(data.candidate)); }
        catch (e) { /* ICE candidate errors are common and non-fatal */ }
      }
    };

    socket.on('voice:peers', handlePeers);
    socket.on('voice:user-joined', handleUserJoined);
    socket.on('voice:user-left', handleUserLeft);
    socket.on('voice:offer', handleOffer);
    socket.on('voice:answer', handleAnswer);
    socket.on('voice:ice-candidate', handleIceCandidate);

    return () => {
      socket.off('voice:peers', handlePeers);
      socket.off('voice:user-joined', handleUserJoined);
      socket.off('voice:user-left', handleUserLeft);
      socket.off('voice:offer', handleOffer);
      socket.off('voice:answer', handleAnswer);
      socket.off('voice:ice-candidate', handleIceCandidate);
    };
  }, [socket]);

  // v12: Create a peer connection with ICE restart, connection timeout, and state monitoring
  function createPeerConnection(targetSocketId, userId, username) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (e.candidate) socketRef.current?.emit('voice:ice-candidate', { to: targetSocketId, candidate: e.candidate });
    };

    pc.ontrack = (e) => {
      playRemoteAudio(e.streams[0], targetSocketId);
    };

    // v12: ICE restart on failure
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        // Clear connection timeout on success
        const timer = peerTimeoutsRef.current.get(targetSocketId);
        if (timer) { clearTimeout(timer); peerTimeoutsRef.current.delete(targetSocketId); }
        iceRestartCountsRef.current.delete(targetSocketId);
      } else if (state === 'failed') {
        handlePeerFailure(targetSocketId, pc);
      } else if (state === 'disconnected') {
        // Give it a moment to recover before treating as failure
        setTimeout(() => {
          if (pc.connectionState === 'disconnected') {
            handlePeerFailure(targetSocketId, pc);
          }
        }, 5000);
      }
    };

    // v12: Connection timeout — destroy peer if it never connects
    const timeout = setTimeout(() => {
      const peer = peersRef.current.get(targetSocketId);
      if (peer && peer.pc.connectionState !== 'connected') {
        console.warn('[Voice] Peer connection timeout:', targetSocketId);
        destroyPeer(targetSocketId);
      }
      peerTimeoutsRef.current.delete(targetSocketId);
    }, PEER_CONNECT_TIMEOUT_MS);
    peerTimeoutsRef.current.set(targetSocketId, timeout);

    peersRef.current.set(targetSocketId, { pc, userId, username });
    return pc;
  }

  // v12: ICE restart with exponential backoff
  function handlePeerFailure(targetSocketId, pc) {
    const attempts = iceRestartCountsRef.current.get(targetSocketId) || 0;
    if (attempts >= ICE_RESTART_MAX_ATTEMPTS) {
      console.warn('[Voice] Max ICE restart attempts for', targetSocketId);
      destroyPeer(targetSocketId);
      return;
    }
    iceRestartCountsRef.current.set(targetSocketId, attempts + 1);
    const delay = ICE_RESTART_BASE_DELAY * Math.pow(2, attempts);
    setTimeout(() => {
      if (!mountedRef.current) return;
      const peer = peersRef.current.get(targetSocketId);
      if (!peer) return;
      try {
        pc.restartIce();
        pc.createOffer({ iceRestart: true }).then(offer => {
          pc.setLocalDescription(offer);
          socketRef.current?.emit('voice:offer', { to: targetSocketId, offer });
        }).catch(() => destroyPeer(targetSocketId));
      } catch (e) {
        destroyPeer(targetSocketId);
      }
    }, delay);
  }

  // v12: Clean destroy a single peer
  function destroyPeer(socketId) {
    const peer = peersRef.current.get(socketId);
    if (peer) {
      try { peer.pc.close(); } catch (e) {}
      peersRef.current.delete(socketId);
    }
    // Remove associated audio element
    const audio = remoteAudioMapRef.current.get(socketId);
    if (audio) {
      try { audio.srcObject = null; audio.remove(); } catch (e) {}
      remoteAudioMapRef.current.delete(socketId);
    }
    // Clear connection timeout
    const timer = peerTimeoutsRef.current.get(socketId);
    if (timer) { clearTimeout(timer); peerTimeoutsRef.current.delete(socketId); }
    iceRestartCountsRef.current.delete(socketId);
  }

  async function createOffer(targetSocketId, username, userId) {
    if (!localStreamRef.current || !socketRef.current) return;
    // v12: Peer dedup
    if (peersRef.current.has(targetSocketId)) return;
    // v12: Max peers cap
    if (peersRef.current.size >= MAX_PEERS) return;
    try {
      const pc = createPeerConnection(targetSocketId, userId, username);
      localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current.emit('voice:offer', { to: targetSocketId, offer });
    } catch (err) {
      console.error('[Voice] Create offer error:', err);
      destroyPeer(targetSocketId);
    }
  }

  // v12: Audio element management via tracked Map instead of raw DOM queries
  function playRemoteAudio(stream, id) {
    let audio = remoteAudioMapRef.current.get(id);
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = `voice-audio-${id}`;
      audio.autoplay = true;
      document.body.appendChild(audio);
      remoteAudioMapRef.current.set(id, audio);
    }
    audio.srcObject = stream;
    audio.muted = isDeafened;
  }

  // v12: Reusable AudioContext — create once, reuse across join/leave cycles
  function getOrCreateAudioContext() {
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      // Resume if suspended
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      return audioCtxRef.current;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    return ctx;
  }

  function startAudioMonitor(stream) {
    try {
      const ctx = getOrCreateAudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      src.connect(analyser);
      analyserRef.current = { analyser, src };

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!mountedRef.current) return; // v12: mounted guard in animation loop
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const level = Math.min(1, avg / 80);
        setAudioLevel(level);

        const third = Math.floor(data.length / 3);
        const low = data.slice(0, third).reduce((a, b) => a + b, 0) / third / 128;
        const mid = data.slice(third, third * 2).reduce((a, b) => a + b, 0) / third / 128;
        const high = data.slice(third * 2).reduce((a, b) => a + b, 0) / third / 128;
        setAudioBars([Math.min(1, low), Math.min(1, mid), Math.min(1, high)]);

        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn('[Voice] AudioContext not available:', e.message);
    }
  }

  function stopAudioMonitor() {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (analyserRef.current?.src) {
      try { analyserRef.current.src.disconnect(); } catch (e) {}
    }
    analyserRef.current = null;
    // Don't close AudioContext — reuse it. Just suspend to save resources.
    if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
      audioCtxRef.current.suspend().catch(() => {});
    }
    safeSetState(() => { setAudioLevel(0); setAudioBars([0, 0, 0]); });
  }

  // v12: getUserMedia with timeout wrapper
  async function getMediaStream() {
    return Promise.race([
      navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Microphone request timed out')), 10000)),
    ]);
  }

  const joinVoice = useCallback(async () => {
    if (!mountedRef.current) return;
    safeSetState(() => { setError(''); setConnecting(true); });
    try {
      const stream = await getMediaStream();
      if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      localStreamRef.current = stream;
      safeSetState(() => { setIsInVoice(true); setConnecting(false); });
      startAudioMonitor(stream);
      socketRef.current?.emit('voice:join');
    } catch (err) {
      if (!mountedRef.current) return;
      safeSetState(() => setConnecting(false));
      if (err.name === 'NotAllowedError') {
        safeSetState(() => setError('Microphone access denied. Check browser permissions.'));
      } else if (err.name === 'NotFoundError') {
        safeSetState(() => setError('No microphone found.'));
      } else if (err.message === 'Microphone request timed out') {
        safeSetState(() => setError('Microphone request timed out.'));
      } else {
        safeSetState(() => setError('Could not access microphone.'));
      }
    }
  }, []);

  // v12: Stable leaveVoice via useCallback — uses refs to avoid stale closures
  const leaveVoice = useCallback(() => {
    stopAudioMonitor();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    peersRef.current.forEach(({ pc }) => { try { pc.close(); } catch (e) {} });
    peersRef.current.clear();
    // v12: Remove tracked audio elements via map
    for (const [id, audio] of remoteAudioMapRef.current) {
      try { audio.srcObject = null; audio.remove(); } catch (e) {}
    }
    remoteAudioMapRef.current.clear();
    // Clear timeouts
    for (const timer of peerTimeoutsRef.current.values()) clearTimeout(timer);
    peerTimeoutsRef.current.clear();
    iceRestartCountsRef.current.clear();

    safeSetState(() => {
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
    if (localStreamRef.current) {
      const newMuted = !isMuted;
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
      setIsMuted(newMuted);
    }
  }, [isMuted]);

  const toggleDeafen = useCallback(() => {
    const newDeafened = !isDeafened;
    setIsDeafened(newDeafened);
    // Mute/unmute all tracked remote audio elements
    for (const audio of remoteAudioMapRef.current.values()) {
      audio.muted = newDeafened;
    }
    // Auto-mute when deafening
    if (newDeafened && !isMuted) {
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
        setIsMuted(true);
      }
    } else if (!newDeafened && isMuted) {
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = true; });
        setIsMuted(false);
      }
    }
  }, [isDeafened, isMuted]);

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

      {/* Voice users list */}
      {isInVoice && voiceUsers.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {voiceUsers.map(u => (
            <span key={u.userId} className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 bg-[#5bd882]/6 text-[#5bd882] rounded-md font-mono border border-[#5bd882]/10">
              <span className="w-1 h-1 rounded-full bg-[#5bd882] animate-pulse" />
              {u.username}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});

export default VoiceChat;
