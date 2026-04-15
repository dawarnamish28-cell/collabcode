/**
 * VoiceChat v8.0 — Minimal, warm
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
  const peersRef = useRef(new Map());
  const localStreamRef = useRef(null);

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

  async function joinVoice() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setIsInVoice(true);
      socket.emit('voice:join');
    } catch (err) {
      setError('mic access denied');
      console.error('[Voice] Mic error:', err);
    }
  }

  function leaveVoice() {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    peersRef.current.forEach(({ pc }) => pc.close());
    peersRef.current.clear();
    document.querySelectorAll('[id^="voice-audio-"]').forEach(el => el.remove());
    setIsInVoice(false);
    setVoiceUsers([]);
    if (socket) socket.emit('voice:leave');
  }

  function toggleMute() {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setIsMuted(!isMuted);
    }
  }

  return (
    <div className="px-3 py-2 bg-[#19191c] border-b border-[#282828] flex-shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-[#666]">voice</span>
          {isInVoice && <span className="text-[9px] px-1.5 py-0.5 bg-[#5bd882]/10 text-[#5bd882] rounded font-mono">{voiceUsers.length + 1} in call</span>}
        </div>

        <div className="flex items-center gap-1">
          {isInVoice && (
            <button onClick={toggleMute}
              className={`p-1.5 rounded-md transition ${isMuted ? 'bg-[#ff6b6b]/10 text-[#ff6b6b]' : 'bg-[#222] text-[#aaa] hover:text-white'}`}
              title={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </button>
          )}
          <button onClick={isInVoice ? leaveVoice : joinVoice}
            className={`text-[10px] px-2.5 py-1 rounded-md font-mono transition-all ${isInVoice
              ? 'bg-[#ff6b6b]/10 hover:bg-[#ff6b6b]/20 text-[#ff6b6b] border border-[#ff6b6b]/15'
              : 'bg-[#5bd882]/10 hover:bg-[#5bd882]/20 text-[#5bd882] border border-[#5bd882]/15'}`}>
            {isInVoice ? 'leave' : 'join voice'}
          </button>
        </div>
      </div>
      {error && <p className="text-[#ff6b6b] text-[10px] mt-1 font-mono">{error}</p>}
      {isInVoice && voiceUsers.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {voiceUsers.map(u => (
            <span key={u.userId} className="text-[9px] px-1.5 py-0.5 bg-[#5bd882]/5 text-[#5bd882] rounded font-mono border border-[#5bd882]/10">
              {u.username}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});

export default VoiceChat;
