/**
 * Navbar Component
 * 
 * Top navigation bar with:
 * - Room info and copy-to-clipboard
 * - Language selector
 * - Connection status indicator
 * - Panel toggle buttons
 * - Keyboard shortcut hints
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

const CONNECTION_STATUS = {
  connected: { label: 'Connected', color: 'bg-green-400', pulse: false },
  connecting: { label: 'Connecting...', color: 'bg-yellow-400', pulse: true },
  disconnected: { label: 'Disconnected', color: 'bg-red-400', pulse: false },
};

const Navbar = memo(function Navbar({
  roomId,
  language,
  onLanguageChange,
  connectionStatus,
  users,
  onToggleChat,
  onToggleOutput,
  chatOpen,
  outputOpen,
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  const status = CONNECTION_STATUS[connectionStatus] || CONNECTION_STATUS.disconnected;
  const currentLang = LANGUAGES.find(l => l.id === language) || LANGUAGES[0];

  // ─── Copy Room ID ──────────────────────────────────────────────
  const handleCopyRoomId = useCallback(async () => {
    try {
      const url = `${window.location.origin}/room/${roomId}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for clipboard API failure
      const input = document.createElement('input');
      input.value = `${window.location.origin}/room/${roomId}`;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [roomId]);

  return (
    <nav className="flex items-center justify-between px-3 py-1.5 bg-[#252526] border-b border-editor-border z-50">
      {/* Left Section */}
      <div className="flex items-center gap-3">
        {/* Logo / Home */}
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-[#2a2d2e] transition-colors"
          title="Back to Home"
        >
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white">
            {'</>'}
          </div>
          <span className="text-sm font-semibold text-gray-300 hidden sm:inline">CollabCode</span>
        </button>

        {/* Separator */}
        <div className="w-px h-5 bg-editor-border" />

        {/* Room ID */}
        <button
          onClick={handleCopyRoomId}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-[#2a2d2e] transition-colors group"
          title="Click to copy room link"
        >
          <span className="text-xs text-gray-400 font-mono">{roomId}</span>
          <svg className={`w-3.5 h-3.5 transition-colors ${copied ? 'text-green-400' : 'text-gray-500 group-hover:text-gray-300'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {copied ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            )}
          </svg>
          {copied && (
            <span className="text-xs text-green-400 animate-fade-in">Copied!</span>
          )}
        </button>

        {/* Language Selector */}
        <div className="relative">
          <button
            onClick={() => setLangDropdownOpen(!langDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-[#2a2d2e] 
                     border border-editor-border/50 transition-colors"
          >
            <span 
              className="text-xs font-mono font-bold px-1 rounded"
              style={{ color: currentLang.color }}
            >
              {currentLang.icon}
            </span>
            <span className="text-xs text-gray-300 hidden sm:inline">{currentLang.name}</span>
            <svg className={`w-3 h-3 text-gray-500 transition-transform ${langDropdownOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown */}
          {langDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLangDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-1 w-48 bg-[#252526] border border-editor-border 
                            rounded-lg shadow-xl z-50 py-1 animate-fade-in">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.id}
                    onClick={() => {
                      onLanguageChange(lang.id);
                      setLangDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors
                      ${language === lang.id
                        ? 'bg-blue-600/20 text-blue-300'
                        : 'hover:bg-[#2a2d2e] text-gray-300'
                      }`}
                  >
                    <span className="font-mono font-bold w-5" style={{ color: lang.color }}>
                      {lang.icon}
                    </span>
                    <span>{lang.name}</span>
                    {language === lang.id && (
                      <svg className="w-3 h-3 ml-auto text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Connection Status */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" title={status.label}>
          <div className={`w-2 h-2 rounded-full ${status.color} ${status.pulse ? 'animate-pulse' : ''}`} />
          <span className="text-xs text-gray-400 hidden sm:inline">{status.label}</span>
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-editor-border" />

        {/* Toggle Output */}
        <button
          onClick={onToggleOutput}
          className={`p-1.5 rounded-md transition-colors ${outputOpen ? 'bg-[#2a2d2e] text-blue-400' : 'text-gray-500 hover:text-gray-300 hover:bg-[#2a2d2e]'}`}
          title={`${outputOpen ? 'Hide' : 'Show'} Output (Ctrl+\`)`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>

        {/* Toggle Chat */}
        <button
          onClick={onToggleChat}
          className={`p-1.5 rounded-md transition-colors ${chatOpen ? 'bg-[#2a2d2e] text-blue-400' : 'text-gray-500 hover:text-gray-300 hover:bg-[#2a2d2e]'}`}
          title={`${chatOpen ? 'Hide' : 'Show'} Chat (Ctrl+B)`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>

        {/* User count badge */}
        <div className="flex items-center gap-1 px-2 py-1 bg-[#2a2d2e] rounded-md">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <span className="text-xs text-gray-300 font-medium">{users?.length || 0}</span>
        </div>
      </div>
    </nav>
  );
});

export default Navbar;
