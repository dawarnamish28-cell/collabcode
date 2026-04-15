/**
 * Navbar v8.0 — Less toolbar, more personality
 * 
 * Ditched the VSCode-clone look. Now it's a minimal bar 
 * that gets out of your way but still feels warm.
 * 
 * made with <3 by Namish
 */

import { useState, useCallback, useEffect, memo } from 'react';
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

const Navbar = memo(function Navbar({
  roomId, language, onLanguageChange, connectionStatus, users,
  onToggleChat, onToggleOutput, chatOpen, outputOpen,
  onSaveFile, onOpenFile,
  isPublic, onTogglePublic,
  onToggleFiles, filesOpen,
  onToggleExtensions, extensionsOpen,
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const status = STATUS[connectionStatus] || STATUS.disconnected;
  const currentLang = LANGUAGES.find(l => l.id === language) || LANGUAGES[0];

  useEffect(() => {
    if (!langOpen) return;
    const close = (e) => {
      if (!e.target.closest('.lang-dropdown-container')) setLangOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [langOpen]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const input = document.createElement('input');
      input.value = roomId;
      document.body.appendChild(input); input.select(); document.execCommand('copy'); document.body.removeChild(input);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }
  }, [roomId]);

  return (
    <nav className="flex items-center justify-between px-2 sm:px-3 h-9 bg-[#19191c] border-b border-[#282828] z-50 flex-shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 overflow-x-auto scrollbar-none">
        {/* Home */}
        <button onClick={() => router.push('/')} className="flex items-center p-1 rounded-md hover:bg-[#222] transition flex-shrink-0" title="Home">
          <div className="w-5 h-5 rounded bg-[#222] border border-[#333] flex items-center justify-center text-[8px] font-mono font-bold text-[#5e9eff]">{'//'}
          </div>
        </button>

        {/* File Explorer */}
        <button onClick={onToggleFiles}
          className={`p-1.5 rounded-md transition flex-shrink-0 ${filesOpen ? 'bg-[#5e9eff]/10 text-[#5e9eff]' : 'text-[#555] hover:text-[#aaa] hover:bg-[#222]'}`}
          title="Files">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
        </button>

        <div className="w-px h-3.5 bg-[#282828] hidden sm:block flex-shrink-0" />

        {/* Room Code */}
        <button onClick={handleCopy} className="flex items-center gap-1 px-1.5 py-1 rounded-md hover:bg-[#222] transition group flex-shrink-0" title={copied ? 'Copied!' : 'Copy room code'}>
          <span className="text-[10px] text-[#777] font-mono tracking-widest font-bold">{roomId}</span>
          {copied ? (
            <svg className="w-3 h-3 text-[#5bd882]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          ) : (
            <svg className="w-3 h-3 text-[#555] group-hover:text-[#888]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
          )}
        </button>

        {/* Public/Private */}
        <button onClick={onTogglePublic}
          className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] transition flex-shrink-0 font-mono ${
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
        <div className="relative flex-shrink-0 lang-dropdown-container">
          <button onClick={() => setLangOpen(!langOpen)} className="flex items-center gap-1 px-1.5 py-1 rounded-md hover:bg-[#222] transition">
            <span className="text-[10px] font-mono font-bold" style={{ color: currentLang.color }}>{currentLang.icon}</span>
            <span className="text-[10px] text-[#888] hidden md:inline">{currentLang.name}</span>
            <svg className={`w-2.5 h-2.5 text-[#555] transition-transform ${langOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {langOpen && (
            <div className="absolute top-full left-0 mt-1 w-44 bg-[#1a1b1e] border border-[#333] rounded-xl shadow-2xl z-50 py-1 max-h-72 overflow-y-auto">
              {LANGUAGES.map(lang => (
                <button key={lang.id} onClick={() => { onLanguageChange(lang.id); setLangOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition ${language === lang.id ? 'bg-[#5e9eff]/10 text-[#5e9eff]' : 'hover:bg-[#222] text-[#999]'}`}>
                  <span className="font-mono font-bold w-5 flex-shrink-0" style={{ color: lang.color }}>{lang.icon}</span>
                  <span>{lang.name}</span>
                  {language === lang.id && <svg className="w-3 h-3 ml-auto text-[#5e9eff] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* File ops (desktop) */}
        <div className="hidden md:flex items-center gap-0.5">
          <button onClick={onOpenFile} className="p-1.5 rounded-md text-[#555] hover:text-[#aaa] hover:bg-[#222] transition" title="Open (Ctrl+O)">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /></svg>
          </button>
          <button onClick={onSaveFile} className="p-1.5 rounded-md text-[#555] hover:text-[#aaa] hover:bg-[#222] transition" title="Save (Ctrl+S)">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
          </button>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
        {/* Connection dot */}
        <div className="flex items-center gap-1 px-1.5 py-1" title={status.label}>
          <div className="w-[6px] h-[6px] rounded-full" style={{ background: status.color, boxShadow: status.pulse ? `0 0 6px ${status.color}` : 'none' }}>
            {status.pulse && <div className="w-full h-full rounded-full animate-ping" style={{ background: status.color, opacity: 0.4 }} />}
          </div>
          <span className="text-[9px] text-[#666] hidden lg:inline font-mono">{connectionStatus}</span>
        </div>

        {/* Extensions */}
        <button onClick={onToggleExtensions}
          className={`p-1.5 rounded-md transition ${extensionsOpen ? 'bg-[#c4b5fd]/10 text-[#c4b5fd]' : 'text-[#555] hover:text-[#aaa] hover:bg-[#222]'}`}
          title="Settings">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Terminal */}
        <button onClick={onToggleOutput} className={`p-1.5 rounded-md transition ${outputOpen ? 'bg-[#5e9eff]/10 text-[#5e9eff]' : 'text-[#555] hover:text-[#aaa] hover:bg-[#222]'}`} title="Terminal">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        </button>

        {/* Chat */}
        <button onClick={onToggleChat} className={`p-1.5 rounded-md transition ${chatOpen ? 'bg-[#5e9eff]/10 text-[#5e9eff]' : 'text-[#555] hover:text-[#aaa] hover:bg-[#222]'}`} title="Chat">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        </button>

        {/* User count — a subtle pill, not a badge */}
        <div className="flex items-center gap-1 px-2 py-1 bg-[#1e1f22] rounded-md border border-[#282828]">
          <div className="w-1 h-1 rounded-full bg-[#5bd882]" />
          <span className="text-[10px] text-[#888] font-mono">{users?.length || 0}</span>
        </div>
      </div>
    </nav>
  );
});

export default Navbar;
