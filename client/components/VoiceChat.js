/**
 * VoiceChat v11.0 — Enhanced, responsive, visual
 * 
 * IMPROVEMENTS:
 * - Real-time waveform visualizer (mini bars)
 * - Better state transitions (idle -> connecting -> live -> muted)
 * - Animated speaking indicators for remote users
 * - Clearer error messages with retry button
 * - Smooth transitions between states
 * - Accessibility improvements
 * 
 * made with <3 by Namish
 */

import { useState, useRef, useEffect, useCallback, memo } from 'react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const VoiceChat = memo(function VoiceChat({ socket, currentUser }) {
  const [isInVoice, setIsInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceUsers, setVoiceUsers] = useState([]);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [waveformData, setWaveformData] = useState(new Array(12).fill(0));
  const peersRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);

  useEffect(() => {
    return () => { leaveVoice(); };
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('voice:peers', (peers) => {
      setVoiceUsers(peers.map(p => ({ userId: p.userId, username: p.username })));
      peers.forEach(peer => createOffer(peer.socketId, peer.username));
    });

    socket.on('voice:user-joined', (data) => {
      setVoiceUsers(prev => {
        if (prev.find(u => u.userId === data.userId)) return prev;
        return [...prev, { userId: data.userId, username: data.username }];
      });
    });

    socket.on('voice:user-left', (data) => {
      setVoiceUsers(prev => prev.filter(u => u.userId !== data.userId));
      for (const [sid, peer] of peersRef.current) {
        if (peer.userId === data.userId) {
          peer.pc.close();
          peersRef.current.delete(sid);
        }
      }
    });

    socket.on('voice:offer', async (data) => {
      if (!localStreamRef.current) return;
      try {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
        pc.onicecandidate = (e) => { if (e.candidate) socket.emit('voice:ice-candidate', { to: data.from, candidate: e.candidate }); };
        pc.ontrack = (e) => { playRemoteAudio(e.streams[0], data.from); };
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('voice:answer', { to: data.from, answer });
        peersRef.current.set(data.from, { pc, userId: data.userId, username: data.username });
      } catch (err) { console.error('[Voice] Offer handling error:', err); }
    });

    socket.on('voice:answer', async (data) => {
      const peer = peersRef.current.get(data.from);
      if (peer) { try { await peer.pc.setRemoteDescription(new RTCSessionDescription(data.answer)); } catch (e) {} }
    });

    socket.on('voice:ice-candidate', async (data) => {
      const peer = peersRef.current.get(data.from);
      if (peer) { try { await peer.pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) {} }
    });

    return () => {
      ['voice:peers', 'voice:user-joined', 'voice:user-left', 'voice:offer', 'voice:answer', 'voice:ice-candidate'].forEach(e => socket.off(e));
    };
  }, [socket]);

  async function createOffer(targetSocketId, username) {
    if (!localStreamRef.current || !socket) return;
    try {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
      pc.onicecandidate = (e) => { if (e.candidate) socket.emit('voice:ice-candidate', { to: targetSocketId, candidate: e.candidate }); };
      pc.ontrack = (e) => { playRemoteAudio(e.streams[0], targetSocketId); };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('voice:offer', { to: targetSocketId, offer });
      peersRef.current.set(targetSocketId, { pc, username });
    } catch (err) { console.error('[Voice] Create offer error:', err); }
  }

  function playRemoteAudio(stream, id) {
    let audio = document.getElementById(`voice-audio-${id}`);
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = `voice-audio-${id}`;
      audio.autoplay = true;
      document.body.appendChild(audio);
    }
    audio.srcObject = stream;
  }

  // Audio level + waveform monitoring
  function startAudioMonitor(stream) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.4;
      src.connect(analyser);
      analyserRef.current = { analyser, ctx };

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setAudioLevel(Math.min(1, avg / 80));

        // Create waveform bars (sample 12 evenly spaced values)
        const bars = [];
        const step = Math.floor(data.length / 12);
        for (let i = 0; i < 12; i++) {
          bars.push(Math.min(1, data[i * step] / 200));
        }
        setWaveformData(bars);

        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {}
  }

  function stopAudioMonitor() {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (analyserRef.current?.ctx) {
      try { analyserRef.current.ctx.close(); } catch (e) {}
    }
    analyserRef.current = null;
    setAudioLevel(0);
    setWaveformData(new Array(12).fill(0));
  }

  async function joinVoice() {
    setError('');
    setConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setIsInVoice(true);
      setConnecting(false);
      startAudioMonitor(stream);
      socket.emit('voice:join');
    } catch (err) {
      setConnecting(false);
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied. Check browser permissions.');
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found.');
      } else {
        setError('Could not access microphone.');
      }
      console.error('[Voice] Mic error:', err);
    }
  }

  function leaveVoice() {
    stopAudioMonitor();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    peersRef.current.forEach(({ pc }) => pc.close());
    peersRef.current.clear();
    document.querySelectorAll('[id^="voice-audio-"]').forEach(el => el.remove());
    setIsInVoice(false);
    setIsMuted(false);
    setVoiceUsers([]);
    setAudioLevel(0);
    setWaveformData(new Array(12).fill(0));
    if (socket) socket.emit('voice:leave');
  }

  function toggleMute() {
    if (localStreamRef.current) {
      const newMuted = !isMuted;
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
      setIsMuted(newMuted);
    }
  }

  const totalInCall = voiceUsers.length + (isInVoice ? 1 : 0);

  return (
    <div className="px-2 sm:px-3 py-2 bg-[#19191c] border-b border-[#282828] flex-shrink-0">
      {/* Main row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Mic icon with audio level */}
          <div className="relative flex-shrink-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 ${
              isInVoice
                ? isMuted
                  ? 'bg-[#ff6b6b]/12'
                  : 'bg-[#5bd882]/10'
                : 'bg-white/[0.03]'
            } ${isInVoice && !isMuted && audioLevel > 0.1 ? 'voice-active-ring' : ''}`}
              style={{
                boxShadow: isInVoice && !isMuted && audioLevel > 0.1
                  ? `0 0 ${4 + audioLevel * 14}px rgba(91, 216, 130, ${audioLevel * 0.3})`
                  : 'none',
              }}>
              {isMuted ? (
                <svg className="w-3.5 h-3.5 text-[#ff6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className={`w-3.5 h-3.5 transition-colors ${isInVoice ? 'text-[#5bd882]' : 'text-[#555]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </div>
          </div>

          {/* Status + Waveform */}
          <div className="min-w-0 flex items-center gap-2">
            <span className="text-[11px] font-mono text-[#888] truncate">
              {connecting ? (
                <span className="text-[#ffb347] flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 border border-[#ffb347] border-t-transparent rounded-full animate-spin" />
                  connecting...
                </span>
              ) : isInVoice ? (
                <span className="text-[#5bd882]">
                  {isMuted ? 'muted' : 'live'}
                  <span className="text-[#666]"> &middot; {totalInCall} in call</span>
                </span>
              ) : (
                'voice chat'
              )}
            </span>

            {/* Mini waveform visualizer */}
            {isInVoice && !isMuted && (
              <div className="flex items-end gap-[2px] h-4 flex-shrink-0">
                {waveformData.map((v, i) => (
                  <div
                    key={i}
                    className="voice-waveform-bar"
                    style={{
                      height: `${Math.max(2, v * 16)}px`,
                      opacity: 0.4 + v * 0.6,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isInVoice && (
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
          )}

          <button
            onClick={isInVoice ? leaveVoice : joinVoice}
            disabled={connecting}
            className={`text-[10px] px-3 py-1.5 rounded-lg font-mono transition-all active:scale-95 disabled:opacity-50 ${
              isInVoice
                ? 'bg-[#ff6b6b]/12 hover:bg-[#ff6b6b]/22 text-[#ff6b6b] border border-[#ff6b6b]/15'
                : 'bg-[#5bd882]/12 hover:bg-[#5bd882]/22 text-[#5bd882] border border-[#5bd882]/15'
            }`}
          >
            {connecting ? 'joining...' : isInVoice ? 'leave' : 'join voice'}
          </button>
        </div>
      </div>

      {/* Error with retry */}
      {error && (
        <div className="flex items-center gap-2 mt-1.5 px-1 py-1 bg-[#ff6b6b]/5 rounded-lg">
          <svg className="w-3 h-3 text-[#ff6b6b] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-[#ff6b6b] text-[10px] font-mono flex-1">{error}</p>
          <button onClick={() => { setError(''); joinVoice(); }}
            className="text-[9px] text-[#ff6b6b] hover:text-[#ff8a8a] font-mono underline flex-shrink-0">
            retry
          </button>
          <button onClick={() => setError('')} className="text-[#666] hover:text-[#aaa] p-0.5 flex-shrink-0">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Voice users list */}
      {isInVoice && voiceUsers.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {voiceUsers.map(u => (
            <span key={u.userId} className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 bg-[#5bd882]/6 text-[#5bd882] rounded-md font-mono border border-[#5bd882]/10 transition-all">
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
