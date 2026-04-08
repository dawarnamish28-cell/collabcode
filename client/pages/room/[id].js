/**
 * Room Workspace v4.0
 * 
 * KEY FIX: All run paths (Run button, Ctrl+Enter, OutputConsole "Run with Input")
 * now automatically include stdin from OutputConsole. No more "hidden" input tab.
 * 
 * - Output panel auto-opens when code uses input()
 * - Ctrl+Enter from editor includes stdin
 * - RunButton shows input indicator
 * - Code tracking for real-time input detection
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
import VoiceChat from '../../components/VoiceChat';

const Editor = dynamic(() => import('../../components/Editor'), { ssr: false });

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

const EXT_MAP = {
  javascript: '.js', typescript: '.ts', python: '.py', java: '.java',
  c: '.c', cpp: '.cpp', go: '.go', rust: '.rs', ruby: '.rb', php: '.php',
};

// Input detection patterns (same as OutputConsole, for RunButton hints)
const INPUT_PATTERNS = {
  python: [/\binput\s*\(/, /\bsys\.stdin/],
  javascript: [/\breadline/, /\bprocess\.stdin/],
  typescript: [/\breadline/, /\bprocess\.stdin/],
  c: [/\bscanf\s*\(/, /\bfgets\s*\(/, /\bgetchar\s*\(/],
  cpp: [/\bcin\s*>>/, /\bgetline\s*\(/, /\bscanf\s*\(/],
  java: [/\bScanner\b/, /\bSystem\.in\b/],
  go: [/\bbufio\./, /\bfmt\.Scan/],
  rust: [/\bstdin\(\)/, /\bread_line\s*\(/],
  ruby: [/\bgets\b/, /\bSTDIN\b/],
  php: [/\bfgets\s*\(\s*STDIN/, /\breadline\s*\(/],
};

function codeNeedsInput(code, language) {
  if (!code) return false;
  const patterns = INPUT_PATTERNS[language] || [];
  return patterns.some(p => p.test(code));
}

export default function RoomPage() {
  const router = useRouter();
  const { id: roomId } = router.query;
  const { state, setRoom, setUsers, addUser, removeUser, setConnectionStatus, setLanguage, toggleChat, toggleOutput } = useAppContext();

  const socketRef = useRef(null);
  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const outputConsoleRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [output, setOutput] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [awarenessStates, setAwarenessStates] = useState(new Map());
  const [panelWidth, setPanelWidth] = useState(320);
  const [outputHeight, setOutputHeight] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeType, setResizeType] = useState(null);
  const [ready, setReady] = useState(false);
  const [currentCode, setCurrentCode] = useState('');

  const queryLang = router.query.lang;
  const needsInput = codeNeedsInput(currentCode, state.language);

  // Auto-open output panel when code needs input (so user sees the stdin area)
  useEffect(() => {
    if (needsInput && !state.outputOpen) {
      toggleOutput();
    }
  }, [needsInput]);

  // ─── Initialize Connection ──────────────────────────────────────
  useEffect(() => {
    if (!roomId || !state.user) return;
    const lang = queryLang || state.language;
    setLanguage(lang);

    const ydoc = createYjsDoc();
    ydocRef.current = ydoc;

    const socket = getSocket({
      userId: state.user.userId, username: state.user.username,
      color: state.user.color, token: state.user.token, tabId: state.user.tabId,
    });
    socketRef.current = socket;

    const provider = new SocketIOProvider(ydoc, socket, roomId);
    providerRef.current = provider;

    socket.on('connect', () => { setConnectionStatus('connected'); socket.emit('room:join', { roomId, language: lang }); });
    socket.on('disconnect', () => setConnectionStatus('disconnected'));
    socket.on('reconnect', () => { setConnectionStatus('connected'); socket.emit('room:join', { roomId, language: lang }); });
    socket.on('room:state', (data) => { if (data.users) setUsers(data.users); setRoom({ roomId }); setReady(true); });
    socket.on('room:user-joined', (user) => addUser(user));
    socket.on('room:user-left', (data) => removeUser(data.userId));
    socket.on('chat:history', (history) => setMessages(history));
    socket.on('chat:message', (msg) => setMessages(prev => [...prev, msg]));
    socket.on('room:language-change', (data) => setLanguage(data.language));
    provider.on('awareness-change', (states) => setAwarenessStates(new Map(states)));

    // Track code changes for real-time input detection
    const ytext = ydoc.getText('monaco');
    const codeObserver = () => setCurrentCode(ytext.toString());
    ytext.observe(codeObserver);

    if (socket.connected) { setConnectionStatus('connected'); socket.emit('room:join', { roomId, language: lang }); }
    else setConnectionStatus('connecting');

    return () => {
      ytext.unobserve(codeObserver);
      provider.destroy();
      ['connect','disconnect','reconnect','room:state','room:user-joined','room:user-left','chat:history','chat:message','room:language-change'].forEach(e => socket.off(e));
      disconnectSocket();
      ydoc.destroy();
    };
  }, [roomId, state.user?.userId]);

  const handleSendMessage = useCallback((content) => {
    if (!socketRef.current || !content.trim()) return;
    socketRef.current.emit('chat:send', { content: content.trim(), type: 'chat' });
  }, []);

  const handleLanguageChange = useCallback((lang) => {
    setLanguage(lang);
    if (socketRef.current) socketRef.current.emit('room:language-change', { language: lang });
  }, []);

  // ─── Code Execution (always includes stdin from OutputConsole) ─────────
  const handleRunCode = useCallback(async (code, explicitStdin) => {
    // Get stdin: use explicit value if provided, otherwise get from OutputConsole ref
    const stdin = explicitStdin !== undefined
      ? explicitStdin
      : (outputConsoleRef.current?.getStdin?.() || '');

    setIsRunning(true);
    setOutput({ type: 'info', content: 'Running code...' });

    try {
      const res = await fetch(`${SERVER_URL}/api/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': state.user?.userId || '',
          'x-tab-id': state.user?.tabId || '',
        },
        body: JSON.stringify({ code, language: state.language, stdin }),
      });
      const data = await res.json();

      const base = {
        stdinUsed: stdin || null,
        exitCode: data.exitCode,
        executionTime: data.executionTime,
        engine: data.engine,
        language: data.language,
        version: data.version,
        phase: data.phase,
      };

      if (data.error && !data.success && !data.output) {
        setOutput({ type: 'error', content: '', error: data.message || 'Execution failed', status: 'Error', ...base });
      } else if (data.success) {
        setOutput({ type: 'success', content: data.output || '', error: data.error || '', status: data.status, ...base });
      } else {
        setOutput({ type: 'error', content: data.output || '', error: data.error || data.message || 'Failed', status: data.status, ...base });
      }
    } catch (err) {
      setOutput({ type: 'error', content: '', error: `Network error: ${err.message}`, status: 'Network Error' });
    } finally {
      setIsRunning(false);
    }
  }, [state.language, state.user]);

  // ─── Main Run handler (used by RunButton + Ctrl+Enter) ─────────────
  const handleMainRun = useCallback(() => {
    if (!ydocRef.current) return;
    const code = ydocRef.current.getText('monaco').toString();
    // Always pass undefined so handleRunCode reads stdin from OutputConsole ref
    handleRunCode(code, undefined);
  }, [handleRunCode]);

  // ─── File Save ─────────────────────────────────────────────────────
  const handleSaveFile = useCallback(() => {
    if (!ydocRef.current) return;
    const code = ydocRef.current.getText('monaco').toString();
    const ext = EXT_MAP[state.language] || '.txt';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `main${ext}`; a.click();
    URL.revokeObjectURL(url);
  }, [state.language]);

  // ─── File Open ─────────────────────────────────────────────────────
  const handleOpenFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    const exts = Object.values(EXT_MAP).join(',');
    input.accept = exts;
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      const langEntry = Object.entries(EXT_MAP).find(([, v]) => v === ext);
      if (langEntry) handleLanguageChange(langEntry[0]);
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ydocRef.current) {
          const ytext = ydocRef.current.getText('monaco');
          ydocRef.current.transact(() => { ytext.delete(0, ytext.length); ytext.insert(0, ev.target.result); });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  // ─── Panel Resize ──────────────────────────────────────────────────
  const handleMouseDown = useCallback((type) => (e) => { e.preventDefault(); setIsResizing(true); setResizeType(type); }, []);
  useEffect(() => {
    if (!isResizing) return;
    const move = (e) => {
      if (resizeType === 'sidebar') setPanelWidth(Math.min(Math.max(240, window.innerWidth - e.clientX), 500));
      else if (resizeType === 'output') setOutputHeight(Math.min(Math.max(150, window.innerHeight - e.clientY), 500));
    };
    const up = () => { setIsResizing(false); setResizeType(null); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
  }, [isResizing, resizeType]);

  // ─── Keyboard Shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const handle = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        // Don't override Ctrl+Enter in the stdin textarea (that runs from OutputConsole)
        const tag = e.target.tagName?.toLowerCase();
        if (tag === 'textarea') return;
        e.preventDefault();
        handleMainRun();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); toggleChat(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '`') { e.preventDefault(); toggleOutput(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSaveFile(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); handleOpenFile(); }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [handleMainRun, toggleChat, toggleOutput, handleSaveFile, handleOpenFile]);

  if (!state.user || !roomId) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#1e1e1e]">
        <div className="text-center"><div className="spinner mx-auto mb-4" /><p className="text-gray-400 text-sm">Connecting...</p></div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#1e1e1e]" style={{ userSelect: isResizing ? 'none' : 'auto' }}>
      <Navbar roomId={roomId} language={state.language} onLanguageChange={handleLanguageChange}
        connectionStatus={state.connectionStatus} users={state.users}
        onToggleChat={toggleChat} onToggleOutput={toggleOutput} chatOpen={state.chatOpen} outputOpen={state.outputOpen}
        onSaveFile={handleSaveFile} onOpenFile={handleOpenFile} />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <UserPresence users={state.users} currentUser={state.user} awarenessStates={awarenessStates} />
          <div className="flex-1 min-h-0 relative">
            {ready && ydocRef.current ? (
              <Editor ydoc={ydocRef.current} provider={providerRef.current} language={state.language} theme={state.theme} user={state.user} />
            ) : (
              <div className="h-full flex items-center justify-center"><div className="text-center"><div className="spinner mx-auto mb-3" /><p className="text-gray-500 text-sm">Loading editor...</p></div></div>
            )}
            <RunButton
              onRun={handleMainRun}
              isRunning={isRunning}
              language={state.language}
              needsInput={needsInput}
            />
          </div>
          {state.outputOpen && (
            <>
              <div className={`resizer resizer-horizontal h-1.5 w-full flex-shrink-0 ${isResizing && resizeType === 'output' ? 'active' : ''}`} onMouseDown={handleMouseDown('output')} />
              <div style={{ height: outputHeight }} className="flex-shrink-0">
                <OutputConsole
                  ref={outputConsoleRef}
                  output={output}
                  onClear={() => setOutput(null)}
                  isRunning={isRunning}
                  language={state.language}
                  code={currentCode || (ydocRef.current ? ydocRef.current.getText('monaco').toString() : '')}
                  onRunWithStdin={(stdin) => {
                    if (ydocRef.current) handleRunCode(ydocRef.current.getText('monaco').toString(), stdin);
                  }}
                />
              </div>
            </>
          )}
        </div>
        {state.chatOpen && <div className={`resizer w-1.5 flex-shrink-0 ${isResizing && resizeType === 'sidebar' ? 'active' : ''}`} onMouseDown={handleMouseDown('sidebar')} />}
        {state.chatOpen && (
          <div style={{ width: panelWidth }} className="flex-shrink-0 border-l border-editor-border flex flex-col">
            <VoiceChat socket={socketRef.current} currentUser={state.user} />
            <div className="flex-1 min-h-0">
              <Chat messages={messages} onSendMessage={handleSendMessage} currentUser={state.user} socket={socketRef.current} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
