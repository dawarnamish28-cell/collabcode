/**
 * Navbar v14.0 — Notification bell, session timer, polished
 *
 * New in v14:
 *  - Notification bell with dropdown history
 *  - Session timer displayed in navbar
 *  - Better command palette hints
 *  - Improved mobile touch targets
 *  - Subtle hover micro-animations
 *
 * made with <3 by Namish
 */

import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';

const LANGUAGES = [
  { id: 'javascript', name: 'JavaScript', icon: 'JS', color: '#f7df1e' },
  { id: 'typescript', name: 'TypeScript', icon: 'TS', color: '#3178c6' },
  { id: 'python', name: 'Python', icon: 'PY', color: '#3776ab' },
  { id: 'java', name: 'Java', icon: 'JV', color: '#ed8b00' },
  { id: 'cpp', name: 'C++', icon: 'C+', color: '#00599c' },
  { id: 'c', name: 'C', icon: 'C', color: '#a8b9cc' },
  { id: 'go', name: 'Go', icon: 'GO', color: '#00add8' },
  { id: 'rust', name: 'Rust', icon: 'RS', color: '#ce412b' },
  { id: 'ruby', name: 'Ruby', icon: 'RB', color: '#cc342d' },
  { id: 'php', name: 'PHP', icon: 'PH', color: '#777bb4' },
  { id: 'perl', name: 'Perl', icon: 'PL', color: '#39457e' },
  { id: 'r', name: 'R', icon: 'R', color: '#276dc3' },
  { id: 'bash', name: 'Bash', icon: 'SH', color: '#4eaa25' },
  { id: 'shell', name: 'Shell', icon: '$', color: '#89e051' },
  { id: 'awk', name: 'AWK', icon: 'AW', color: '#c4a000' },
  { id: 'lua', name: 'Lua', icon: 'LU', color: '#000080' },
  { id: 'fortran', name: 'Fortran', icon: 'FN', color: '#734f96' },
  { id: 'tcl', name: 'Tcl', icon: 'TC', color: '#e4cc98' },
  { id: 'sqlite', name: 'SQLite', icon: 'SQ', color: '#003b57' },
  { id: 'nasm', name: 'Assembly', icon: 'AS', color: '#6e4c13' },
];

const STATUS = {
  connected: { label: 'Connected', color: '#5bd882', pulse: false },
  connecting: { label: 'Connecting...', color: '#ffb347', pulse: true },
  disconnected: { label: 'Disconnected', color: '#ff6b6b', pulse: false },
};

// Portal component that renders into document.body
function DropdownPortal({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

const Navbar = memo(function Navbar({
  roomId, language, onLanguageChange, connectionStatus, users,
  onToggleChat, onToggleOutput, chatOpen, outputOpen,
  onSaveFile, onOpenFile,
  isPublic, onTogglePublic,
  onToggleFiles, filesOpen,
  onToggleExtensions, extensionsOpen,
  currentUser, onOpenAccountSettings,
  // v14 props
  sessionTime, notifications, onClearNotifications,
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [langSearch, setLangSearch] = useState('');
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userMenuPos, setUserMenuPos] = useState({ top: 0, right: 0 });
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifPos, setNotifPos] = useState({ top: 0, right: 0 });
  const langBtnRef = useRef(null);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const userBtnRef = useRef(null);
  const userMenuRef = useRef(null);
  const notifBtnRef = useRef(null);
  const notifRef = useRef(null);

  const status = STATUS[connectionStatus] || STATUS.disconnected;
  const currentLang = LANGUAGES.find(l => l.id === language) || LANGUAGES[0];

  const filteredLangs = langSearch
    ? LANGUAGES.filter(l => l.name.toLowerCase().includes(langSearch.toLowerCase()) || l.icon.toLowerCase().includes(langSearch.toLowerCase()))
    : LANGUAGES;

  const notifItems = notifications || [];
  const unreadNotifs = notifItems.filter(n => !n.read).length;

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!langOpen) return;
    const close = (e) => {
      if (langBtnRef.current && langBtnRef.current.contains(e.target)) return;
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
      setLangOpen(false);
      setLangSearch('');
      setFocusedIdx(-1);
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', close);
      document.addEventListener('touchstart', close);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [langOpen]);

  // Close user menu when clicking outside
  useEffect(() => {
    if (!userMenuOpen) return;
    const close = (e) => {
      if (userBtnRef.current && userBtnRef.current.contains(e.target)) return;
      if (userMenuRef.current && userMenuRef.current.contains(e.target)) return;
      setUserMenuOpen(false);
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', close);
      document.addEventListener('touchstart', close);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [userMenuOpen]);

  // Close notif dropdown when clicking outside
  useEffect(() => {
    if (!notifOpen) return;
    const close = (e) => {
      if (notifBtnRef.current && notifBtnRef.current.contains(e.target)) return;
      if (notifRef.current && notifRef.current.contains(e.target)) return;
      setNotifOpen(false);
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', close);
      document.addEventListener('touchstart', close);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [notifOpen]);

  // Close on escape & keyboard nav
  useEffect(() => {
    if (!langOpen) return;
    const handle = (e) => {
      if (e.key === 'Escape') {
        setLangOpen(false);
        setLangSearch('');
        setFocusedIdx(-1);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIdx(prev => Math.min(prev + 1, filteredLangs.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIdx(prev => Math.max(prev - 1, 0));
      }
      if (e.key === 'Enter' && focusedIdx >= 0 && focusedIdx < filteredLangs.length) {
        e.preventDefault();
        handleSelectLang(filteredLangs[focusedIdx].id);
      }
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [langOpen, focusedIdx, filteredLangs]);

  // Focus search when dropdown opens
  useEffect(() => {
    if (langOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [langOpen]);

  const toggleUserMenu = useCallback(() => {
    setLangOpen(false);
    setNotifOpen(false);
    if (!userMenuOpen && userBtnRef.current) {
      const rect = userBtnRef.current.getBoundingClientRect();
      const right = Math.max(4, window.innerWidth - rect.right);
      setUserMenuPos({ top: rect.bottom + 4, right });
    }
    setUserMenuOpen(prev => !prev);
  }, [userMenuOpen]);

  const toggleNotifDropdown = useCallback(() => {
    setLangOpen(false);
    setUserMenuOpen(false);
    if (!notifOpen && notifBtnRef.current) {
      const rect = notifBtnRef.current.getBoundingClientRect();
      const right = Math.max(4, window.innerWidth - rect.right);
      setNotifPos({ top: rect.bottom + 4, right });
    }
    setNotifOpen(prev => !prev);
  }, [notifOpen]);

  const toggleLangDropdown = useCallback(() => {
    if (!langOpen && langBtnRef.current) {
      const rect = langBtnRef.current.getBoundingClientRect();
      const left = Math.max(4, Math.min(rect.left, window.innerWidth - 220));
      setDropdownPos({ top: rect.bottom + 4, left });
    }
    setLangOpen(prev => !prev);
    if (langOpen) {
      setLangSearch('');
      setFocusedIdx(-1);
    }
  }, [langOpen]);

  const handleSelectLang = useCallback((langId) => {
    onLanguageChange(langId);
    setLangOpen(false);
    setLangSearch('');
    setFocusedIdx(-1);
  }, [onLanguageChange]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const input = document.createElement('input');
      input.value = roomId;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [roomId]);

  return (
    <nav className="flex items-center justify-between px-2 sm:px-3 h-10 sm:h-9 bg-[#19191c] border-b border-[#282828] z-40 flex-shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
        {/* Home */}
        <button onClick={() => router.push('/')} className="flex items-center p-1.5 sm:p-1 rounded-md hover:bg-[#222] transition flex-shrink-0 active:scale-95" title="Home">
          <div className="w-5 h-5 rounded bg-[#222] border border-[#333] flex items-center justify-center text-[8px] font-mono font-bold text-[#5e9eff]">{'//'}</div>
        </button>

        {/* File Explorer */}
        <button onClick={onToggleFiles}
          className={`p-2 sm:p-1.5 rounded-md transition flex-shrink-0 active:scale-95 ${filesOpen ? 'bg-[#5e9eff]/10 text-[#5e9eff]' : 'text-[#555] hover:text-[#aaa] hover:bg-[#222]'}`}
          title="Files">
          <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
        </button>

        <div className="w-px h-3.5 bg-[#282828] hidden sm:block flex-shrink-0" />

        {/* Room Code */}
        <button onClick={handleCopy} className="flex items-center gap-1 px-1.5 py-1.5 sm:py-1 rounded-md hover:bg-[#222] transition group flex-shrink-0 active:scale-95" title={copied ? 'Copied!' : 'Copy room code'}>
          <span className="text-[10px] text-[#777] font-mono tracking-widest font-bold">{roomId}</span>
          {copied ? (
            <svg className="w-3 h-3 text-[#5bd882]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          ) : (
            <svg className="w-3 h-3 text-[#555] group-hover:text-[#888]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
          )}
        </button>

        {/* Public/Private */}
        <button onClick={onTogglePublic}
          className={`hidden sm:flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] transition flex-shrink-0 font-mono ${
            isPublic ? 'text-[#5bd882] bg-[#5bd882]/8' : 'text-[#555] hover:text-[#888] hover:bg-[#222]'
          }`}
          title={isPublic ? 'Public' : 'Private'}>
          {isPublic ? (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          )}
          <span className="hidden md:inline">{isPublic ? 'pub' : 'prv'}</span>
        </button>

        <div className="w-px h-3.5 bg-[#282828] hidden sm:block flex-shrink-0" />

        {/* Language Selector */}
        <button
          ref={langBtnRef}
          onClick={toggleLangDropdown}
          className={`flex items-center gap-1 px-1.5 py-1.5 sm:py-1 rounded-md transition flex-shrink-0 active:scale-95 ${langOpen ? 'bg-[#222]' : 'hover:bg-[#222]'}`}
          title={`Language: ${currentLang.name}`}
        >
          <span className="text-[10px] font-mono font-bold" style={{ color: currentLang.color }}>{currentLang.icon}</span>
          <span className="text-[10px] text-[#888] hidden md:inline">{currentLang.name}</span>
          <svg className={`w-2.5 h-2.5 text-[#555] transition-transform duration-200 ${langOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>

        {/* File ops */}
        <div className="flex items-center gap-0.5">
          <button onClick={onOpenFile} className="p-2 sm:p-1.5 rounded-md text-[#555] hover:text-[#aaa] hover:bg-[#222] transition active:scale-95" title="Open File (Ctrl+O)">
            <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /></svg>
          </button>
          <button onClick={onSaveFile} className="p-2 sm:p-1.5 rounded-md text-[#555] hover:text-[#aaa] hover:bg-[#222] transition active:scale-95" title="Save File (Ctrl+S)">
            <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
          </button>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
        {/* Session timer (compact) */}
        {sessionTime && (
          <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono text-[#555]" title="Session duration">
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {sessionTime}
          </div>
        )}

        {/* Connection status */}
        <div className="flex items-center gap-1.5 px-1.5 py-1" title={status.label}>
          <div className="relative">
            <div className="w-[6px] h-[6px] rounded-full" style={{ background: status.color }}>
              {status.pulse && <div className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ background: status.color }} />}
            </div>
          </div>
          <span className="text-[9px] text-[#555] font-mono hidden sm:inline">{status.label.toLowerCase()}</span>
        </div>

        {/* Notification bell */}
        <button
          ref={notifBtnRef}
          onClick={toggleNotifDropdown}
          className={`relative p-2 sm:p-1.5 rounded-md transition active:scale-95 ${notifOpen ? 'bg-[#ffb347]/10 text-[#ffb347]' : 'text-[#555] hover:text-[#aaa] hover:bg-[#222]'}`}
          title="Notifications">
          <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {unreadNotifs > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-[#ff6b6b] text-white text-[7px] rounded-full flex items-center justify-center font-mono font-bold">
              {unreadNotifs > 9 ? '9+' : unreadNotifs}
            </span>
          )}
        </button>

        {/* Extensions */}
        <button onClick={onToggleExtensions}
          className={`p-2 sm:p-1.5 rounded-md transition active:scale-95 ${extensionsOpen ? 'bg-[#c4b5fd]/10 text-[#c4b5fd]' : 'text-[#555] hover:text-[#aaa] hover:bg-[#222]'}`}
          title="Settings">
          <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Terminal */}
        <button onClick={onToggleOutput} className={`p-2 sm:p-1.5 rounded-md transition active:scale-95 ${outputOpen ? 'bg-[#5e9eff]/10 text-[#5e9eff]' : 'text-[#555] hover:text-[#aaa] hover:bg-[#222]'}`} title="Terminal">
          <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        </button>

        {/* Chat */}
        <button onClick={onToggleChat} className={`p-2 sm:p-1.5 rounded-md transition active:scale-95 ${chatOpen ? 'bg-[#5e9eff]/10 text-[#5e9eff]' : 'text-[#555] hover:text-[#aaa] hover:bg-[#222]'}`} title="Chat">
          <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        </button>

        {/* User count */}
        <div className="flex items-center gap-1 px-1.5 py-1 bg-[#1e1f22] rounded-md border border-[#282828]">
          <div className="w-1 h-1 rounded-full bg-[#5bd882]" />
          <span className="text-[10px] text-[#888] font-mono">{users?.length || 0}</span>
        </div>

        <div className="w-px h-3.5 bg-[#282828] flex-shrink-0" />

        {/* User Avatar / Profile Button */}
        <button
          ref={userBtnRef}
          onClick={toggleUserMenu}
          className="flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-[#222] transition active:scale-95"
          title="Profile"
        >
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] border border-[#333]"
            style={{ background: (currentUser?.color || '#5e9eff') + '20', color: currentUser?.color || '#5e9eff' }}>
            {currentUser?.emoji || currentUser?.username?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <span className="text-[10px] text-[#888] font-mono hidden sm:inline max-w-[60px] truncate">
            {currentUser?.username || 'user'}
          </span>
        </button>
      </div>

      {/* Notification Dropdown Portal */}
      {notifOpen && (
        <DropdownPortal>
          <div
            ref={notifRef}
            className="fixed"
            style={{ top: notifPos.top, right: notifPos.right, zIndex: 99999 }}
          >
            <div className="w-64 bg-[#1a1b1e] border border-[#333] rounded-xl shadow-2xl overflow-hidden"
              style={{ animation: 'dropIn 0.15s cubic-bezier(0.22, 1, 0.36, 1)' }}>
              <div className="px-3 py-2.5 border-b border-[#282828] flex items-center justify-between">
                <span className="text-[11px] font-mono text-[#888]">notifications</span>
                {notifItems.length > 0 && (
                  <button onClick={() => { onClearNotifications?.(); setNotifOpen(false); }}
                    className="text-[9px] font-mono text-[#555] hover:text-[#aaa] transition px-1.5 py-0.5 rounded hover:bg-[#222]">
                    clear all
                  </button>
                )}
              </div>
              <div className="max-h-60 overflow-y-auto">
                {notifItems.length === 0 ? (
                  <div className="px-3 py-6 text-center">
                    <svg className="w-5 h-5 mx-auto mb-2 text-[#333]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <p className="text-[10px] text-[#555] font-mono">no notifications</p>
                  </div>
                ) : (
                  [...notifItems].reverse().slice(0, 15).map((notif, i) => (
                    <div key={i} className={`px-3 py-2 border-b border-[#222] last:border-0 transition ${!notif.read ? 'bg-[#5e9eff]/5' : 'hover:bg-[#222]'}`}>
                      <div className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                          style={{ background: notif.type === 'join' ? '#5bd882' : notif.type === 'leave' ? '#ff6b6b' : notif.type === 'error' ? '#ff6b6b' : '#5e9eff' }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-[#bbb] leading-tight">{notif.message}</p>
                          <p className="text-[9px] text-[#444] font-mono mt-0.5">{notif.time || ''}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </DropdownPortal>
      )}

      {/* User Menu Portal */}
      {userMenuOpen && (
        <DropdownPortal>
          <div
            ref={userMenuRef}
            className="fixed"
            style={{ top: userMenuPos.top, right: userMenuPos.right, zIndex: 99999 }}
          >
            <div className="w-52 bg-[#1a1b1e] border border-[#333] rounded-xl shadow-2xl py-1 overflow-hidden"
              style={{ animation: 'dropIn 0.15s cubic-bezier(0.22, 1, 0.36, 1)' }}>
              <div className="px-3 py-2.5 border-b border-[#282828]">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm border border-[#333]"
                    style={{ background: (currentUser?.color || '#5e9eff') + '15' }}>
                    {currentUser?.emoji || currentUser?.username?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-white truncate">{currentUser?.username || 'Anonymous'}</p>
                    <p className="text-[9px] text-[#555] font-mono truncate">
                      {currentUser?.authenticated ? currentUser?.email || 'signed in' : 'anonymous'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="py-1">
                <button onClick={() => { setUserMenuOpen(false); onOpenAccountSettings?.(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-[#999] hover:text-[#ccc] hover:bg-[#222] transition">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Account Settings
                </button>
                <button onClick={() => { setUserMenuOpen(false); onToggleExtensions?.(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-[#999] hover:text-[#ccc] hover:bg-[#222] transition">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                  Editor Settings
                </button>
              </div>
              <div className="border-t border-[#282828] py-1">
                <button onClick={() => { setUserMenuOpen(false); router.push('/'); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-[#999] hover:text-[#ccc] hover:bg-[#222] transition">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  Back to Home
                </button>
              </div>
            </div>
          </div>
        </DropdownPortal>
      )}

      {/* Language Dropdown Portal */}
      {langOpen && (
        <DropdownPortal>
          <div
            ref={dropdownRef}
            className="fixed"
            style={{ top: dropdownPos.top, left: dropdownPos.left, zIndex: 99999 }}
          >
            <div className="w-52 bg-[#1a1b1e] border border-[#333] rounded-xl shadow-2xl overflow-hidden"
              style={{ animation: 'dropIn 0.15s cubic-bezier(0.22, 1, 0.36, 1)' }}>
              {/* Search */}
              <div className="px-2 pt-2 pb-1">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={langSearch}
                  onChange={(e) => { setLangSearch(e.target.value); setFocusedIdx(0); }}
                  placeholder="search..."
                  className="w-full px-2.5 py-1.5 bg-[#111] border border-[#282828] rounded-lg text-[11px] text-white placeholder-[#555] focus:outline-none focus:border-[#5e9eff]/30 font-mono"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              {/* Language list */}
              <div className="py-1 max-h-72 overflow-y-auto">
                {filteredLangs.length === 0 ? (
                  <div className="px-3 py-3 text-[11px] text-[#555] text-center font-mono">no matches</div>
                ) : filteredLangs.map((lang, idx) => (
                  <button
                    key={lang.id}
                    onClick={() => handleSelectLang(lang.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-all duration-100 ${
                      language === lang.id
                        ? 'bg-[#5e9eff]/10 text-[#5e9eff]'
                        : idx === focusedIdx
                          ? 'bg-[#222] text-[#ccc]'
                          : 'hover:bg-[#222] text-[#999] hover:text-[#ccc]'
                    }`}
                  >
                    <span className="font-mono font-bold w-5 text-center flex-shrink-0" style={{ color: lang.color }}>{lang.icon}</span>
                    <span className="flex-1 text-left">{lang.name}</span>
                    {language === lang.id && (
                      <svg className="w-3.5 h-3.5 text-[#5e9eff] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DropdownPortal>
      )}
    </nav>
  );
});

export default Navbar;
