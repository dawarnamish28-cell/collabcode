/**
 * Navbar Component v3.0
 * 
 * Improvements:
 * - Mobile responsive (collapses items)
 * - Better tooltips
 * - Cleaner layout
 */

import { useState, useCallback, memo } from 'react';
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
];

const STATUS = {
  connected: { label: 'Connected', color: 'bg-green-400', pulse: false },
  connecting: { label: 'Connecting...', color: 'bg-yellow-400', pulse: true },
  disconnected: { label: 'Disconnected', color: 'bg-red-400', pulse: false },
};

const Navbar = memo(function Navbar({ roomId, language, onLanguageChange, connectionStatus, users, onToggleChat, onToggleOutput, chatOpen, outputOpen, onSaveFile, onOpenFile }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const status = STATUS[connectionStatus] || STATUS.disconnected;
  const currentLang = LANGUAGES.find(l => l.id === language) || LANGUAGES[0];

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
    <nav className="flex items-center justify-between px-2 sm:px-3 py-1.5 bg-[#252526] border-b border-editor-border z-50">
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        {/* Home */}
        <button onClick={() => router.push('/')} className="flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-[#2a2d2e] transition flex-shrink-0" title="Home">
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-[8px] sm:text-[10px] font-bold text-white">{'<>'}</div>
          <span className="text-xs font-semibold text-gray-300 hidden md:inline">CollabCode</span>
        </button>
        <div className="w-px h-4 bg-editor-border/50 hidden sm:block" />

        {/* Room Code */}
        <button onClick={handleCopy} className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-md hover:bg-[#2a2d2e] transition group flex-shrink-0" title={copied ? 'Copied!' : 'Copy room code'}>
          <span className="text-[10px] sm:text-xs text-gray-400 font-mono tracking-widest font-bold">{roomId}</span>
          {copied ? (
            <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          ) : (
            <svg className="w-3 h-3 text-gray-500 group-hover:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
          )}
        </button>

        {/* Language Selector */}
        <div className="relative flex-shrink-0">
          <button onClick={() => setLangOpen(!langOpen)} className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded-md hover:bg-[#2a2d2e] border border-editor-border/50 transition">
            <span className="text-xs font-mono font-bold px-0.5 rounded" style={{ color: currentLang.color }}>{currentLang.icon}</span>
            <span className="text-xs text-gray-300 hidden sm:inline">{currentLang.name}</span>
            <svg className={`w-3 h-3 text-gray-500 transition-transform ${langOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {langOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
              <div className="absolute top-full left-0 mt-1 w-48 bg-[#252526] border border-editor-border rounded-lg shadow-xl z-50 py-1 max-h-80 overflow-y-auto">
                {LANGUAGES.map(lang => (
                  <button key={lang.id} onClick={() => { onLanguageChange(lang.id); setLangOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition ${language === lang.id ? 'bg-blue-600/20 text-blue-300' : 'hover:bg-[#2a2d2e] text-gray-300'}`}>
                    <span className="font-mono font-bold w-5" style={{ color: lang.color }}>{lang.icon}</span>
                    <span>{lang.name}</span>
                    {language === lang.id && <svg className="w-3 h-3 ml-auto text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="w-px h-4 bg-editor-border/50 hidden md:block" />

        {/* File operations */}
        <div className="hidden md:flex items-center gap-0.5">
          <button onClick={onOpenFile} className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-[#2a2d2e] transition" title="Open File (Ctrl+O)">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /></svg>
          </button>
          <button onClick={onSaveFile} className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-[#2a2d2e] transition" title="Save File (Ctrl+S)">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Connection status */}
        <div className="flex items-center gap-1 px-1.5 py-1 rounded-md" title={status.label}>
          <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${status.color} ${status.pulse ? 'animate-pulse' : ''}`} />
          <span className="text-[10px] text-gray-400 hidden lg:inline">{status.label}</span>
        </div>
        <div className="w-px h-4 bg-editor-border/50" />

        {/* Toggle buttons */}
        <button onClick={onToggleOutput} className={`p-1.5 rounded-md transition ${outputOpen ? 'bg-[#2a2d2e] text-blue-400' : 'text-gray-500 hover:text-gray-300 hover:bg-[#2a2d2e]'}`} title="Toggle Terminal (Ctrl+`)">
          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        </button>
        <button onClick={onToggleChat} className={`p-1.5 rounded-md transition ${chatOpen ? 'bg-[#2a2d2e] text-blue-400' : 'text-gray-500 hover:text-gray-300 hover:bg-[#2a2d2e]'}`} title="Toggle Chat (Ctrl+B)">
          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        </button>

        {/* User count */}
        <div className="flex items-center gap-1 px-1.5 sm:px-2 py-1 bg-[#2a2d2e] rounded-md">
          <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          <span className="text-[10px] sm:text-xs text-gray-300 font-medium">{users?.length || 0}</span>
        </div>
      </div>
    </nav>
  );
});

export default Navbar;
