/**
 * Room Workspace v8.0 — Warm, organic workspace
 * 
 * Same robust functionality (CRDT sync, 20 langs, stdin, voice chat)
 * but with the v8 visual language. Warmer colors, less mechanical.
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

const Editor = dynamic(() => import('../../components/Editor'), { ssr: false });

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

const EXT_MAP = {
  javascript: '.js', typescript: '.ts', python: '.py', java: '.java',
  c: '.c', cpp: '.cpp', go: '.go', rust: '.rs', ruby: '.rb', php: '.php',
  perl: '.pl', r: '.R', bash: '.sh', shell: '.sh', awk: '.awk',
  lua: '.lua', fortran: '.f90', tcl: '.tcl', sqlite: '.sql', nasm: '.asm',
};

export default function RoomPage() {
  const router = useRouter();
  const { id: roomId } = router.query;
  const { state, setRoom, setUsers, addUser, removeUser, setConnectionStatus, setLanguage, setTheme, toggleChat, toggleOutput } = useAppContext();

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

  const [isPublic, setIsPublic] = useState(false);

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
      }
    } catch (e) {}
  }, []);

  const saveSettings = useCallback(() => {
    try {
      localStorage.setItem('collabcode_settings', JSON.stringify({
        terminalTheme, editorTheme: state.theme,
        fontSize: editorFontSize, tabSize: editorTabSize,
        minimap: editorMinimap, wordWrap: editorWordWrap,
      }));
    } catch (e) {}
  }, [terminalTheme, state.theme, editorFontSize, editorTabSize, editorMinimap, editorWordWrap]);

  useEffect(() => { saveSettings(); }, [saveSettings]);

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
    socket.on('room:user-joined', (user) => addUser(user));
    socket.on('room:user-left', (data) => removeUser(data.userId));
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
      <div className="h-screen w-screen flex items-center justify-center bg-[#131416]">
        <div className="text-center">
          <div className="spinner mx-auto mb-4" />
          <p className="text-[#666] text-[12px] font-mono">connecting...</p>
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
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Panel */}
        {leftPanelOpen && (
          <div style={{ width: leftPanelWidth }} className="flex-shrink-0 hidden sm:block">
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
              />
            )}
          </div>
        )}

        {/* Main Editor Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
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
                wordWrap={editorWordWrap}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="spinner mx-auto mb-3" />
                  <p className="text-[#666] text-[11px] font-mono">loading editor...</p>
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

        {/* Chat Sidebar */}
        {state.chatOpen && (
          <>
            <div
              className={`resizer w-[3px] flex-shrink-0 hidden sm:block ${isResizing && resizeType === 'sidebar' ? 'active' : ''}`}
              onMouseDown={handleMouseDown('sidebar')}
              onTouchStart={handleMouseDown('sidebar')}
            />
            <div style={{ width: panelWidth }} className="flex-shrink-0 border-l border-[#282828] flex flex-col hidden sm:flex">
              <VoiceChat socket={socketRef.current} currentUser={state.user} />
              <div className="flex-1 min-h-0">
                <Chat messages={messages} onSendMessage={handleSendMessage} currentUser={state.user} socket={socketRef.current} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
