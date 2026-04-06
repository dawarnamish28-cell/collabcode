/**
 * Room Workspace Page
 * 
 * Main collaborative coding workspace. Integrates:
 * - Monaco Editor with Yjs CRDT synchronization
 * - Real-time chat
 * - User presence indicators
 * - Code execution with output console
 * - Responsive layout with resizable panels
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { useAppContext } from '../../context/AppContext';
import { getSocket, disconnectSocket } from '../../utils/socket';
import { createYjsDoc, SocketIOProvider } from '../../utils/yjsProvider';
import Navbar from '../../components/Navbar';
import Chat from '../../components/Chat';
import UserPresence from '../../components/UserPresence';
import RunButton from '../../components/RunButton';
import OutputConsole from '../../components/OutputConsole';

// Dynamic import Monaco to avoid SSR issues
const Editor = dynamic(() => import('../../components/Editor'), { ssr: false });

export default function RoomPage() {
  const router = useRouter();
  const { id: roomId } = router.query;
  const {
    state, setRoom, setUsers, addUser, removeUser,
    setConnectionStatus, setLanguage, toggleChat, toggleOutput,
  } = useAppContext();

  // Refs for persistent objects
  const socketRef = useRef(null);
  const ydocRef = useRef(null);
  const providerRef = useRef(null);

  // Local state
  const [messages, setMessages] = useState([]);
  const [output, setOutput] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [awarenessStates, setAwarenessStates] = useState(new Map());
  const [panelWidth, setPanelWidth] = useState(320);
  const [outputHeight, setOutputHeight] = useState(200);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeType, setResizeType] = useState(null);
  const [ready, setReady] = useState(false);

  // Get language from query params
  const queryLang = router.query.lang;

  // ─── Initialize Connection ──────────────────────────────────────
  useEffect(() => {
    if (!roomId || !state.user) return;

    const lang = queryLang || state.language;
    setLanguage(lang);

    // Create Yjs document
    const ydoc = createYjsDoc();
    ydocRef.current = ydoc;

    // Connect socket
    const socket = getSocket({
      userId: state.user.userId,
      username: state.user.username,
      color: state.user.color,
      token: state.user.token,
    });
    socketRef.current = socket;

    // Create CRDT provider
    const provider = new SocketIOProvider(ydoc, socket, roomId);
    providerRef.current = provider;

    // Socket event handlers
    socket.on('connect', () => {
      setConnectionStatus('connected');
      socket.emit('room:join', { roomId, language: lang });
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    socket.on('reconnect', () => {
      setConnectionStatus('connected');
      socket.emit('room:join', { roomId, language: lang });
    });

    // Room state (initial sync)
    socket.on('room:state', (data) => {
      if (data.users) {
        setUsers(data.users);
      }
      setRoom({ roomId });
      setReady(true);
    });

    // User events
    socket.on('room:user-joined', (user) => {
      addUser(user);
    });

    socket.on('room:user-left', (data) => {
      removeUser(data.userId);
    });

    // Chat events
    socket.on('chat:history', (history) => {
      setMessages(history);
    });

    socket.on('chat:message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    // Language change
    socket.on('room:language-change', (data) => {
      setLanguage(data.language);
    });

    // Awareness updates
    provider.on('awareness-change', (states) => {
      setAwarenessStates(new Map(states));
    });

    // If already connected, join room
    if (socket.connected) {
      setConnectionStatus('connected');
      socket.emit('room:join', { roomId, language: lang });
    } else {
      setConnectionStatus('connecting');
    }

    // Cleanup
    return () => {
      provider.destroy();
      socket.off('connect');
      socket.off('disconnect');
      socket.off('reconnect');
      socket.off('room:state');
      socket.off('room:user-joined');
      socket.off('room:user-left');
      socket.off('chat:history');
      socket.off('chat:message');
      socket.off('room:language-change');
      disconnectSocket();
      ydoc.destroy();
    };
  }, [roomId, state.user?.userId]);

  // ─── Send Chat Message ──────────────────────────────────────────
  const handleSendMessage = useCallback((content) => {
    if (!socketRef.current || !content.trim()) return;
    socketRef.current.emit('chat:send', {
      content: content.trim(),
      type: 'chat',
    });
  }, []);

  // ─── Handle Language Change ─────────────────────────────────────
  const handleLanguageChange = useCallback((lang) => {
    setLanguage(lang);
    if (socketRef.current) {
      socketRef.current.emit('room:language-change', { language: lang });
    }
  }, []);

  // ─── Handle Code Execution ──────────────────────────────────────
  const handleRunCode = useCallback(async (code, stdin = '') => {
    setIsRunning(true);
    setOutput({ type: 'info', content: 'Running code...' });

    try {
      const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';
      const res = await fetch(`${SERVER_URL}/api/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': state.user?.userId || '',
          'x-username': state.user?.username || '',
        },
        body: JSON.stringify({
          code,
          language: state.language,
          stdin,
        }),
      });

      const data = await res.json();

      if (data.error && !data.success && !data.output) {
        // Hard error from server (501, 400, etc.)
        setOutput({
          type: 'error',
          content: '',
          error: data.message || 'Execution failed',
          status: data.message ? 'Error' : 'Failed',
        });
      } else if (data.success) {
        setOutput({
          type: 'success',
          content: data.output || '',
          error: data.error || '',
          exitCode: data.exitCode,
          executionTime: data.executionTime,
          memoryUsed: data.memoryUsed,
          status: data.status,
          engine: data.engine,
          language: data.language,
          version: data.version,
          phase: data.phase,
        });
      } else {
        setOutput({
          type: 'error',
          content: data.output || '',
          error: data.error || data.message || 'Execution failed',
          exitCode: data.exitCode,
          executionTime: data.executionTime,
          memoryUsed: data.memoryUsed,
          status: data.status,
          engine: data.engine,
          language: data.language,
          version: data.version,
          phase: data.phase,
        });
      }
    } catch (err) {
      setOutput({
        type: 'error',
        content: '',
        error: `Network error: ${err.message}`,
        status: 'Network Error',
      });
    } finally {
      setIsRunning(false);
    }
  }, [state.language, state.user]);

  // ─── Panel Resize Logic ─────────────────────────────────────────
  const handleMouseDown = useCallback((type) => (e) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeType(type);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      if (resizeType === 'sidebar') {
        const newWidth = Math.min(Math.max(240, window.innerWidth - e.clientX), 500);
        setPanelWidth(newWidth);
      } else if (resizeType === 'output') {
        const newHeight = Math.min(Math.max(100, window.innerHeight - e.clientY), 500);
        setOutputHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeType(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeType]);

  // ─── Keyboard Shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl/Cmd + Enter: Run code
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (ydocRef.current) {
          const code = ydocRef.current.getText('monaco').toString();
          handleRunCode(code);
        }
      }
      // Ctrl/Cmd + B: Toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        toggleChat();
      }
      // Ctrl/Cmd + `: Toggle output
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        toggleOutput();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRunCode, toggleChat, toggleOutput]);

  // ─── Loading State ──────────────────────────────────────────────
  if (!state.user || !roomId) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#1e1e1e]">
        <div className="text-center">
          <div className="spinner mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Connecting...</p>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#1e1e1e]" style={{ userSelect: isResizing ? 'none' : 'auto' }}>
      {/* Navbar */}
      <Navbar
        roomId={roomId}
        language={state.language}
        onLanguageChange={handleLanguageChange}
        connectionStatus={state.connectionStatus}
        users={state.users}
        onToggleChat={toggleChat}
        onToggleOutput={toggleOutput}
        chatOpen={state.chatOpen}
        outputOpen={state.outputOpen}
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor + Output Panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* User Presence Bar */}
          <UserPresence
            users={state.users}
            currentUser={state.user}
            awarenessStates={awarenessStates}
          />

          {/* Editor */}
          <div className="flex-1 min-h-0 relative">
            {ready && ydocRef.current ? (
              <Editor
                ydoc={ydocRef.current}
                provider={providerRef.current}
                language={state.language}
                theme={state.theme}
                user={state.user}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="spinner mx-auto mb-4" />
                  <p className="text-gray-500 text-sm">Loading editor...</p>
                </div>
              </div>
            )}

            {/* Run Button (overlay) */}
            <RunButton
              onRun={() => {
                if (ydocRef.current) {
                  const code = ydocRef.current.getText('monaco').toString();
                  handleRunCode(code);
                }
              }}
              isRunning={isRunning}
              language={state.language}
            />
          </div>

          {/* Output Console */}
          {state.outputOpen && (
            <>
              {/* Horizontal Resizer */}
              <div
                className={`resizer resizer-horizontal h-1 w-full flex-shrink-0 ${isResizing && resizeType === 'output' ? 'active' : ''}`}
                onMouseDown={handleMouseDown('output')}
              />
              <div style={{ height: outputHeight }} className="flex-shrink-0">
                <OutputConsole
                  output={output}
                  onClear={() => setOutput(null)}
                  isRunning={isRunning}
                  language={state.language}
                  onRunWithStdin={(stdin) => {
                    if (ydocRef.current) {
                      const code = ydocRef.current.getText('monaco').toString();
                      handleRunCode(code, stdin);
                    }
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* Sidebar Resizer */}
        {state.chatOpen && (
          <div
            className={`resizer w-1 flex-shrink-0 ${isResizing && resizeType === 'sidebar' ? 'active' : ''}`}
            onMouseDown={handleMouseDown('sidebar')}
          />
        )}

        {/* Chat Sidebar */}
        {state.chatOpen && (
          <div style={{ width: panelWidth }} className="flex-shrink-0 border-l border-editor-border">
            <Chat
              messages={messages}
              onSendMessage={handleSendMessage}
              currentUser={state.user}
              socket={socketRef.current}
            />
          </div>
        )}
      </div>
    </div>
  );
}
