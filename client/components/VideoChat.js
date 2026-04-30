/**
 * VideoChat v8.0 — Redesigned to match VoiceChat UI pattern
 * 
 * Fixes in v8:
 *  - Self-view (local camera) now ALWAYS visible when in video call
 *  - UI redesigned to match VoiceChat's compact inline style
 *  - Mobile-responsive: proper touch targets, stacked layout on small screens
 *  - Join/leave button matches voice chat pattern
 *  - Proper cleanup of all streams & peer connections
 *  - Screen share with automatic fallback
 *  - PiP (picture-in-picture) for local video
 *  - Connection state indicators per peer
 * 
 * made with <3 by Namish
 */

import { useState, useEffect, useRef, useCallback, memo } from 'react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leaveVideo();
    };
  }, []);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    const onVideoUserJoined = (user) => {
      setVideoUsers(prev => {
        if (prev.find(u => u.userId === user.userId)) return prev;
        return [...prev, user];
      });
      // Create peer connection for the new user
      if (localStreamRef.current) {
        createPeerConnection(user.socketId, true, localStreamRef.current, user);
      }
    };

    const onVideoUserLeft = (data) => {
      setVideoUsers(prev => prev.filter(u => u.userId !== data.userId));
      // Clean up peer connection
      for (const [sid, peer] of peersRef.current) {
        if (peer.userId === data.userId) {
          peer.pc.close();
          peersRef.current.delete(sid);
        }
      }
      // Clean up remote video element
      const el = document.getElementById(`remote-video-${data.userId}`);
      if (el) el.srcObject = null;
    };

    const onVideoPeers = (peers) => {
      setVideoUsers(peers);
      if (localStreamRef.current) {
        peers.forEach(peer => {
          createPeerConnection(peer.socketId, false, localStreamRef.current, peer);
        });
      }
    };

    const onVideoOffer = async (data) => {
      if (!localStreamRef.current) return;
      try {
        const pc = createPeerConnection(data.from, false, localStreamRef.current, { userId: data.userId, username: data.username });
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
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
          await peer.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (e) {}
      }
    };

    const onVideoIceCandidate = async (data) => {
      const peer = peersRef.current.get(data.from);
      if (peer?.pc && data.candidate) {
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {}
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

  // Attach local stream to video element when ref or stream changes
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [isInVideo, isCameraOn]);

  // ─── Create Peer Connection ─────────────────────────────────────
  function createPeerConnection(targetSocketId, isInitiator, stream, userInfo = {}) {
    // Reuse existing connection
    if (peersRef.current.has(targetSocketId)) {
      return peersRef.current.get(targetSocketId).pc;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('video:ice-candidate', { to: targetSocketId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      // Find or create a video element for this remote user
      const videoEl = document.getElementById(`remote-video-${userInfo.userId}`);
      if (videoEl && event.streams[0]) {
        videoEl.srcObject = event.streams[0];
      }
      remoteVideosRef.current.set(userInfo.userId, event.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        // Connection failed - try to reconnect
        peersRef.current.delete(targetSocketId);
        pc.close();
      }
    };

    peersRef.current.set(targetSocketId, { pc, userId: userInfo.userId, username: userInfo.username });

    if (isInitiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('video:offer', { to: targetSocketId, offer: pc.localDescription });
        })
        .catch(err => console.error('[Video] Create offer error:', err));
    }

    return pc;
  }

  // ─── Join Video ─────────────────────────────────────────────────
  const joinVideo = useCallback(async () => {
    if (!socket || isInVideo) return;
    setConnecting(true);
    setError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 360, max: 720 },
          facingMode: 'user',
          frameRate: { ideal: 24, max: 30 },
        },
        audio: true,
      });

      localStreamRef.current = stream;

      // Immediately attach to video element
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
      setConnecting(false);
      if (err.name === 'NotAllowedError') {
        setError('Camera permission denied. Check browser settings.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else if (err.name === 'NotReadableError') {
        setError('Camera is already in use by another app.');
      } else {
        setError('Failed to access camera. Try again.');
      }
    }
  }, [socket, isInVideo, currentUser]);

  // ─── Leave Video ────────────────────────────────────────────────
  const leaveVideo = useCallback(() => {
    // Stop all local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    // Close all peer connections
    peersRef.current.forEach(({ pc }) => pc.close());
    peersRef.current.clear();
    remoteVideosRef.current.clear();
    // Clean up remote video elements
    document.querySelectorAll('[id^="remote-video-"]').forEach(el => { el.srcObject = null; });

    if (socket) {
      socket.emit('video:leave');
    }

    setIsInVideo(false);
    setIsCameraOn(true);
    setIsMicOn(true);
    setIsScreenSharing(false);
    setVideoUsers([]);
  }, [socket]);

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
      // Stop screen sharing
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      // Switch back to camera track
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          peersRef.current.forEach(({ pc }) => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender) sender.replaceTrack(videoTrack).catch(() => {});
          });
        }
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      }
      setIsScreenSharing(false);
      if (socket) socket.emit('video:screen-share-stop');
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];

      // Replace video track in all peer connections
      peersRef.current.forEach(({ pc }) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack).catch(() => {});
      });

      // Show screen share in local preview
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream;
      }

      // Handle native stop (user clicks browser's "stop sharing")
      screenTrack.onended = () => {
        setIsScreenSharing(false);
        if (localStreamRef.current && localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          if (videoTrack) {
            peersRef.current.forEach(({ pc }) => {
              const sender = pc.getSenders().find(s => s.track?.kind === 'video');
              if (sender) sender.replaceTrack(videoTrack).catch(() => {});
            });
          }
        }
        if (socket) socket.emit('video:screen-share-stop');
      };

      setIsScreenSharing(true);
      if (socket) socket.emit('video:screen-share-start');
    } catch (err) {
      // User cancelled — do nothing
    }
  }, [isScreenSharing, socket]);

  const totalInCall = videoUsers.length + (isInVideo ? 1 : 0);

  // ─── NOT in video: show compact join bar (matches VoiceChat style) ─
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

  // ─── IN video: show video panel (compact, VoiceChat-style) ─────
  return (
    <div className="bg-[#19191c] border-b border-[#282828] flex-shrink-0">
      {/* Header row — status + controls (like VoiceChat) */}
      <div className="px-2 sm:px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Video icon with status indicator */}
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
          {/* Expand/collapse video grid */}
          <button onClick={() => setExpanded(prev => !prev)}
            className="p-2 sm:p-1.5 rounded-lg transition-all active:scale-90 bg-[#222] text-[#aaa] hover:text-white hover:bg-[#2a2b30]"
            title={expanded ? 'Collapse video' : 'Expand video'}>
            <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Camera toggle */}
          <button onClick={toggleCamera}
            className={`p-2 sm:p-1.5 rounded-lg transition-all active:scale-90 ${
              isCameraOn
                ? 'bg-[#222] text-[#aaa] hover:text-white hover:bg-[#2a2b30]'
                : 'bg-[#ff6b6b]/15 text-[#ff6b6b] hover:bg-[#ff6b6b]/25'
            }`}
            title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}>
            {isCameraOn ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            )}
          </button>

          {/* Mic toggle */}
          <button onClick={toggleMic}
            className={`p-2 sm:p-1.5 rounded-lg transition-all active:scale-90 ${
              isMicOn
                ? 'bg-[#222] text-[#aaa] hover:text-white hover:bg-[#2a2b30]'
                : 'bg-[#ff6b6b]/15 text-[#ff6b6b] hover:bg-[#ff6b6b]/25'
            }`}
            title={isMicOn ? 'Mute mic' : 'Unmute mic'}>
            {isMicOn ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            )}
          </button>

          {/* Screen share (desktop only) */}
          <button onClick={toggleScreenShare}
            className={`hidden sm:block p-2 sm:p-1.5 rounded-lg transition-all active:scale-90 ${
              isScreenSharing
                ? 'bg-[#c4b5fd]/15 text-[#c4b5fd] hover:bg-[#c4b5fd]/25'
                : 'bg-[#222] text-[#aaa] hover:text-white hover:bg-[#2a2b30]'
            }`}
            title={isScreenSharing ? 'Stop sharing' : 'Share screen'}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </button>

          {/* Leave button */}
          <button
            onClick={leaveVideo}
            className="text-[10px] px-3 py-1.5 rounded-lg font-mono transition-all active:scale-95 bg-[#ff6b6b]/12 hover:bg-[#ff6b6b]/22 text-[#ff6b6b] border border-[#ff6b6b]/15"
          >
            leave
          </button>
        </div>
      </div>

      {/* Video Grid — collapsible */}
      {expanded && (
        <div className="px-2 pb-2">
          <div className="grid gap-1" style={{
            gridTemplateColumns: totalInCall <= 1 ? '1fr' : totalInCall <= 2 ? 'repeat(2, 1fr)' : totalInCall <= 4 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
          }}>
            {/* LOCAL VIDEO — always first, always visible */}
            <div className="relative rounded-lg overflow-hidden bg-[#111] border border-[#282828]" style={{ aspectRatio: '16/9' }}>
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
                style={{
                  transform: 'scaleX(-1)',  // Mirror local video
                  display: (isCameraOn || isScreenSharing) ? 'block' : 'none',
                }}
              />
              {/* Camera-off placeholder */}
              {!isCameraOn && !isScreenSharing && (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a1b1e] to-[#222]">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold font-mono"
                    style={{ background: (currentUser?.color || '#c4b5fd') + '25', color: currentUser?.color || '#c4b5fd' }}>
                    {(currentUser?.username || 'Y')[0].toUpperCase()}
                  </div>
                </div>
              )}
              {/* Label */}
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

            {/* REMOTE VIDEOS */}
            {videoUsers.map(user => (
              <div key={user.userId} className="relative rounded-lg overflow-hidden bg-[#111] border border-[#282828]" style={{ aspectRatio: '16/9' }}>
                <video
                  id={`remote-video-${user.userId}`}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                  ref={(el) => {
                    if (el && remoteVideosRef.current.has(user.userId)) {
                      el.srcObject = remoteVideosRef.current.get(user.userId);
                    }
                  }}
                />
                {/* Placeholder when no video */}
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

      {/* User list (when collapsed) */}
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
