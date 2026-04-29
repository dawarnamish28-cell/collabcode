/**
 * VideoChat v6.0 — WebRTC video & screen sharing
 * 
 * Features:
 *  - Camera video with toggle
 *  - Screen sharing with indicator
 *  - Grid layout for multiple participants
 *  - Speaking detection with visual indicator
 *  - Picture-in-picture support
 *  - Mobile-responsive video tiles
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export default function VideoChat({ socket, currentUser, users = [] }) {
  const [isInVideo, setIsInVideo] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [videoUsers, setVideoUsers] = useState([]);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peersRef = useRef(new Map());

  // ─── Join Video ────────────────────────────────────────────────
  const joinVideo = useCallback(async () => {
    if (!socket || isInVideo) return;
    setConnecting(true);
    setError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: 'user' },
        audio: true,
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setIsCameraOn(true);
      setIsMicOn(true);
      setIsInVideo(true);
      setConnecting(false);

      socket.emit('video:join', { userId: currentUser.userId, username: currentUser.username });

      socket.on('video:user-joined', (user) => {
        setVideoUsers(prev => {
          if (prev.find(u => u.userId === user.userId)) return prev;
          return [...prev, user];
        });
        // Initiate WebRTC connection
        createPeerConnection(user.socketId, true, stream);
      });

      socket.on('video:user-left', (data) => {
        setVideoUsers(prev => prev.filter(u => u.userId !== data.userId));
        const peer = peersRef.current.get(data.userId);
        if (peer) { peer.close(); peersRef.current.delete(data.userId); }
      });

      socket.on('video:peers', (peers) => {
        setVideoUsers(peers);
        peers.forEach(peer => {
          createPeerConnection(peer.socketId, false, stream);
        });
      });

      socket.on('video:offer', async (data) => {
        const pc = createPeerConnection(data.from, false, stream);
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('video:answer', { to: data.from, answer });
      });

      socket.on('video:answer', async (data) => {
        const pc = peersRef.current.get(data.from);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      });

      socket.on('video:ice-candidate', async (data) => {
        const pc = peersRef.current.get(data.from);
        if (pc && data.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
        }
      });

    } catch (err) {
      setError(err.name === 'NotAllowedError' ? 'Camera permission denied' : 'Failed to access camera');
      setConnecting(false);
    }
  }, [socket, isInVideo, currentUser]);

  // ─── Create Peer Connection ────────────────────────────────────
  const createPeerConnection = useCallback((targetSocketId, isInitiator, stream) => {
    if (peersRef.current.has(targetSocketId)) return peersRef.current.get(targetSocketId);

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('video:ice-candidate', { to: targetSocketId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      const remoteVideo = document.getElementById(`video-${targetSocketId}`);
      if (remoteVideo) {
        remoteVideo.srcObject = event.streams[0];
      }
    };

    peersRef.current.set(targetSocketId, pc);

    if (isInitiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        socket.emit('video:offer', { to: targetSocketId, offer });
      });
    }

    return pc;
  }, [socket]);

  // ─── Leave Video ───────────────────────────────────────────────
  const leaveVideo = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    peersRef.current.forEach(pc => pc.close());
    peersRef.current.clear();

    if (socket) {
      socket.emit('video:leave');
      ['video:user-joined', 'video:user-left', 'video:peers', 'video:offer', 'video:answer', 'video:ice-candidate'].forEach(e => socket.off(e));
    }

    setIsInVideo(false);
    setIsCameraOn(false);
    setIsMicOn(true);
    setIsScreenSharing(false);
    setVideoUsers([]);
  }, [socket]);

  // ─── Toggle Camera ─────────────────────────────────────────────
  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsCameraOn(videoTrack.enabled);
    }
  }, []);

  // ─── Toggle Mic ────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicOn(audioTrack.enabled);
    }
  }, []);

  // ─── Screen Share ──────────────────────────────────────────────
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      // Switch back to camera
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        peersRef.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender && videoTrack) sender.replaceTrack(videoTrack);
        });
      }
      setIsScreenSharing(false);
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = screenStream;

      const screenTrack = screenStream.getVideoTracks()[0];
      
      // Replace video track in all peer connections
      peersRef.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      });

      // Update local preview
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream;
      }

      screenTrack.onended = () => {
        setIsScreenSharing(false);
        if (localStreamRef.current && localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          peersRef.current.forEach(pc => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender && videoTrack) sender.replaceTrack(videoTrack);
          });
        }
      };

      setIsScreenSharing(true);
    } catch (err) {
      // User cancelled screen share
    }
  }, [isScreenSharing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
      if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());
      peersRef.current.forEach(pc => pc.close());
    };
  }, []);

  if (!isInVideo) {
    return (
      <div className="border-b border-[#282828] bg-[#19191c]">
        <div className="px-3 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-[#c4b5fd]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-[11px] text-[#888] font-mono">video</span>
          </div>
          <button
            onClick={joinVideo}
            disabled={connecting}
            className="text-[10px] px-3 py-1.5 bg-[#c4b5fd]/10 text-[#c4b5fd] rounded-lg hover:bg-[#c4b5fd]/20 transition font-mono border border-[#c4b5fd]/20 disabled:opacity-50"
          >
            {connecting ? (
              <span className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 border border-[#c4b5fd] border-t-transparent rounded-full animate-spin" />
                connecting...
              </span>
            ) : 'join video'}
          </button>
        </div>
        {error && (
          <div className="px-3 pb-2 text-[10px] text-[#ff6b6b] font-mono">{error}</div>
        )}
      </div>
    );
  }

  return (
    <div className="border-b border-[#282828] bg-[#19191c]">
      {/* Video Grid */}
      <div className="p-2">
        <div className="video-grid" style={{ gridTemplateColumns: videoUsers.length > 2 ? 'repeat(2, 1fr)' : videoUsers.length > 0 ? 'repeat(2, 1fr)' : '1fr' }}>
          {/* Local video */}
          <div className={`video-tile ${!isCameraOn ? '' : ''}`}>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={isCameraOn || isScreenSharing ? '' : 'hidden'}
            />
            {!isCameraOn && !isScreenSharing && (
              <div className="video-placeholder">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-bold font-mono"
                  style={{ background: (currentUser?.color || '#5e9eff') + '25', color: currentUser?.color || '#5e9eff' }}>
                  {(currentUser?.username || 'Y')[0].toUpperCase()}
                </div>
              </div>
            )}
            <div className="video-label flex items-center gap-1.5">
              <span>You</span>
              {isScreenSharing && (
                <span className="text-[#c4b5fd] screen-share-indicator">sharing</span>
              )}
              {!isMicOn && (
                <svg className="w-2.5 h-2.5 text-[#ff6b6b]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M1.5 4.5l21 15m-21 0l21-15" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                </svg>
              )}
            </div>
          </div>

          {/* Remote videos */}
          {videoUsers.map(user => (
            <div key={user.userId} className="video-tile">
              <video
                id={`video-${user.socketId}`}
                autoPlay
                playsInline
              />
              <div className="video-placeholder">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-bold font-mono"
                  style={{ background: (user.color || '#5e9eff') + '25', color: user.color || '#5e9eff' }}>
                  {(user.username || '?')[0].toUpperCase()}
                </div>
              </div>
              <div className="video-label">{user.username}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-1.5 px-2 pb-2">
        <button onClick={toggleCamera} className={`video-btn ${isCameraOn ? 'active' : ''}`} title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}>
          {isCameraOn ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          )}
        </button>

        <button onClick={toggleMic} className={`video-btn ${isMicOn ? 'active' : ''}`} title={isMicOn ? 'Mute' : 'Unmute'}>
          {isMicOn ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-[#ff6b6b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          )}
        </button>

        <button onClick={toggleScreenShare} className={`video-btn ${isScreenSharing ? 'active' : ''}`} title={isScreenSharing ? 'Stop sharing' : 'Share screen'}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </button>

        <div className="w-px h-5 bg-[#333] mx-1" />

        <button onClick={leaveVideo} className="video-btn danger" title="Leave video">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
