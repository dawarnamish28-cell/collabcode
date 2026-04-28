/**
 * Room Workspace v14.0 — Notification bell, better UX, polished
 * 
 * New in v14:
 *  - Notification bell with history (wired to Navbar)
 *  - Session timer in navbar
 *  - Improved toast styling with animations
 *  - Better rate-limit error handling on client
 *  - Connection quality in status bar
 *  - Command palette with fuzzy search
 * 
 * made with <3 by Namish
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
import FileExplorer from '../../components/FileExplorer';
import Extensions from '../../components/Extensions';
import AccountSettings from '../../components/AccountSettings';

const Editor = dynamic(() => import('../../components/Editor'), { ssr: false });

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

const EXT_MAP = {
  javascript: '.js', typescript: '.ts', python: '.py', java: '.java',
  c: '.c', cpp: '.cpp', go: '.go', rust: '.rs', ruby: '.rb', php: '.php',
  perl: '.pl', r: '.R', bash: '.sh', shell: '.sh', awk: '.awk',
  lua: '.lua', fortran: '.f90', tcl: '.tcl', sqlite: '.sql', nasm: '.asm',
};

const LANGUAGES_MAP = {
  javascript: '#f7df1e', typescript: '#3178c6', python: '#3776ab', java: '#ed8b00',
  c: '#a8b9cc', cpp: '#00599c', go: '#00add8', rust: '#ce412b', ruby: '#cc342d',
  php: '#777bb4', perl: '#39457e', r: '#276dc3', bash: '#4eaa25', shell: '#89e051',
  awk: '#c4a000', lua: '#000080', fortran: '#734f96', tcl: '#e4cc98', sqlite: '#003b57', nasm: '#6e4c13',
};

export default function RoomPage() {
  const router = useRouter();
  const { id: roomId } = router.query;
  const { state, setUser, setRoom, setUsers, addUser, removeUser, setConnectionStatus, setLanguage, setTheme, toggleChat, toggleOutput } = useAppContext();

  const socketRef = useRef(null);
  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const outputConsoleRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [output, setOutput] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [awarenessStates, setAwarenessStates] = useState(new Map());
  const [panelWidth, setPanelWidth] = useState(300);
  const [outputHeight, setOutputHeight] = useState(260);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeType, setResizeType] = useState(null);
  const [ready, setReady] = useState(false);

  const [files, setFiles] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [filesOpen, setFilesOpen] = useState(false);

  const [extensionsOpen, setExtensionsOpen] = useState(false);
  const [terminalTheme, setTerminalTheme] = useState('vs-dark');
  const [editorFontSize, setEditorFontSize] = useState(14);
  const [editorTabSize, setEditorTabSize] = useState(2);
  const [editorMinimap, setEditorMinimap] = useState(true);
  const [editorWordWrap, setEditorWordWrap] = useState(true);
  const [editorCursorStyle, setEditorCursorStyle] = useState('line');
  const [editorBracketColors, setEditorBracketColors] = useState(true);
  const [editorLineNumbers, setEditorLineNumbers] = useState(true);
  const [editorAutoIndent, setEditorAutoIndent] = useState(true);

  const [isPublic, setIsPublic] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState(null); // null | 'saving' | 'saved'
  const [connectionQuality, setConnectionQuality] = useState('good'); // 'good' | 'fair' | 'poor'
  const [sessionStart] = useState(Date.now());
  const [sessionTime, setSessionTime] = useState('0:00');
  const [toasts, setToasts] = useState([]);
  const [notifications, setNotifications] = useState([]); // v14: notification bell items
  const [rateLimitUntil, setRateLimitUntil] = useState(0); // v14: rate-limit cooldown timestamp

  const queryLang = router.query.lang;
  const queryPublic = router.query.public;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('collabcode_settings');
      if (stored) {
        const s = JSON.parse(stored);
        if (s.terminalTheme) setTerminalTheme(s.terminalTheme);
        if (s.editorTheme) setTheme(s.editorTheme);
        if (s.fontSize) setEditorFontSize(s.fontSize);
        if (s.tabSize) setEditorTabSize(s.tabSize);
        if (s.minimap !== undefined) setEditorMinimap(s.minimap);
        if (s.wordWrap !== undefined) setEditorWordWrap(s.wordWrap);
        if (s.cursorStyle) setEditorCursorStyle(s.cursorStyle);
        if (s.bracketColors !== undefined) setEditorBracketColors(s.bracketColors);
        if (s.lineNumbers !== undefined) setEditorLineNumbers(s.lineNumbers);
        if (s.autoIndent !== undefined) setEditorAutoIndent(s.autoIndent);
      }
    } catch (e) {}
  }, []);

  const saveSettings = useCallback(() => {
    try {
      localStorage.setItem('collabcode_settings', JSON.stringify({
        terminalTheme, editorTheme: state.theme,
        fontSize: editorFontSize, tabSize: editorTabSize,
        minimap: editorMinimap, wordWrap: editorWordWrap,
        cursorStyle: editorCursorStyle, bracketColors: editorBracketColors,
        lineNumbers: editorLineNumbers, autoIndent: editorAutoIndent,
      }));
    } catch (e) {}
  }, [terminalTheme, state.theme, editorFontSize, editorTabSize, editorMinimap, editorWordWrap, editorCursorStyle, editorBracketColors, editorLineNumbers, editorAutoIndent]);

  useEffect(() => { saveSettings(); }, [saveSettings]);

  // Session timer
  useEffect(() => {
    const tick = () => {
      const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      setSessionTime(h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`);
    };
    const interval = setInterval(tick, 1000);
    tick();
    return () => clearInterval(interval);
  }, [sessionStart]);

  // Toast helper
  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now().toString(36);
    setToasts(prev => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  // v14: Notification helper — adds to bell dropdown
  const addNotification = useCallback((message, type = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setNotifications(prev => [...prev.slice(-29), { message, type, time, read: false }]);
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Auto-save indicator — pulse "saved" when CRDT syncs
  useEffect(() => {
    if (!ydocRef.current) return;
    let timer;
    const ytext = ydocRef.current.getText('monaco');
    const handler = () => {
      setAutoSaveStatus('saving');
      clearTimeout(timer);
      timer = setTimeout(() => {
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus(null), 2000);
      }, 400);
    };
    ytext.observe(handler);
    return () => { ytext.unobserve(handler); clearTimeout(timer); };
  }, [ready]);

  // Connection quality monitor
  useEffect(() => {
    if (!socketRef.current) return;
    let lastPong = Date.now();
    const s = socketRef.current;
    const onPong = () => {
      const latency = Date.now() - lastPong;
      setConnectionQuality(latency < 150 ? 'good' : latency < 400 ? 'fair' : 'poor');
    };
    const interval = setInterval(() => {
      if (s.connected) { lastPong = Date.now(); s.volatile.emit('ping'); }
    }, 15000);
    s.on('pong', onPong);
    return () => { clearInterval(interval); s.off('pong', onPong); };
  }, [ready]);

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

    const isPublicRoom = queryPublic === 'true';

    socket.on('connect', () => { setConnectionStatus('connected'); socket.emit('room:join', { roomId, language: lang, isPublic: isPublicRoom }); });
    socket.on('disconnect', () => setConnectionStatus('disconnected'));
    socket.on('reconnect', () => { setConnectionStatus('connected'); socket.emit('room:join', { roomId, language: lang }); });
    socket.on('room:state', (data) => {
      if (data.users) setUsers(data.users);
      if (data.isPublic !== undefined) setIsPublic(data.isPublic);
      if (data.language) setLanguage(data.language);
      setRoom({ roomId });
      setReady(true);
    });
    socket.on('room:user-joined', (user) => { addUser(user); addToast(`${user.username} joined`, 'join'); addNotification(`${user.username} joined the room`, 'join'); });
    socket.on('room:user-left', (data) => { removeUser(data.userId); addToast(`${data.username || 'Someone'} left`, 'leave'); addNotification(`${data.username || 'Someone'} left the room`, 'leave'); });
    socket.on('chat:history', (history) => setMessages(history));
    socket.on('chat:message', (msg) => setMessages(prev => [...prev, msg]));
    socket.on('room:language-change', (data) => setLanguage(data.language));
    socket.on('room:visibility-changed', (data) => setIsPublic(data.isPublic));
    provider.on('awareness-change', (states) => setAwarenessStates(new Map(states)));

    if (socket.connected) { setConnectionStatus('connected'); socket.emit('room:join', { roomId, language: lang, isPublic: isPublicRoom }); }
    else setConnectionStatus('connecting');

    return () => {
      provider.destroy();
      ['connect','disconnect','reconnect','room:state','room:user-joined','room:user-left','chat:history','chat:message','room:language-change','room:visibility-changed'].forEach(e => socket.off(e));
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

  const handleTogglePublic = useCallback(() => {
    const newVal = !isPublic;
    setIsPublic(newVal);
    if (socketRef.current) socketRef.current.emit('room:set-visibility', { isPublic: newVal });
  }, [isPublic]);

  // ─── Update User Profile ─────────────────────────────────────────
  const handleUpdateUser = useCallback((updatedUser) => {
    setUser(updatedUser);
    // Update the socket connection with new user info
    if (socketRef.current) {
      socketRef.current.emit('user:update-profile', {
        username: updatedUser.username,
        color: updatedUser.color,
        emoji: updatedUser.emoji,
      });
    }
  }, [setUser]);

  // ─── Code Execution ───────────────────────────────────────────────
  const handleRunCode = useCallback(async (code, explicitStdin) => {
    const stdin = explicitStdin !== undefined
      ? explicitStdin
      : (outputConsoleRef.current?.getStdin?.() || '');

    setIsRunning(true);
    setOutput({ type: 'info', content: 'Running code...' });

    if (!state.outputOpen) toggleOutput();

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

      // Graceful rate-limit handling
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After') || '60';
        setOutput({ type: 'error', content: '', error: `Rate limit reached. Wait ${retryAfter}s before running again.`, status: 'Rate Limited' });
        addToast('Rate limit reached — wait before running again', 'error');
        return;
      }

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
  }, [state.language, state.user, state.outputOpen, toggleOutput]);

  const handleMainRun = useCallback(() => {
    if (!ydocRef.current) return;
    const code = ydocRef.current.getText('monaco').toString();
    handleRunCode(code, undefined);
  }, [handleRunCode]);

  // ─── File Operations ──────────────────────────────────────────────
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
  }, [handleLanguageChange]);

  const handleAddFile = useCallback((fileData) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const newFile = { id, name: fileData.name, content: fileData.content, language: fileData.language, modified: false };
    setFiles(prev => [...prev, newFile]);
    setActiveFileId(id);
    if (fileData.language) handleLanguageChange(fileData.language);
    if (ydocRef.current && fileData.content) {
      const ytext = ydocRef.current.getText('monaco');
      ydocRef.current.transact(() => { ytext.delete(0, ytext.length); ytext.insert(0, fileData.content); });
    }
  }, [handleLanguageChange]);

  const handleSelectFile = useCallback((fileId) => {
    if (activeFileId && ydocRef.current) {
      const currentContent = ydocRef.current.getText('monaco').toString();
      setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: currentContent } : f));
    }
    setActiveFileId(fileId);
    const file = files.find(f => f.id === fileId);
    if (file) {
      if (file.language) handleLanguageChange(file.language);
      if (ydocRef.current) {
        const ytext = ydocRef.current.getText('monaco');
        ydocRef.current.transact(() => { ytext.delete(0, ytext.length); ytext.insert(0, file.content || ''); });
      }
    }
  }, [activeFileId, files, handleLanguageChange]);

  const handleRemoveFile = useCallback((fileId) => {
    setFiles(prev => {
      const next = prev.filter(f => f.id !== fileId);
      if (activeFileId === fileId && next.length > 0) setActiveFileId(next[0].id);
      else if (next.length === 0) setActiveFileId(null);
      return next;
    });
  }, [activeFileId]);

  const handleOpenFolder = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.webkitdirectory = true;
    input.onchange = (e) => {
      const fileList = e.target.files;
      const EXT_TO_LANG = {
        '.js': 'javascript', '.ts': 'typescript', '.py': 'python', '.java': 'java',
        '.c': 'c', '.cpp': 'cpp', '.go': 'go', '.rs': 'rust', '.rb': 'ruby', '.php': 'php',
        '.pl': 'perl', '.r': 'r', '.R': 'r', '.sh': 'bash', '.awk': 'awk',
        '.lua': 'lua', '.f90': 'fortran', '.f': 'fortran', '.tcl': 'tcl', '.sql': 'sqlite', '.asm': 'nasm',
      };
      for (let i = 0; i < Math.min(fileList.length, 50); i++) {
        const file = fileList[i];
        if (file.size > 200000) continue;
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!EXT_TO_LANG[ext] && ext !== '.txt' && ext !== '.md' && ext !== '.json') continue;
        const reader = new FileReader();
        reader.onload = (ev) => {
          handleAddFile({ name: file.webkitRelativePath || file.name, content: ev.target.result, language: EXT_TO_LANG[ext] || 'javascript' });
        };
        reader.readAsText(file);
      }
      setFilesOpen(true);
    };
    input.click();
  }, [handleAddFile]);

  // ─── Resize ─────────────────────────────────────────────────────
  const handleMouseDown = useCallback((type) => (e) => { e.preventDefault(); setIsResizing(true); setResizeType(type); }, []);

  useEffect(() => {
    if (!isResizing) return;
    const move = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      if (resizeType === 'sidebar') setPanelWidth(Math.min(Math.max(200, window.innerWidth - clientX), 500));
      else if (resizeType === 'output') setOutputHeight(Math.min(Math.max(120, window.innerHeight - clientY), 500));
    };
    const up = () => { setIsResizing(false); setResizeType(null); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move);
    document.addEventListener('touchend', up);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
    };
  }, [isResizing, resizeType]);

  // ─── Keyboard Shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const handle = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const tag = e.target.tagName?.toLowerCase();
        if (tag === 'input') return;
        e.preventDefault();
        handleMainRun();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setShowCommandPalette(prev => !prev); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); toggleChat(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '`') { e.preventDefault(); toggleOutput(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSaveFile(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); handleOpenFile(); }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }
      if (e.key === 'Escape') { setShowShortcuts(false); setShowCommandPalette(false); }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [handleMainRun, toggleChat, toggleOutput, handleSaveFile, handleOpenFile]);

  if (!state.user || !roomId) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#131416]">
        <div className="text-center fade-up">
          <div className="w-10 h-10 rounded-xl bg-[#222] border border-[#333] flex items-center justify-center text-[14px] font-mono font-bold text-[#5e9eff] mx-auto mb-4 glow-pulse">
            {'//'}
          </div>
          <div className="spinner mx-auto mb-3" />
          <p className="text-[#666] text-[12px] font-mono">connecting to room...</p>
          <p className="text-[#444] text-[10px] font-mono mt-1">setting up CRDT sync</p>
        </div>
      </div>
    );
  }

  const leftPanelOpen = filesOpen || extensionsOpen;
  const leftPanelWidth = 200;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#1a1b1e]" style={{ userSelect: isResizing ? 'none' : 'auto' }}>
      <Navbar
        roomId={roomId} language={state.language} onLanguageChange={handleLanguageChange}
        connectionStatus={state.connectionStatus} users={state.users}
        onToggleChat={toggleChat} onToggleOutput={toggleOutput} chatOpen={state.chatOpen} outputOpen={state.outputOpen}
        onSaveFile={handleSaveFile} onOpenFile={handleOpenFile}
        isPublic={isPublic} onTogglePublic={handleTogglePublic}
        onToggleFiles={() => { setFilesOpen(!filesOpen); setExtensionsOpen(false); }}
        filesOpen={filesOpen}
        onToggleExtensions={() => { setExtensionsOpen(!extensionsOpen); setFilesOpen(false); }}
        extensionsOpen={extensionsOpen}
        currentUser={state.user}
        onOpenAccountSettings={() => setShowAccountSettings(true)}
        sessionTime={sessionTime}
        notifications={notifications}
        onClearNotifications={clearNotifications}
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Panel */}
        {leftPanelOpen && (
          <div style={{ width: leftPanelWidth }} className="flex-shrink-0 hidden sm:block panel-slide-in">
            {filesOpen && (
              <FileExplorer
                files={files} activeFileId={activeFileId}
                onSelectFile={handleSelectFile} onAddFile={handleAddFile}
                onRemoveFile={handleRemoveFile} onOpenFolder={handleOpenFolder}
                language={state.language}
              />
            )}
            {extensionsOpen && (
              <Extensions
                editorTheme={state.theme} onEditorThemeChange={(t) => setTheme(t)}
                terminalTheme={terminalTheme} onTerminalThemeChange={setTerminalTheme}
                fontSize={editorFontSize} onFontSizeChange={setEditorFontSize}
                tabSize={editorTabSize} onTabSizeChange={setEditorTabSize}
                minimap={editorMinimap} onMinimapToggle={() => setEditorMinimap(!editorMinimap)}
                wordWrap={editorWordWrap} onWordWrapToggle={() => setEditorWordWrap(!editorWordWrap)}
                cursorStyle={editorCursorStyle} onCursorStyleChange={setEditorCursorStyle}
                bracketColors={editorBracketColors} onBracketColorsToggle={() => setEditorBracketColors(!editorBracketColors)}
                lineNumbers={editorLineNumbers} onLineNumbersToggle={() => setEditorLineNumbers(!editorLineNumbers)}
                autoIndent={editorAutoIndent} onAutoIndentToggle={() => setEditorAutoIndent(!editorAutoIndent)}
              />
            )}
          </div>
        )}

        {/* Main Editor Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Breadcrumb Bar */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#19191c] border-b border-[#222] text-[10px] font-mono text-[#555] flex-shrink-0 overflow-hidden">
            <span className="text-[#444] hover:text-[#888] cursor-pointer transition" onClick={() => router.push('/')}>home</span>
            <span className="text-[#333]">/</span>
            <span className="text-[#666]">{roomId}</span>
            <span className="text-[#333]">/</span>
            <span style={{ color: (LANGUAGES_MAP[state.language] || '#5e9eff') }}>{state.language}</span>
            {activeFileId && files.find(f => f.id === activeFileId) && (
              <>
                <span className="text-[#333]">/</span>
                <span className="text-[#888]">{files.find(f => f.id === activeFileId)?.name?.split('/').pop()}</span>
              </>
            )}
            <div className="flex-1" />
            <span className="text-[#444] hidden sm:inline">Ctrl+K command palette</span>
          </div>

          {/* File Tabs */}
          {files.length > 0 && (
            <div className="flex items-center bg-[#19191c] border-b border-[#222] overflow-x-auto flex-shrink-0 scrollbar-none">
              {files.map(file => (
                <button key={file.id}
                  onClick={() => handleSelectFile(file.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono border-r border-[#222] transition group min-w-0 ${
                    file.id === activeFileId
                      ? 'bg-[#1a1b1e] text-[#ddd] border-t-2 border-t-[#5e9eff]'
                      : 'text-[#666] hover:text-[#aaa] hover:bg-[#1e1f22] border-t-2 border-t-transparent'
                  }`}>
                  <span className="truncate max-w-[100px]">{file.name.split('/').pop()}</span>
                  {file.modified && <div className="w-1.5 h-1.5 rounded-full bg-[#ffb347] flex-shrink-0" />}
                  <span onClick={(e) => { e.stopPropagation(); handleRemoveFile(file.id); }}
                    className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[#333] transition">
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </span>
                </button>
              ))}
            </div>
          )}

          <UserPresence users={state.users} currentUser={state.user} awarenessStates={awarenessStates} />

          <div className="flex-1 min-h-0 relative">
            {ready && ydocRef.current ? (
              <Editor
                ydoc={ydocRef.current} provider={providerRef.current}
                language={state.language} theme={state.theme}
                user={state.user} fontSize={editorFontSize}
                tabSize={editorTabSize} minimap={editorMinimap}
                wordWrap={editorWordWrap} cursorStyle={editorCursorStyle}
                bracketColors={editorBracketColors} lineNumbers={editorLineNumbers}
                autoIndent={editorAutoIndent}
              />
            ) : (
              <div className="h-full flex items-center justify-center bg-[#1a1b1e]">
                <div className="text-center fade-up">
                  <div className="spinner mx-auto mb-3" />
                  <p className="text-[#666] text-[11px] font-mono">loading editor...</p>
                  <p className="text-[#444] text-[9px] font-mono mt-1">initializing Monaco &amp; Yjs</p>
                </div>
              </div>
            )}
            <RunButton onRun={handleMainRun} isRunning={isRunning} language={state.language} />
          </div>

          {state.outputOpen && (
            <>
              <div
                className={`resizer resizer-horizontal h-[3px] w-full flex-shrink-0 ${isResizing && resizeType === 'output' ? 'active' : ''}`}
                onMouseDown={handleMouseDown('output')}
                onTouchStart={handleMouseDown('output')}
              />
              <div style={{ height: outputHeight }} className="flex-shrink-0">
                <OutputConsole
                  ref={outputConsoleRef}
                  output={output} onClear={() => setOutput(null)}
                  isRunning={isRunning} language={state.language}
                  code={ydocRef.current ? ydocRef.current.getText('monaco').toString() : ''}
                  onRunWithStdin={(stdin) => {
                    if (ydocRef.current) handleRunCode(ydocRef.current.getText('monaco').toString(), stdin);
                  }}
                  terminalTheme={terminalTheme}
                />
              </div>
            </>
          )}
        </div>

        {/* Chat Sidebar — desktop: side panel, mobile: fullscreen overlay */}
        {state.chatOpen && (
          <>
            {/* Desktop: resizable side panel */}
            <div
              className={`resizer w-[3px] flex-shrink-0 hidden sm:block ${isResizing && resizeType === 'sidebar' ? 'active' : ''}`}
              onMouseDown={handleMouseDown('sidebar')}
              onTouchStart={handleMouseDown('sidebar')}
            />
            {/* Desktop sidebar */}
            <div style={{ width: panelWidth }} className="flex-shrink-0 border-l border-[#282828] flex-col hidden sm:flex">
              <VoiceChat socket={socketRef.current} currentUser={state.user} />
              <div className="flex-1 min-h-0">
                <Chat messages={messages} onSendMessage={handleSendMessage} currentUser={state.user} socket={socketRef.current} />
              </div>
            </div>
            {/* Mobile: fullscreen overlay */}
            <div className="fixed inset-0 z-50 bg-[#1a1b1e] flex flex-col sm:hidden" style={{ animation: 'slideInRight 0.2s cubic-bezier(0.22, 1, 0.36, 1)' }}>
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#282828] bg-[#19191c] flex-shrink-0">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#5e9eff]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  <span className="text-[12px] font-mono text-[#888]">chat & voice</span>
                </div>
                <button onClick={toggleChat} className="p-2 text-[#666] hover:text-white rounded-lg hover:bg-[#222] active:scale-95 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <VoiceChat socket={socketRef.current} currentUser={state.user} />
              <div className="flex-1 min-h-0">
                <Chat messages={messages} onSendMessage={handleSendMessage} currentUser={state.user} socket={socketRef.current} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Status Bar (bottom-left) */}
      <div className="fixed bottom-2 left-2 z-30 flex items-center gap-2 px-2.5 py-1.5 bg-[#19191c]/90 backdrop-blur-md rounded-lg border border-[#282828] text-[9px] font-mono text-[#555] shadow-lg">
        {/* Auto-save indicator */}
        {autoSaveStatus && (
          <>
            <div className="flex items-center gap-1" style={{ color: autoSaveStatus === 'saving' ? '#ffb347' : '#5bd882' }}>
              {autoSaveStatus === 'saving' ? (
                <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              ) : (
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              )}
              <span>{autoSaveStatus === 'saving' ? 'syncing' : 'saved'}</span>
            </div>
            <div className="w-px h-2.5 bg-[#333]" />
          </>
        )}
        {/* Connection quality */}
        <div className="flex items-center gap-1" title={`Connection: ${connectionQuality}`}>
          <div className="flex items-end gap-[1px]">
            <div className="w-[2px] h-[4px] rounded-sm" style={{ background: connectionQuality !== 'poor' ? '#5bd882' : '#ff6b6b' }} />
            <div className="w-[2px] h-[6px] rounded-sm" style={{ background: connectionQuality === 'good' ? '#5bd882' : connectionQuality === 'fair' ? '#ffb347' : '#ff6b6b' }} />
            <div className="w-[2px] h-[8px] rounded-sm" style={{ background: connectionQuality === 'good' ? '#5bd882' : '#333' }} />
          </div>
          <span className="hidden sm:inline">{connectionQuality}</span>
        </div>
        {/* Language indicator */}
        <div className="w-px h-2.5 bg-[#333]" />
        <span style={{ color: LANGUAGES_MAP[state.language] || '#5e9eff' }}>{state.language}</span>
      </div>

      {/* Toast Notifications */}
      <div className="fixed top-12 right-3 z-[9999] flex flex-col gap-1.5 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id}
            className="flex items-center gap-2 px-3 py-2 bg-[#1a1b1e]/95 border rounded-xl shadow-2xl text-[11px] font-mono backdrop-blur-md pointer-events-auto"
            style={{
              animation: 'toastSlideUp 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
              color: toast.type === 'join' ? '#5bd882' : toast.type === 'leave' ? '#ff6b6b' : toast.type === 'error' ? '#ff6b6b' : '#999',
              borderColor: toast.type === 'join' ? '#5bd88225' : toast.type === 'leave' ? '#ff6b6b25' : toast.type === 'error' ? '#ff6b6b25' : '#333',
            }}>
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: toast.type === 'join' ? '#5bd882' : toast.type === 'leave' ? '#ff6b6b' : toast.type === 'error' ? '#ff6b6b' : '#5e9eff' }} />
            {toast.message}
          </div>
        ))}
      </div>

      {/* Keyboard Shortcuts Overlay */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]"
          onClick={() => setShowShortcuts(false)}>
          <div className="modal-enter bg-[#1a1b1e] border border-[#333] rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-display font-semibold text-white">Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} className="p-1.5 text-[#666] hover:text-white transition rounded-lg hover:bg-[#222]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-2">
              {[
                { keys: ['Ctrl', 'K'], desc: 'Command palette' },
                { keys: ['Ctrl', 'Enter'], desc: 'Run code' },
                { keys: ['Ctrl', 'B'], desc: 'Toggle chat panel' },
                { keys: ['Ctrl', '`'], desc: 'Toggle terminal' },
                { keys: ['Ctrl', 'S'], desc: 'Save file to disk' },
                { keys: ['Ctrl', 'O'], desc: 'Open file from disk' },
                { keys: ['Ctrl', 'L'], desc: 'Clear terminal' },
                { keys: ['?'], desc: 'Show this shortcuts panel' },
                { keys: ['Esc'], desc: 'Close modals/overlays' },
              ].map((shortcut, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-[#222] transition">
                  <span className="text-[12px] text-[#999]">{shortcut.desc}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key, j) => (
                      <span key={j}>
                        {j > 0 && <span className="text-[#444] text-[10px] mx-0.5">+</span>}
                        <kbd className="text-[10px]">{key}</kbd>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[#444] font-mono mt-4 text-center">press <kbd>?</kbd> anywhere to toggle this panel</p>
          </div>
        </div>
      )}

      {/* Command Palette (Ctrl+K) */}
      {showCommandPalette && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh] z-[9999]"
          onClick={() => setShowCommandPalette(false)}>
          <div className="modal-enter bg-[#1a1b1e] border border-[#333] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-[#282828]">
              <input
                type="text"
                autoFocus
                placeholder="Type a command..."
                className="w-full bg-transparent text-[14px] text-white placeholder-[#555] focus:outline-none font-mono"
                onKeyDown={(e) => { if (e.key === 'Escape') setShowCommandPalette(false); }}
                onChange={(e) => {
                  const q = e.target.value.toLowerCase();
                  document.querySelectorAll('[data-cmd]').forEach(el => {
                    el.style.display = !q || el.dataset.cmd.toLowerCase().includes(q) ? '' : 'none';
                  });
                }}
              />
            </div>
            <div className="py-1 max-h-[50vh] overflow-y-auto">
              {[
                { label: 'Run Code', hint: 'Ctrl+Enter', action: () => { setShowCommandPalette(false); handleMainRun(); } },
                { label: 'Toggle Chat', hint: 'Ctrl+B', action: () => { setShowCommandPalette(false); toggleChat(); } },
                { label: 'Toggle Terminal', hint: 'Ctrl+`', action: () => { setShowCommandPalette(false); toggleOutput(); } },
                { label: 'Save File', hint: 'Ctrl+S', action: () => { setShowCommandPalette(false); handleSaveFile(); } },
                { label: 'Open File', hint: 'Ctrl+O', action: () => { setShowCommandPalette(false); handleOpenFile(); } },
                { label: 'Toggle File Explorer', hint: '', action: () => { setShowCommandPalette(false); setFilesOpen(!filesOpen); setExtensionsOpen(false); } },
                { label: 'Open Settings', hint: '', action: () => { setShowCommandPalette(false); setExtensionsOpen(!extensionsOpen); setFilesOpen(false); } },
                { label: 'Toggle Public/Private', hint: '', action: () => { setShowCommandPalette(false); handleTogglePublic(); } },
                { label: 'Account Settings', hint: '', action: () => { setShowCommandPalette(false); setShowAccountSettings(true); } },
                { label: 'Keyboard Shortcuts', hint: '?', action: () => { setShowCommandPalette(false); setShowShortcuts(true); } },
                { label: 'Go Home', hint: '', action: () => { setShowCommandPalette(false); router.push('/'); } },
              ].map((cmd, i) => (
                <button key={i} data-cmd={cmd.label}
                  onClick={cmd.action}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] text-[#999] hover:text-white hover:bg-[#222] transition">
                  <span>{cmd.label}</span>
                  {cmd.hint && <kbd className="text-[10px] text-[#555]">{cmd.hint}</kbd>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Account Settings Modal */}
      <AccountSettings
        isOpen={showAccountSettings}
        onClose={() => setShowAccountSettings(false)}
        user={state.user}
        onUpdateUser={handleUpdateUser}
        isAuthenticated={state.isAuthenticated}
      />
    </div>
  );
}
