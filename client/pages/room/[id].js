/**
 * Room Workspace v22.0 — Phase 5: Niche Features & Zen Mode
 * 
 * New in v16:
 *  - Video collaboration: WebRTC video chat & screen sharing
 *  - Enhanced mobile responsiveness: touch gestures, mobile video
 *  - All v15 features: breadcrumb, skeletons, command palette, settings modal
 *  - Notification categories with mark-as-read & sound toggle
 *  - Rate-limit countdown with visual progress bar
 *  - Enhanced status bar with more metrics
 *  - Better toast system with dismiss & action buttons
 * 
 * 
 * v17.0 hardening:
 *  - Reusable AudioContext (prevents resource leak on every notification)
 *  - AbortController for all fetch requests (cancels on unmount)
 *  - Mounted guard ref prevents state updates after unmount
 *  - Toast timeout tracking and cleanup on unmount
 *  - Connection quality monitor properly guards unmounted state
 *  - Session timer properly cleaned up
 *
 * v19.0 features:
 *  - Competition mode: global lock/unlock disables/enables editor
 *  - Forced fullscreen in competition mode
 *  - Fullscreen violation detection + server reporting
 *  - Custom room name display in breadcrumb + navbar
 *  - Competition overlay banners (locked/competition states)
 * made with <3 by Namish
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import Head from 'next/head';
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
import SettingsModal from '../../components/SettingsModal';
import VideoChat from '../../components/VideoChat';
import LibraryPanel from '../../components/LibraryPanel';
import { useAnticheat, AnticheatIndicator } from '../../components/AnticheatMonitor';

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
  const mountedRef = useRef(true); // v17: mounted guard
  const audioCtxRef = useRef(null); // v17: reusable AudioContext
  const abortRef = useRef(null); // v17: AbortController for fetch
  const toastTimersRef = useRef(new Set()); // v17: track toast timeouts

  // v17: Mounted guard + cleanup AudioContext on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Clean up AudioContext
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (e) {}
        audioCtxRef.current = null;
      }
      // Cancel any pending fetch
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch (e) {}
      }
      // Clear all toast timeouts
      for (const timer of toastTimersRef.current) {
        clearTimeout(timer);
      }
      toastTimersRef.current.clear();
    };
  }, []);

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
  const [librariesOpen, setLibrariesOpen] = useState(false);
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
  const [showSettingsModal, setShowSettingsModal] = useState(false); // v15: full settings modal
    const [autoSaveStatus, setAutoSaveStatus] = useState(null); // null | 'saving' | 'saved'
  const [connectionQuality, setConnectionQuality] = useState('good'); // 'good' | 'fair' | 'poor'
  const [sessionStart] = useState(Date.now());
  const [sessionTime, setSessionTime] = useState('0:00');
  const [toasts, setToasts] = useState([]);
  const [notifications, setNotifications] = useState([]); // v14: notification bell items
  const [rateLimitUntil, setRateLimitUntil] = useState(0); // v14: rate-limit cooldown timestamp
  const [cmdPaletteQuery, setCmdPaletteQuery] = useState(''); // v15: command palette search
  const [cmdPaletteFocusIdx, setCmdPaletteFocusIdx] = useState(0); // v15: keyboard nav index
  const [notifSoundEnabled, setNotifSoundEnabled] = useState(true); // v15: notification sounds
  const [showSharePopup, setShowSharePopup] = useState(false); // v18: share room popup
  const [execStats, setExecStats] = useState({ runs: 0, successes: 0, errors: 0, totalTime: 0 }); // v18: execution stats

  // v20: Niche features
  const [zenMode, setZenMode] = useState(false); // hide all UI except editor
  const [lineInfo, setLineInfo] = useState({ lines: 0, chars: 0 }); // line/char count
  const [lastEditTime, setLastEditTime] = useState(null); // last edit timestamp
  const [showExportMenu, setShowExportMenu] = useState(false); // export dropdown
  const [typingSounds, setTypingSounds] = useState(false); // ambient key sounds
  const [wordCount, setWordCount] = useState(0); // word count
  const [activityHistory, setActivityHistory] = useState([]); // last 20 edit timestamps for sparkline
  const typingSoundCtxRef = useRef(null); // audio context for typing sounds

  // v19: Competition mode state
  const [competitionMode, setCompetitionMode] = useState('normal'); // 'normal' | 'competition'
  const [roomsLocked, setRoomsLocked] = useState(false);
  const [roomName, setRoomName] = useState(null); // custom room name
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenViolationSentRef = useRef(false); // prevent spam

  // v17 (AC): AntiCheat state
  const [anticheatEnabled, setAnticheatEnabled] = useState(false);
  const [anticheatSettings, setAnticheatSettings] = useState({});
  const [anticheatViolationCount, setAnticheatViolationCount] = useState(0);
  const [anticheatFlagged, setAnticheatFlagged] = useState(false);

  const queryLang = router.query.lang;
  const queryPublic = router.query.public;
  const queryRoomName = router.query.roomName;

  // v19: Enter fullscreen helper (defined early, no deps)
  const enterFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return;
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else if (el.msRequestFullscreen) el.msRequestFullscreen();
    } catch (e) {
      console.warn('[Fullscreen] Failed to enter fullscreen:', e.message);
    }
  }, []);

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

  // v17: Toast helper with timeout tracking (prevents leak on unmount)
  const addToast = useCallback((message, type = 'info') => {
    if (!mountedRef.current) return;
    const id = Date.now().toString(36);
    setToasts(prev => [...prev.slice(-4), { id, message, type }]);
    const timer = setTimeout(() => {
      toastTimersRef.current.delete(timer);
      if (mountedRef.current) setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
    toastTimersRef.current.add(timer);
  }, []);

  // v15: Enhanced notification helper — adds to bell dropdown with categories & sound
  const addNotification = useCallback((message, type = 'info', category = 'general') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
    if (!mountedRef.current) return;
    setNotifications(prev => [...prev.slice(-49), { id, message, type, category, time, read: false }]);
    // v17: Play notification sound using reusable AudioContext (prevents resource leak)
    if (notifSoundEnabled && typeof window !== 'undefined') {
      try {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        const ctx = audioCtxRef.current;
        // Resume if suspended (browser autoplay policy)
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.03, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
      } catch (e) {}
    }
  }, [notifSoundEnabled]);

  // v19: Fullscreen change listener — detect violations in competition mode
  // (Must be after addNotification/addToast definitions to avoid TDZ in minified build)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleFullscreenChange = () => {
      if (!mountedRef.current) return;
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      if (!isFull && competitionMode === 'competition' && socketRef.current?.connected) {
        if (!fullscreenViolationSentRef.current) {
          fullscreenViolationSentRef.current = true;
          socketRef.current.emit('competition:fullscreen-violation');
          addNotification('You exited fullscreen during competition mode!', 'error', 'competition');
          addToast('Fullscreen violation reported!', 'error');
          setTimeout(() => { fullscreenViolationSentRef.current = false; }, 5000);
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [competitionMode, addNotification, addToast]);

  // v19: Auto-enter fullscreen when competition mode activates
  useEffect(() => {
    if (competitionMode === 'competition' && typeof document !== 'undefined' && !document.fullscreenElement) {
      const timer = setTimeout(() => enterFullscreen(), 500);
      return () => clearTimeout(timer);
    }
  }, [competitionMode, enterFullscreen]);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const markNotificationRead = useCallback((notifId) => {
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
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

  // v17: Connection quality monitor — guarded against unmounted state updates
  useEffect(() => {
    if (!socketRef.current) return;
    let lastPong = Date.now();
    const s = socketRef.current;
    const onPong = () => {
      if (!mountedRef.current) return;
      const latency = Date.now() - lastPong;
      setConnectionQuality(latency < 150 ? 'good' : latency < 400 ? 'fair' : 'poor');
    };
    const interval = setInterval(() => {
      if (s.connected && mountedRef.current) { lastPong = Date.now(); s.volatile.emit('ping'); }
    }, 15000);
    s.on('pong', onPong);
    return () => { clearInterval(interval); s.off('pong', onPong); };
  }, [ready]);

  // v20: Line/char/word counter + last edit time + activity sparkline
  useEffect(() => {
    if (!ydocRef.current || !ready) return;
    const ytext = ydocRef.current.getText('monaco');
    const update = () => {
      const text = ytext.toString();
      setLineInfo({ lines: text.split('\n').length, chars: text.length });
      setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
      setLastEditTime(new Date());
      setActivityHistory(prev => {
        const now = Date.now();
        const updated = [...prev, now].slice(-20);
        return updated;
      });
    };
    update();
    ytext.observe(update);
    return () => ytext.unobserve(update);
  }, [ready]);

  // v20: Ambient typing sounds (tiny click per keystroke via Yjs)
  useEffect(() => {
    if (!ydocRef.current || !ready || !typingSounds) return;
    const ytext = ydocRef.current.getText('monaco');
    const playClick = () => {
      try {
        if (!typingSoundCtxRef.current || typingSoundCtxRef.current.state === 'closed') {
          typingSoundCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        const ctx = typingSoundCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        // Subtle mechanical key click: short burst, randomized pitch
        const freq = 800 + Math.random() * 400;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ctx.currentTime + 0.03);
        gain.gain.setValueAtTime(0.015, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.04);
      } catch (e) {}
    };
    ytext.observe(playClick);
    return () => ytext.unobserve(playClick);
  }, [ready, typingSounds]);

  // v20: Export code with metadata header
  const handleExportSnippet = useCallback((format) => {
    if (!ydocRef.current) return;
    const code = ydocRef.current.getText('monaco').toString();
    const ext = EXT_MAP[state.language] || '.txt';
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').slice(0, 19);
    const commentChar = ['python', 'ruby', 'perl', 'r', 'bash', 'shell', 'awk'].includes(state.language) ? '#' : '//';
    const header = format === 'with-header' ? [
      `${commentChar} ──────────────────────────────────────────`,
      `${commentChar}  CollabCode Export`,
      `${commentChar}  Room: ${roomName || roomId}`,
      `${commentChar}  Language: ${state.language}`,
      `${commentChar}  Date: ${timestamp}`,
      `${commentChar}  Lines: ${lineInfo.lines} | Chars: ${lineInfo.chars}`,
      `${commentChar}  Users: ${state.users?.length || 1}`,
      `${commentChar} ──────────────────────────────────────────`,
      '', ''
    ].join('\n') : '';
    const content = header + code;
    if (format === 'clipboard') {
      navigator.clipboard.writeText(content).catch(() => {});
      addToast('Code copied to clipboard!', 'success');
      setShowExportMenu(false);
      return;
    }
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = format === 'with-header' ? `collabcode-${roomId}${ext}` : `main${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    addToast(`Exported as ${a.download}`, 'success');
    setShowExportMenu(false);
  }, [state.language, roomId, roomName, lineInfo, state.users, addToast]);

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

    // v21: Only send language on initial room creation (when queryLang is explicitly set),
    // not on every join/reconnect — prevents overwriting the room's established language
    const sendLang = queryLang ? lang : undefined;
    socket.on('connect', () => { setConnectionStatus('connected'); socket.emit('room:join', { roomId, language: sendLang, isPublic: isPublicRoom, roomName: queryRoomName || undefined }); });
    socket.on('disconnect', () => setConnectionStatus('disconnected'));
    socket.on('reconnect', () => { setConnectionStatus('connected'); socket.emit('room:join', { roomId }); });
    socket.on('room:state', (data) => {
      if (data.users) setUsers(data.users);
      if (data.isPublic !== undefined) setIsPublic(data.isPublic);
      if (data.language) setLanguage(data.language);
      // v19: Competition state from server
      if (data.competition) {
        setCompetitionMode(data.competition.mode || 'normal');
        setRoomsLocked(!!data.competition.roomsLocked);
      }
      // v17 (AC): AntiCheat state from server (for late joiners)
      if (data.anticheat) {
        setAnticheatEnabled(!!data.anticheat.enabled);
        if (data.anticheat.settings) setAnticheatSettings(data.anticheat.settings);
      }
      if (data.roomName) setRoomName(data.roomName);
      setRoom({ roomId });
      setReady(true);
    });
    socket.on('room:user-joined', (user) => { addUser(user); addToast(`${user.username} joined`, 'join'); addNotification(`${user.username} joined the room`, 'join'); });
    socket.on('room:user-left', (data) => { removeUser(data.userId); addToast(`${data.username || 'Someone'} left`, 'leave'); addNotification(`${data.username || 'Someone'} left the room`, 'leave'); });
    // v18: Cap messages at 500 to prevent unbounded memory growth under heavy chat load
    const MAX_CHAT_MESSAGES = 500;
    socket.on('chat:history', (history) => setMessages(Array.isArray(history) ? history.slice(-MAX_CHAT_MESSAGES) : []));
    socket.on('chat:message', (msg) => setMessages(prev => {
      const updated = [...prev, msg];
      return updated.length > MAX_CHAT_MESSAGES ? updated.slice(-MAX_CHAT_MESSAGES) : updated;
    }));
    socket.on('room:language-change', (data) => setLanguage(data.language));
    socket.on('room:visibility-changed', (data) => setIsPublic(data.isPublic));

    // v19: Competition events from admin
    socket.on('competition:lock-change', (data) => {
      setRoomsLocked(!!data.locked);
      if (data.locked) {
        addToast('Coding has been LOCKED by admin', 'error');
        addNotification('Coding locked by administrator', 'error', 'competition');
      } else {
        addToast('Coding has been UNLOCKED — go!', 'join');
        addNotification('Coding unlocked — start coding!', 'join', 'competition');
      }
    });

    socket.on('competition:mode-change', (data) => {
      setCompetitionMode(data.mode);
      if (data.mode === 'competition') {
        addToast('Competition mode activated!', 'info');
        addNotification('Competition mode: fullscreen required', 'info', 'competition');
        // Fullscreen is handled by the competitionMode effect
      } else {
        addToast('Normal mode restored', 'info');
        addNotification('Normal mode: fullscreen no longer required', 'info', 'competition');
      }
    });

    // v17 (AC): AntiCheat events
    socket.on('anticheat:state-change', (data) => {
      setAnticheatEnabled(data.enabled);
      setAnticheatSettings(data.settings || {});
      if (data.enabled) {
        addToast('🛡 AntiCheat system activated', 'error');
        addNotification('AntiCheat proctoring is now active', 'error', 'competition');
      } else {
        addToast('AntiCheat system deactivated', 'info');
        addNotification('AntiCheat proctoring disabled', 'info', 'competition');
        setAnticheatViolationCount(0);
        setAnticheatFlagged(false);
      }
    });
    socket.on('anticheat:settings-update', (data) => {
      setAnticheatSettings(data.settings || {});
    });
    socket.on('anticheat:violation-ack', (data) => {
      setAnticheatViolationCount(prev => prev + 1);
      if (data.flagged) setAnticheatFlagged(true);
    });

    // v22: Graceful exit helper — shows toast, waits, then redirects
    // Replaces alert() which blocked the thread and caused abrupt exits
    const gracefulExit = (message, type = 'error') => {
      addToast(message, type);
      addNotification(message, type, 'admin');
      // Small delay so the user sees the toast before redirect
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          router.push('/');
        }
      }, 2500);
    };

    // v22: Handle admin kick (graceful)
    socket.on('competition:kicked', (data) => {
      gracefulExit(data.message || 'You have been removed from this room by the admin.');
    });

    // v21: Handle admin broadcast messages
    socket.on('admin:broadcast', (data) => {
      const typeMap = { warning: 'error', success: 'join', info: 'info' };
      addToast(`📢 ${data.message}`, typeMap[data.type] || 'info');
      addNotification(`Admin: ${data.message}`, typeMap[data.type] || 'info', 'admin');
    });

    // v22: Handle admin force disconnect (graceful)
    socket.on('admin:force-disconnect', (data) => {
      gracefulExit(data.message || 'You have been disconnected by the admin.');
    });

    // v22: Handle admin ban (graceful)
    socket.on('admin:banned', (data) => {
      gracefulExit(data.message || 'You have been banned by the admin.');
    });

    provider.on('awareness-change', (states) => setAwarenessStates(new Map(states)));

    if (socket.connected) { setConnectionStatus('connected'); socket.emit('room:join', { roomId, language: sendLang, isPublic: isPublicRoom, roomName: queryRoomName || undefined }); }
    else setConnectionStatus('connecting');

    return () => {
      provider.destroy();
      ['connect','disconnect','reconnect','room:state','room:user-joined','room:user-left','chat:history','chat:message','room:language-change','room:visibility-changed','competition:lock-change','competition:mode-change','competition:kicked','admin:broadcast','admin:force-disconnect','admin:banned','anticheat:state-change','anticheat:settings-update','anticheat:violation-ack'].forEach(e => socket.off(e));
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

    // v17: AbortController for cancellable fetch
    if (abortRef.current) { try { abortRef.current.abort(); } catch (e) {} }
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${SERVER_URL}/api/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': state.user?.userId || '',
          'x-tab-id': state.user?.tabId || '',
        },
        body: JSON.stringify({ code, language: state.language, stdin }),
        signal: abortRef.current.signal,
      });

      // v15: Graceful rate-limit handling with countdown & notification
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10);
        setRateLimitUntil(Date.now() + retryAfter * 1000);
        setOutput({ type: 'error', content: '', error: `Rate limit reached. Wait ${retryAfter}s before running again.`, status: 'Rate Limited' });
        addToast(`Rate limited — retry in ${retryAfter}s`, 'error');
        addNotification(`Code execution rate limited (${retryAfter}s cooldown)`, 'error', 'system');
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
        setExecStats(prev => ({ ...prev, runs: prev.runs + 1, errors: prev.errors + 1 }));
      } else if (data.success) {
        setOutput({ type: 'success', content: data.output || '', error: data.error || '', status: data.status, ...base });
        setExecStats(prev => ({ ...prev, runs: prev.runs + 1, successes: prev.successes + 1, totalTime: prev.totalTime + (data.executionTime || 0) }));
      } else {
        setOutput({ type: 'error', content: data.output || '', error: data.error || data.message || 'Failed', status: data.status, ...base });
        setExecStats(prev => ({ ...prev, runs: prev.runs + 1, errors: prev.errors + 1 }));
      }
    } catch (err) {
      // v17: Don't show error for intentional aborts (unmount/new request)
      if (err.name === 'AbortError') return;
      if (mountedRef.current) {
        setOutput({ type: 'error', content: '', error: `Network error: ${err.message}`, status: 'Network Error' });
      }
    } finally {
      if (mountedRef.current) setIsRunning(false);
    }
  }, [state.language, state.user, state.outputOpen, toggleOutput]);

  const handleMainRun = useCallback(() => {
    if (!ydocRef.current) return;
    const code = ydocRef.current.getText('monaco').toString();
    handleRunCode(code, undefined);
  }, [handleRunCode]);

  // ─── Library Import Insertion ─────────────────────────────────────
  const handleInsertImport = useCallback((importStatement) => {
    if (!ydocRef.current || !importStatement) return;
    const ytext = ydocRef.current.getText('monaco');
    const currentCode = ytext.toString();
    // Check if import already exists (avoid duplicates)
    if (currentCode.includes(importStatement.trim())) {
      addToast('Import already exists in your code', 'info');
      return;
    }
    // Insert at the top of the file
    ytext.insert(0, importStatement + '\n');
    addToast('Import added to editor', 'success');
  }, []);

  // ─── v17 (AC): AntiCheat Monitor Hook ────────────────────────────
  const handleAnticheatViolation = useCallback((type, metadata) => {
    // Local feedback for certain violation types
    if (type === 'DEVTOOLS') {
      addToast('⚠ DevTools detection — violation recorded', 'error');
    } else if (type === 'TAB_SWITCH' || type === 'FOCUS_LOSS') {
      addToast('⚠ Tab switch detected — stay focused!', 'error');
    }
  }, [addToast]);

  useAnticheat(socketRef, anticheatEnabled, anticheatSettings, handleAnticheatViolation);

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
      if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); setShowSettingsModal(prev => !prev); }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z') { e.preventDefault(); setZenMode(prev => !prev); }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }
      if (e.key === 'Escape') {
        if (zenMode) { setZenMode(false); return; }
        setShowShortcuts(false); setShowCommandPalette(false); setShowSettingsModal(false); setShowExportMenu(false);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [handleMainRun, toggleChat, toggleOutput, handleSaveFile, handleOpenFile, zenMode]);

  if (!state.user || !roomId) {
    return (
      <div className="h-screen w-screen flex flex-col bg-[#131416]">
        {/* v15: Full-page loading skeleton */}
        {/* Fake navbar skeleton */}
        <div className="h-9 bg-[#19191c] border-b border-[#222] flex items-center px-3 gap-2">
          <div className="skeleton w-5 h-5 rounded" style={{ opacity: 0.3 }} />
          <div className="skeleton w-16 h-4 rounded" style={{ opacity: 0.2 }} />
          <div className="flex-1" />
          <div className="skeleton w-8 h-4 rounded" style={{ opacity: 0.15 }} />
          <div className="skeleton w-8 h-4 rounded" style={{ opacity: 0.15 }} />
          <div className="skeleton w-5 h-5 rounded-full" style={{ opacity: 0.2 }} />
        </div>
        {/* Fake breadcrumb skeleton */}
        <div className="h-6 bg-[#19191c] border-b border-[#222] flex items-center px-3 gap-1.5">
          <div className="skeleton w-10 h-3 rounded" style={{ opacity: 0.15 }} />
          <div className="skeleton w-2 h-3 rounded" style={{ opacity: 0.1 }} />
          <div className="skeleton w-14 h-3 rounded" style={{ opacity: 0.15 }} />
          <div className="skeleton w-2 h-3 rounded" style={{ opacity: 0.1 }} />
          <div className="skeleton w-12 h-3 rounded" style={{ opacity: 0.2 }} />
        </div>
        {/* Fake editor skeleton */}
        <div className="flex-1 flex">
          <div className="flex-1 p-4 flex gap-3">
            <div className="flex flex-col gap-2.5 items-end pt-0.5">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ width: '14px', height: '8px', borderRadius: '2px', opacity: 0.2 - (i * 0.007) }} />
              ))}
            </div>
            <div className="flex-1 flex flex-col gap-2.5">
              {[80, 55, 70, 40, 90, 30, 65, 50, 85, 25, 75, 45, 60, 35, 80, 55, 70, 20, 90, 45].map((w, i) => (
                <div key={i} className="skeleton" style={{ width: `${w}%`, height: '8px', borderRadius: '2px', opacity: 0.25 - (i * 0.008), animationDelay: `${i * 0.04}s` }} />
              ))}
            </div>
          </div>
        </div>
        {/* Center loading message */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center fade-up">
            <div className="w-12 h-12 rounded-xl bg-[#222] border border-[#333] flex items-center justify-center text-[16px] font-mono font-bold text-[#5e9eff] mx-auto mb-4 glow-pulse">
              {'//'}
            </div>
            <div className="spinner mx-auto mb-3" />
            <p className="text-[#777] text-[12px] font-mono">connecting to room...</p>
            <p className="text-[#444] text-[10px] font-mono mt-1">setting up CRDT sync</p>
          </div>
        </div>
      </div>
    );
  }

  const leftPanelOpen = filesOpen || extensionsOpen || librariesOpen;
  const leftPanelWidth = 200;

  return (
    <div className="room-workspace h-screen w-screen flex flex-col overflow-hidden bg-[#1a1b1e]" style={{ userSelect: isResizing ? 'none' : 'auto' }}>
      <Head>
        <title>{roomName || roomId} — CollabCode</title>
      </Head>
      {/* v20: Zen Mode — floating exit hint */}
      {zenMode && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 px-3 py-1 bg-[#222]/80 backdrop-blur-sm border border-[#333] rounded-full text-[9px] font-mono text-[#666] opacity-0 hover:opacity-100 transition-opacity duration-300" style={{ pointerEvents: 'auto' }}>
          Press <span className="text-[#c4b5fd]">Esc</span> or <span className="text-[#c4b5fd]">Ctrl+Shift+Z</span> to exit zen mode
        </div>
      )}
      {!zenMode && <Navbar
        roomId={roomId} language={state.language} onLanguageChange={handleLanguageChange}
        connectionStatus={state.connectionStatus} users={state.users}
        onToggleChat={toggleChat} onToggleOutput={toggleOutput} chatOpen={state.chatOpen} outputOpen={state.outputOpen}
        onSaveFile={handleSaveFile} onOpenFile={handleOpenFile}
        isPublic={isPublic} onTogglePublic={handleTogglePublic}
        onToggleFiles={() => { setFilesOpen(!filesOpen); setExtensionsOpen(false); setLibrariesOpen(false); }}
        filesOpen={filesOpen}
        onToggleExtensions={() => { setExtensionsOpen(!extensionsOpen); setFilesOpen(false); setLibrariesOpen(false); }}
        extensionsOpen={extensionsOpen}
        onToggleLibraries={() => { setLibrariesOpen(!librariesOpen); setFilesOpen(false); setExtensionsOpen(false); }}
        librariesOpen={librariesOpen}
        currentUser={state.user}
        onOpenAccountSettings={() => setShowAccountSettings(true)}
        sessionTime={sessionTime}
        notifications={notifications}
        onClearNotifications={clearNotifications}
        onMarkAllRead={markAllNotificationsRead}
        onMarkNotificationRead={markNotificationRead}
        notifSoundEnabled={notifSoundEnabled}
        onToggleNotifSound={() => setNotifSoundEnabled(prev => !prev)}
        onOpenSettings={() => setShowSettingsModal(true)}
      />}

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Panel */}
        {leftPanelOpen && !zenMode && (
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
            {librariesOpen && (
              <LibraryPanel
                language={state.language}
                onInsertImport={handleInsertImport}
              />
            )}
          </div>
        )}

        {/* Main Editor Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* v15: Enhanced Breadcrumb Bar — interactive segments, copy path, icons */}
          {!zenMode && <div className="flex items-center gap-0.5 px-3 py-1 bg-[#19191c] border-b border-[#222] text-[10px] font-mono text-[#555] flex-shrink-0 overflow-hidden group/breadcrumb">
            <button className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#222] text-[#555] hover:text-[#aaa] transition active:scale-95" onClick={() => router.push('/')} title="Back to home">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
              <span className="hidden sm:inline">home</span>
            </button>
            <svg className="w-2.5 h-2.5 text-[#333] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            <span className="px-1.5 py-0.5 rounded text-[#777] bg-[#222]/50 cursor-default" title={`Room: ${roomId}`}>{roomName || roomId}</span>
            <svg className="w-2.5 h-2.5 text-[#333] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            <span className="px-1.5 py-0.5 rounded font-medium" style={{ color: (LANGUAGES_MAP[state.language] || '#5e9eff'), background: (LANGUAGES_MAP[state.language] || '#5e9eff') + '10' }}>{state.language}</span>
            {activeFileId && files.find(f => f.id === activeFileId) && (
              <>
                <svg className="w-2.5 h-2.5 text-[#333] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                <span className="px-1.5 py-0.5 rounded text-[#aaa] bg-[#5e9eff]/5 flex items-center gap-1">
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  {files.find(f => f.id === activeFileId)?.name?.split('/').pop()}
                </span>
              </>
            )}
            {/* Copy breadcrumb path button */}
            <button
              className="ml-1 p-0.5 rounded text-[#444] hover:text-[#888] opacity-0 group-hover/breadcrumb:opacity-100 transition-all hover:bg-[#222] active:scale-90"
              title="Copy path"
              onClick={() => {
                const path = `${roomId}/${state.language}${activeFileId && files.find(f => f.id === activeFileId) ? '/' + files.find(f => f.id === activeFileId)?.name?.split('/').pop() : ''}`;
                navigator.clipboard.writeText(path).catch(() => {});
                addToast('Path copied to clipboard', 'info');
              }}>
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </button>
            <div className="flex-1" />
            {/* Auto-save status in breadcrumb */}
            {autoSaveStatus && (
              <span className="flex items-center gap-1 mr-2" style={{ color: autoSaveStatus === 'saving' ? '#ffb347' : '#5bd882' }}>
                {autoSaveStatus === 'saving' ? (
                  <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                )}
                <span className="text-[9px]">{autoSaveStatus === 'saving' ? 'syncing...' : 'saved'}</span>
              </span>
            )}
            <button onClick={() => setShowCommandPalette(true)} className="hidden sm:flex items-center gap-1 text-[#444] hover:text-[#888] transition px-1.5 py-0.5 rounded hover:bg-[#222] active:scale-95">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <span>Ctrl+K</span>
            </button>
          </div>}

          {/* File Tabs */}
          {files.length > 0 && !zenMode && (
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
              <div className="relative w-full h-full">
                <Editor
                  ydoc={ydocRef.current} provider={providerRef.current}
                  language={state.language} theme={state.theme}
                  user={state.user} fontSize={editorFontSize}
                  tabSize={editorTabSize} minimap={editorMinimap}
                  wordWrap={editorWordWrap} cursorStyle={editorCursorStyle}
                  bracketColors={editorBracketColors} lineNumbers={editorLineNumbers}
                  autoIndent={editorAutoIndent}
                  readOnly={roomsLocked}
                />
                {/* v19: Lock overlay when rooms are locked */}
                {roomsLocked && (
                  <div className="absolute inset-0 bg-[#0a0a0a]/60 backdrop-blur-[2px] flex items-center justify-center z-20 pointer-events-none">
                    <div className="text-center">
                      <svg className="w-12 h-12 text-[#ff6b6b] mx-auto mb-3 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                      <p className="text-[#ff6b6b] text-sm font-semibold">Coding is Locked</p>
                      <p className="text-[#666] text-xs mt-1 font-mono">Waiting for admin to start...</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* v15: Loading skeleton for editor */
              <div className="h-full flex flex-col bg-[#1a1b1e] overflow-hidden">
                {/* Fake line numbers + code lines skeleton */}
                <div className="flex-1 flex p-4 gap-3">
                  <div className="flex flex-col gap-2 items-end pt-1">
                    {Array.from({ length: 18 }).map((_, i) => (
                      <div key={i} className="skeleton" style={{ width: '16px', height: '10px', borderRadius: '3px', opacity: 0.3 - (i * 0.012) }} />
                    ))}
                  </div>
                  <div className="flex-1 flex flex-col gap-2 pt-1">
                    {[85, 60, 45, 70, 30, 90, 55, 40, 75, 20, 65, 50, 80, 35, 60, 45, 70, 25].map((w, i) => (
                      <div key={i} className="skeleton" style={{ width: `${w}%`, height: '10px', borderRadius: '3px', opacity: 0.4 - (i * 0.015), animationDelay: `${i * 0.05}s` }} />
                    ))}
                  </div>
                </div>
                {/* Loading indicator overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-[#1a1b1e]/80 backdrop-blur-[1px]">
                  <div className="text-center fade-up">
                    <div className="w-10 h-10 rounded-xl bg-[#222] border border-[#333] flex items-center justify-center text-[12px] font-mono font-bold text-[#5e9eff] mx-auto mb-3 glow-pulse">{'//'}</div>
                    <div className="spinner mx-auto mb-2" />
                    <p className="text-[#777] text-[11px] font-mono">loading editor...</p>
                    <p className="text-[#444] text-[9px] font-mono mt-1">initializing Monaco + Yjs CRDT</p>
                  </div>
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
        {state.chatOpen && !zenMode && (
          <>
            {/* Desktop: resizable side panel */}
            <div
              className={`resizer w-[3px] flex-shrink-0 hidden sm:block ${isResizing && resizeType === 'sidebar' ? 'active' : ''}`}
              onMouseDown={handleMouseDown('sidebar')}
              onTouchStart={handleMouseDown('sidebar')}
            />
            {/* Desktop sidebar */}
            <div style={{ width: panelWidth }} className="room-sidebar flex-shrink-0 border-l border-[#282828] flex-col hidden sm:flex">
              <VideoChat socket={socketRef.current} currentUser={state.user} users={state.users} />
              <VoiceChat socket={socketRef.current} currentUser={state.user} />
              <div className="flex-1 min-h-0">
                <Chat messages={messages} onSendMessage={handleSendMessage} currentUser={state.user} socket={socketRef.current} />
              </div>
            </div>
            {/* Mobile: fullscreen overlay */}
            <div className="room-mobile-overlay fixed inset-0 bg-[#1a1b1e] flex flex-col sm:hidden" style={{ animation: 'slideInRight 0.2s cubic-bezier(0.22, 1, 0.36, 1)' }}>
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#282828] bg-[#19191c] flex-shrink-0">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#5e9eff]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  <span className="text-[12px] font-mono text-[#888]">chat & voice</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={toggleChat} className="p-2 text-[#666] hover:text-white rounded-lg hover:bg-[#222] active:scale-95 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
              <VideoChat socket={socketRef.current} currentUser={state.user} users={state.users} />
              <VoiceChat socket={socketRef.current} currentUser={state.user} />
              <div className="flex-1 min-h-0">
                <Chat messages={messages} onSendMessage={handleSendMessage} currentUser={state.user} socket={socketRef.current} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* v19: Competition Mode Banner */}
      {competitionMode === 'competition' && !zenMode && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#c4b5fd]/10 border-t border-[#c4b5fd]/20 text-[10px] font-mono flex-shrink-0">
          <svg className="w-3 h-3 text-[#c4b5fd]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          <span className="text-[#c4b5fd]">Competition Mode Active</span>
          {!isFullscreen && (
            <button onClick={enterFullscreen} className="ml-2 px-2 py-0.5 bg-[#c4b5fd] text-[#0a0a0a] rounded text-[9px] font-semibold hover:bg-[#d4c7ff] transition">
              Enter Fullscreen
            </button>
          )}
          {isFullscreen && <span className="text-[#5bd882] ml-2">✓ Fullscreen</span>}
        </div>
      )}

      {/* Status Bar */}
      {!zenMode && <div className="room-status-bar flex items-center gap-2 px-3 py-1 bg-[#19191c] border-t border-[#222] text-[9px] font-mono text-[#555]">
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
        {/* v18: Execution stats */}
        {execStats.runs > 0 && (
          <>
            <div className="w-px h-2.5 bg-[#333]" />
            <span className="hidden sm:inline text-[#888]" title={`${execStats.successes} passed, ${execStats.errors} failed, avg ${execStats.runs > 0 ? Math.round(execStats.totalTime / Math.max(execStats.successes, 1)) : 0}ms`}>
              <span className="text-[#5bd882]">{execStats.successes}✓</span>
              {execStats.errors > 0 && <span className="text-[#ff6b6b] ml-1">{execStats.errors}✗</span>}
              <span className="text-[#555] ml-1">({execStats.runs} runs)</span>
            </span>
          </>
        )}
        {/* v20: Line/char count */}
        {lineInfo.chars > 0 && (
          <>
            <div className="w-px h-2.5 bg-[#333]" />
            <span className="hidden sm:inline text-[#555] status-item-enter" title={`${lineInfo.chars} characters, ${wordCount} words`}>
              Ln {lineInfo.lines} · {wordCount}w
            </span>
          </>
        )}
        {/* v20: Activity sparkline */}
        {activityHistory.length > 3 && (
          <>
            <div className="w-px h-2.5 bg-[#333]" />
            <svg className="sparkline-svg hidden sm:inline-block" width="40" height="12" viewBox="0 0 40 12" title="Recent edit activity">
              <polyline
                fill="none"
                stroke="#5e9eff"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={(() => {
                  const hist = activityHistory.slice(-20);
                  if (hist.length < 2) return '0,6 40,6';
                  const minT = hist[0];
                  const maxT = hist[hist.length - 1];
                  const range = maxT - minT || 1;
                  // Create density bins
                  const bins = 10;
                  const counts = Array(bins).fill(0);
                  hist.forEach(t => {
                    const idx = Math.min(Math.floor(((t - minT) / range) * bins), bins - 1);
                    counts[idx]++;
                  });
                  const maxCount = Math.max(...counts, 1);
                  return counts.map((c, i) => `${(i / (bins - 1)) * 40},${12 - (c / maxCount) * 10}`).join(' ');
                })()}
              />
            </svg>
          </>
        )}
        {/* v20: Last edit time */}
        {lastEditTime && (
          <>
            <div className="w-px h-2.5 bg-[#333]" />
            <span className="hidden lg:inline text-[#444]" title={lastEditTime.toLocaleString()}>
              edited {lastEditTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </>
        )}
        {/* Session timer */}
        <div className="w-px h-2.5 bg-[#333]" />
        <span className="hidden sm:inline text-[#555]" title="Session time">{sessionTime}</span>
        {/* Spacer */}
        <div className="flex-1" />
        {/* v20: Typing sounds toggle */}
        <button onClick={() => setTypingSounds(prev => !prev)} title="Ambient typing sounds"
          className={`flex items-center gap-1 transition px-1.5 py-0.5 rounded active:scale-95 ${typingSounds ? 'text-[#5e9eff] bg-[#5e9eff]/10' : 'text-[#555] hover:text-[#aaa] hover:bg-[#222]'}`}>
          {typingSounds ? (
            <span className="flex items-end gap-[1px] h-[10px]">
              <span className="sound-wave-bar" style={{ height: '3px' }} />
              <span className="sound-wave-bar" style={{ height: '7px' }} />
              <span className="sound-wave-bar" style={{ height: '5px' }} />
              <span className="sound-wave-bar" style={{ height: '9px' }} />
            </span>
          ) : (
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
          )}
          <span className="hidden sm:inline">{typingSounds ? 'sound' : 'mute'}</span>
        </button>
        {/* v20: Zen mode toggle */}
        <button onClick={() => setZenMode(prev => !prev)} title="Zen Mode (Ctrl+Shift+Z)"
          className={`flex items-center gap-1 transition px-1.5 py-0.5 rounded active:scale-95 ${zenMode ? 'text-[#c4b5fd] bg-[#c4b5fd]/10' : 'text-[#555] hover:text-[#aaa] hover:bg-[#222]'}`}>
          <span className="text-[10px]">🧘</span>
          <span className="hidden sm:inline">{zenMode ? 'zen' : 'zen'}</span>
        </button>
        {/* v20: Export menu */}
        <div className="relative">
          <button onClick={() => setShowExportMenu(prev => !prev)}
            className="flex items-center gap-1 text-[#555] hover:text-[#aaa] transition px-1.5 py-0.5 rounded hover:bg-[#222] active:scale-95">
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <span className="hidden sm:inline">export</span>
          </button>
          {showExportMenu && (
            <div className="absolute bottom-full right-0 mb-1 bg-[#1a1b1e] border border-[#333] rounded-lg shadow-xl py-1 min-w-[160px] z-50">
              <button onClick={() => handleExportSnippet('raw')} className="w-full text-left px-3 py-1.5 text-[11px] text-[#aaa] hover:bg-[#222] hover:text-white transition">
                💾 Download raw
              </button>
              <button onClick={() => handleExportSnippet('with-header')} className="w-full text-left px-3 py-1.5 text-[11px] text-[#aaa] hover:bg-[#222] hover:text-white transition">
                📤 Download with header
              </button>
              <button onClick={() => handleExportSnippet('clipboard')} className="w-full text-left px-3 py-1.5 text-[11px] text-[#aaa] hover:bg-[#222] hover:text-white transition">
                📋 Copy to clipboard
              </button>
            </div>
          )}
        </div>
        {/* Share button */}
        <button onClick={() => setShowSharePopup(true)}
          className="flex items-center gap-1 text-[#555] hover:text-[#aaa] transition px-1.5 py-0.5 rounded hover:bg-[#222] active:scale-95">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
          <span className="hidden sm:inline">share</span>
        </button>
        {/* v19: Competition indicators */}
        {roomsLocked && (
          <>
            <div className="w-px h-2.5 bg-[#333]" />
            <span className="text-[#ff6b6b] flex items-center gap-1">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              locked
            </span>
          </>
        )}
        {competitionMode === 'competition' && (
          <>
            <div className="w-px h-2.5 bg-[#333]" />
            <span className="text-[#c4b5fd]">competition</span>
          </>
        )}
      </div>}

      {/* v18: Share Room Popup */}
      {showSharePopup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowSharePopup(false)}>
          <div className="modal-enter bg-[#1a1b1e] border border-[#333] rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-display font-semibold text-white">Share Room</h3>
              <button onClick={() => setShowSharePopup(false)} className="p-1.5 text-[#666] hover:text-white transition rounded-lg hover:bg-[#222]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {/* Room code */}
            <div className="mb-4">
              <label className="text-[10px] text-[#666] font-mono uppercase tracking-wider mb-1 block">Room Code</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2.5 bg-[#111] border border-[#282828] rounded-xl text-white font-mono text-lg text-center tracking-wider">{roomId}</div>
                <button onClick={() => { navigator.clipboard.writeText(roomId).catch(()=>{}); addToast('Room code copied!', 'info'); }}
                  className="p-2.5 bg-[#222] border border-[#333] rounded-xl text-[#888] hover:text-white hover:bg-[#2a2b30] transition active:scale-95">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </button>
              </div>
            </div>
            {/* Full URL */}
            <div className="mb-4">
              <label className="text-[10px] text-[#666] font-mono uppercase tracking-wider mb-1 block">Share Link</label>
              <div className="flex items-center gap-2">
                <input readOnly value={typeof window !== 'undefined' ? `${window.location.origin}/room/${roomId}` : ''}
                  className="flex-1 px-3 py-2 bg-[#111] border border-[#282828] rounded-xl text-[#aaa] font-mono text-[11px] truncate" />
                <button onClick={() => {
                  const url = `${window.location.origin}/room/${roomId}`;
                  navigator.clipboard.writeText(url).catch(()=>{});
                  addToast('Link copied!', 'info');
                }}
                  className="p-2.5 bg-[#5e9eff] text-[#0a0a0a] rounded-xl hover:bg-[#7ab3ff] transition active:scale-95 font-semibold text-[11px]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                </button>
              </div>
            </div>
            {/* Room info */}
            <div className="bg-[#111] rounded-xl border border-[#222] p-3 space-y-1.5 text-[11px] font-mono">
              <div className="flex justify-between"><span className="text-[#666]">Language</span><span style={{ color: LANGUAGES_MAP[state.language] || '#5e9eff' }}>{state.language}</span></div>
              <div className="flex justify-between"><span className="text-[#666]">Users</span><span className="text-[#aaa]">{state.users?.length || 1} online</span></div>
              <div className="flex justify-between"><span className="text-[#666]">Visibility</span><span className={isPublic ? 'text-[#5bd882]' : 'text-[#ffb347]'}>{isPublic ? 'Public' : 'Private'}</span></div>
              {roomName && <div className="flex justify-between"><span className="text-[#666]">Name</span><span className="text-[#aaa]">{roomName}</span></div>}
              <div className="flex justify-between"><span className="text-[#666]">Session</span><span className="text-[#aaa]">{sessionTime}</span></div>
            </div>
            {/* Native share (mobile) */}
            {typeof navigator !== 'undefined' && navigator.share && (
              <button onClick={() => {
                navigator.share({ title: `CollabCode — ${roomName || roomId}`, text: `Join my coding room on CollabCode!`, url: `${window.location.origin}/room/${roomId}` }).catch(()=>{});
              }}
                className="w-full mt-3 py-2.5 bg-[#222] text-[#aaa] rounded-xl hover:bg-[#2a2b30] transition text-[12px] font-mono border border-[#333] flex items-center justify-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Share via device...
              </button>
            )}
          </div>
        </div>
      )}

      {/* AntiCheat Indicator */}
      <AnticheatIndicator enabled={anticheatEnabled} violationCount={anticheatViolationCount} flagged={anticheatFlagged} />

      {/* Toast Notifications */}
      <div className="room-toasts fixed top-12 right-3 flex flex-col gap-1.5">
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
        <div className="room-modal-overlay fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center"
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
                { keys: ['Ctrl', ','], desc: 'Open settings' },
                { keys: ['Ctrl', 'L'], desc: 'Clear terminal' },
                { keys: ['Ctrl', 'Shift', 'Z'], desc: 'Toggle zen mode' },
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

      {/* v15: Enhanced Command Palette (Ctrl+K) — keyboard nav, categories, fuzzy search, icons */}
      {showCommandPalette && (() => {
        const ALL_COMMANDS = [
          { label: 'Run Code', hint: 'Ctrl+Enter', icon: '\u25B6', cat: 'code', action: () => { setShowCommandPalette(false); handleMainRun(); } },
          { label: 'Save File', hint: 'Ctrl+S', icon: '\u2B07', cat: 'file', action: () => { setShowCommandPalette(false); handleSaveFile(); } },
          { label: 'Open File', hint: 'Ctrl+O', icon: '\u2B06', cat: 'file', action: () => { setShowCommandPalette(false); handleOpenFile(); } },
          { label: 'Toggle File Explorer', hint: '', icon: '\uD83D\uDCC1', cat: 'panel', action: () => { setShowCommandPalette(false); setFilesOpen(!filesOpen); setExtensionsOpen(false); setLibrariesOpen(false); } },
          { label: 'Toggle Libraries', hint: '', icon: '\uD83D\uDCDA', cat: 'panel', action: () => { setShowCommandPalette(false); setLibrariesOpen(!librariesOpen); setFilesOpen(false); setExtensionsOpen(false); } },
          { label: 'Toggle Chat', hint: 'Ctrl+B', icon: '\uD83D\uDCAC', cat: 'panel', action: () => { setShowCommandPalette(false); toggleChat(); } },
          { label: 'Open Video Chat', hint: '', icon: '\uD83C\uDFA5', cat: 'panel', action: () => { setShowCommandPalette(false); if (!state.chatOpen) toggleChat(); } },
          { label: 'Toggle Terminal', hint: 'Ctrl+`', icon: '>_', cat: 'panel', action: () => { setShowCommandPalette(false); toggleOutput(); } },
          { label: 'Open Settings', hint: '', icon: '\u2699', cat: 'settings', action: () => { setShowCommandPalette(false); setShowSettingsModal(true); } },
          { label: 'Editor Settings (Side Panel)', hint: '', icon: '\uD83C\uDFA8', cat: 'settings', action: () => { setShowCommandPalette(false); setExtensionsOpen(!extensionsOpen); setFilesOpen(false); setLibrariesOpen(false); } },
          { label: 'Account Settings', hint: '', icon: '\uD83D\uDC64', cat: 'settings', action: () => { setShowCommandPalette(false); setShowAccountSettings(true); } },
          { label: 'Toggle Public/Private', hint: '', icon: isPublic ? '\uD83C\uDF10' : '\uD83D\uDD12', cat: 'room', action: () => { setShowCommandPalette(false); handleTogglePublic(); } },
          { label: 'Keyboard Shortcuts', hint: '?', icon: '\u2328', cat: 'help', action: () => { setShowCommandPalette(false); setShowShortcuts(true); } },
          { label: 'Go Home', hint: '', icon: '\uD83C\uDFE0', cat: 'nav', action: () => { setShowCommandPalette(false); router.push('/'); } },
          { label: 'Copy Room Code', hint: '', icon: '\uD83D\uDCCB', cat: 'room', action: () => { setShowCommandPalette(false); navigator.clipboard.writeText(roomId).catch(() => {}); addToast('Room code copied', 'info'); } },
          { label: 'Clear Terminal', hint: 'Ctrl+L', icon: '\uD83D\uDDD1', cat: 'code', action: () => { setShowCommandPalette(false); outputConsoleRef.current?.clear?.(); } },
          { label: 'Clear Notifications', hint: '', icon: '\uD83D\uDD14', cat: 'settings', action: () => { setShowCommandPalette(false); clearNotifications(); } },
          { label: 'Share Room', hint: '', icon: '\uD83D\uDD17', cat: 'room', action: () => { setShowCommandPalette(false); setShowSharePopup(true); } },
          { label: 'Copy Room URL', hint: '', icon: '\uD83C\uDF10', cat: 'room', action: () => { setShowCommandPalette(false); navigator.clipboard.writeText(`${window.location.origin}/room/${roomId}`).catch(()=>{}); addToast('Room URL copied!', 'info'); } },
          { label: 'Zen Mode', hint: 'Ctrl+Shift+Z', icon: '\uD83E\uDDD8', cat: 'panel', action: () => { setShowCommandPalette(false); setZenMode(prev => !prev); } },
          { label: 'Export Code (with header)', hint: '', icon: '\uD83D\uDCE4', cat: 'file', action: () => { setShowCommandPalette(false); handleExportSnippet('with-header'); } },
          { label: 'Export Code (raw)', hint: '', icon: '\uD83D\uDCBE', cat: 'file', action: () => { setShowCommandPalette(false); handleExportSnippet('raw'); } },
          { label: 'Copy Code to Clipboard', hint: '', icon: '\uD83D\uDCCB', cat: 'code', action: () => { setShowCommandPalette(false); handleExportSnippet('clipboard'); } },
          { label: 'Toggle Typing Sounds', hint: '', icon: '\uD83D\uDD0A', cat: 'settings', action: () => { setShowCommandPalette(false); setTypingSounds(prev => !prev); addToast(typingSounds ? 'Typing sounds off' : 'Typing sounds on', 'info'); } },
        ];
        // Fuzzy filter
        const q = cmdPaletteQuery.toLowerCase();
        const filtered = q ? ALL_COMMANDS.filter(c =>
          c.label.toLowerCase().includes(q) || c.cat.includes(q) || (c.hint && c.hint.toLowerCase().includes(q))
        ) : ALL_COMMANDS;
        // Category labels
        const CAT_LABELS = { code: 'Code', file: 'File', panel: 'Panels', settings: 'Settings', room: 'Room', help: 'Help', nav: 'Navigation' };
        // Group by category
        const grouped = {};
        filtered.forEach(cmd => {
          if (!grouped[cmd.cat]) grouped[cmd.cat] = [];
          grouped[cmd.cat].push(cmd);
        });
        // Flat list for keyboard nav
        const flatList = filtered;

        return (
          <div className="room-modal-overlay fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[12vh]"
            onClick={() => { setShowCommandPalette(false); setCmdPaletteQuery(''); setCmdPaletteFocusIdx(0); }}>
            <div className="modal-enter bg-[#1a1b1e] border border-[#333] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}>
              <div className="px-4 py-3 border-b border-[#282828] flex items-center gap-2">
                <svg className="w-4 h-4 text-[#555] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  type="text"
                  autoFocus
                  value={cmdPaletteQuery}
                  placeholder="Type a command..."
                  className="w-full bg-transparent text-[14px] text-white placeholder-[#555] focus:outline-none font-mono"
                  onChange={(e) => { setCmdPaletteQuery(e.target.value); setCmdPaletteFocusIdx(0); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { setShowCommandPalette(false); setCmdPaletteQuery(''); setCmdPaletteFocusIdx(0); }
                    if (e.key === 'ArrowDown') { e.preventDefault(); setCmdPaletteFocusIdx(prev => Math.min(prev + 1, flatList.length - 1)); }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setCmdPaletteFocusIdx(prev => Math.max(prev - 1, 0)); }
                    if (e.key === 'Enter' && flatList[cmdPaletteFocusIdx]) { flatList[cmdPaletteFocusIdx].action(); setCmdPaletteQuery(''); setCmdPaletteFocusIdx(0); }
                  }}
                />
                {cmdPaletteQuery && (
                  <button onClick={() => { setCmdPaletteQuery(''); setCmdPaletteFocusIdx(0); }} className="p-1 text-[#555] hover:text-[#aaa] transition rounded">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
              <div className="max-h-[50vh] overflow-y-auto py-1">
                {flatList.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-[12px] text-[#555] font-mono">no matching commands</p>
                    <p className="text-[10px] text-[#444] font-mono mt-1">try a different search term</p>
                  </div>
                ) : (
                  (() => {
                    let lastCat = null;
                    let flatIdx = -1;
                    return flatList.map((cmd) => {
                      flatIdx++;
                      const idx = flatIdx;
                      const showCatHeader = cmd.cat !== lastCat;
                      lastCat = cmd.cat;
                      return (
                        <div key={cmd.label}>
                          {showCatHeader && (
                            <div className="px-4 pt-2 pb-1">
                              <span className="text-[9px] font-mono text-[#444] uppercase tracking-widest">{CAT_LABELS[cmd.cat] || cmd.cat}</span>
                            </div>
                          )}
                          <button
                            onClick={() => { cmd.action(); setCmdPaletteQuery(''); setCmdPaletteFocusIdx(0); }}
                            onMouseEnter={() => setCmdPaletteFocusIdx(idx)}
                            className={`w-full flex items-center gap-3 px-4 py-2 text-[13px] transition ${
                              idx === cmdPaletteFocusIdx ? 'bg-[#5e9eff]/10 text-white' : 'text-[#999] hover:text-white hover:bg-[#222]'
                            }`}>
                            <span className="w-5 text-center text-[12px] flex-shrink-0 opacity-60">{cmd.icon}</span>
                            <span className="flex-1 text-left">{cmd.label}</span>
                            {cmd.hint && <kbd className="text-[10px] text-[#555] flex-shrink-0">{cmd.hint}</kbd>}
                          </button>
                        </div>
                      );
                    });
                  })()
                )}
              </div>
              <div className="px-4 py-2 border-t border-[#282828] flex items-center justify-between">
                <span className="text-[9px] text-[#444] font-mono">{flatList.length} command{flatList.length !== 1 ? 's' : ''}</span>
                <div className="flex items-center gap-2 text-[9px] text-[#444] font-mono">
                  <span><kbd className="text-[8px]">\u2191\u2193</kbd> navigate</span>
                  <span><kbd className="text-[8px]">\u21B5</kbd> select</span>
                  <span><kbd className="text-[8px]">esc</kbd> close</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* v15: Settings Modal — full-featured tabbed settings panel */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        editorTheme={state.theme}
        onEditorThemeChange={(t) => setTheme(t)}
        terminalTheme={terminalTheme}
        onTerminalThemeChange={setTerminalTheme}
        fontSize={editorFontSize}
        onFontSizeChange={setEditorFontSize}
        tabSize={editorTabSize}
        onTabSizeChange={setEditorTabSize}
        minimap={editorMinimap}
        onMinimapToggle={() => setEditorMinimap(!editorMinimap)}
        wordWrap={editorWordWrap}
        onWordWrapToggle={() => setEditorWordWrap(!editorWordWrap)}
        cursorStyle={editorCursorStyle}
        onCursorStyleChange={setEditorCursorStyle}
        bracketColors={editorBracketColors}
        onBracketColorsToggle={() => setEditorBracketColors(!editorBracketColors)}
        lineNumbers={editorLineNumbers}
        onLineNumbersToggle={() => setEditorLineNumbers(!editorLineNumbers)}
        autoIndent={editorAutoIndent}
        onAutoIndentToggle={() => setEditorAutoIndent(!editorAutoIndent)}
        notifSoundEnabled={notifSoundEnabled}
        onToggleNotifSound={() => setNotifSoundEnabled(!notifSoundEnabled)}
      />

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
