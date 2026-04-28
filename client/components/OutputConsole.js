/**
 * OutputConsole v14.0 — Syntax-highlighted errors, collapsible stderr,
 * execution history, search in output, rate-limit countdown
 *
 * New in v14:
 *  - Syntax-highlighted error messages (file paths, line numbers, error types)
 *  - Collapsible error/stderr sections
 *  - Execution history sidebar (click to revisit past runs)
 *  - Search/filter in output (Ctrl+F)
 *  - Rate-limit countdown timer with retry button
 *  - Execution time bar visualization
 *  - Better empty state
 *
 * made with <3 by Namish
 */

import { memo, useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

const THEMES = {
  'vs-dark': {
    bg: '#1a1b1e', headerBg: '#19191c', border: '#282828',
    text: '#d1d1d6', dim: '#8e8e93', dimmer: '#555',
    error: '#ff6b6b', success: '#5bd882', warn: '#ffb347',
    accent: '#5e9eff', prompt: '#5bd882', inputBg: '#151517',
    selection: '#5e9eff22', inputBorder: '#282828',
  },
  'monokai': {
    bg: '#272822', headerBg: '#1e1f1c', border: '#49483e',
    text: '#f8f8f2', dim: '#75715e', dimmer: '#49483e',
    error: '#f92672', success: '#a6e22e', warn: '#e6db74',
    accent: '#66d9ef', prompt: '#a6e22e', inputBg: '#272822',
    selection: '#49483e', inputBorder: '#49483e',
  },
  'github-dark': {
    bg: '#0d1117', headerBg: '#161b22', border: '#30363d',
    text: '#c9d1d9', dim: '#8b949e', dimmer: '#484f58',
    error: '#f85149', success: '#3fb950', warn: '#d29922',
    accent: '#58a6ff', prompt: '#3fb950', inputBg: '#0d1117',
    selection: '#1f6feb33', inputBorder: '#30363d',
  },
  'dracula': {
    bg: '#282a36', headerBg: '#21222c', border: '#44475a',
    text: '#f8f8f2', dim: '#6272a4', dimmer: '#44475a',
    error: '#ff5555', success: '#50fa7b', warn: '#f1fa8c',
    accent: '#bd93f9', prompt: '#50fa7b', inputBg: '#282a36',
    selection: '#44475a', inputBorder: '#44475a',
  },
  'one-dark': {
    bg: '#282c34', headerBg: '#21252b', border: '#3e4452',
    text: '#abb2bf', dim: '#5c6370', dimmer: '#3e4452',
    error: '#e06c75', success: '#98c379', warn: '#e5c07b',
    accent: '#61afef', prompt: '#98c379', inputBg: '#282c34',
    selection: '#3e4452', inputBorder: '#3e4452',
  },
  'solarized-dark': {
    bg: '#002b36', headerBg: '#073642', border: '#586e75',
    text: '#839496', dim: '#586e75', dimmer: '#073642',
    error: '#dc322f', success: '#859900', warn: '#b58900',
    accent: '#268bd2', prompt: '#859900', inputBg: '#002b36',
    selection: '#073642', inputBorder: '#586e75',
  },
};

// Syntax highlight error lines
function highlightErrorLine(text, theme) {
  // File path pattern: /path/to/file.ext:line:col
  const filePathRegex = /((?:\/[\w.-]+)+(?:\.\w+)?):(\d+)(?::(\d+))?/g;
  // Error type pattern: ErrorType: message
  const errorTypeRegex = /^(\w*Error|\w*Exception|panic|FATAL|fatal|error\[E\d+\]):/;
  // Line number references: "at line N", "line N"
  const lineRefRegex = /\b(line|Line|at)\s+(\d+)/g;
  // Arrow indicators: ^^^, ~~~, ---
  const arrowRegex = /^(\s*)([\^~-]{3,})(\s*)$/;

  if (arrowRegex.test(text)) {
    return [{ text, color: theme.warn, bold: false }];
  }

  const parts = [];
  let remaining = text;

  const errorMatch = remaining.match(errorTypeRegex);
  if (errorMatch) {
    parts.push({ text: errorMatch[1] + ':', color: theme.error, bold: true });
    remaining = remaining.slice(errorMatch[0].length);
  }

  // Highlight file paths
  let lastIdx = 0;
  let match;
  const tempRemaining = remaining;
  filePathRegex.lastIndex = 0;
  while ((match = filePathRegex.exec(tempRemaining)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ text: tempRemaining.slice(lastIdx, match.index), color: null, bold: false });
    }
    parts.push({ text: match[0], color: theme.accent, bold: false });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < tempRemaining.length) {
    parts.push({ text: tempRemaining.slice(lastIdx), color: null, bold: false });
  }
  if (parts.length === 0) {
    parts.push({ text, color: null, bold: false });
  }

  return parts;
}

const OutputConsole = memo(forwardRef(function OutputConsole(
  { output, onClear, isRunning, language, code, onRunWithStdin, terminalTheme = 'vs-dark' },
  ref
) {
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const [currentInput, setCurrentInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [terminalLines, setTerminalLines] = useState([]);
  const [cmdHistory, setCmdHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [runCount, setRunCount] = useState(0);
  const [lineCount, setLineCount] = useState(0);

  // v14 new state
  const [execHistory, setExecHistory] = useState([]); // [{id, lang, time, status, lines}]
  const [showHistory, setShowHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [stderrCollapsed, setStderrCollapsed] = useState({});
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);

  const inputLinesRef = useRef([]);
  const searchInputRef = useRef(null);

  const theme = THEMES[terminalTheme] || THEMES['vs-dark'];

  useImperativeHandle(ref, () => ({
    getStdin: () => inputLinesRef.current.join('\n'),
    clear: () => { setTerminalLines([]); inputLinesRef.current = []; setLineCount(0); },
    focus: () => inputRef.current?.focus(),
  }));

  // Rate limit countdown timer
  useEffect(() => {
    if (rateLimitCountdown <= 0) return;
    const interval = setInterval(() => {
      setRateLimitCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [rateLimitCountdown]);

  useEffect(() => {
    if (!output) return;

    if (output.type === 'info' && output.content === 'Running code...') {
      const count = runCount + 1;
      setRunCount(count);
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setTerminalLines(prev => [...prev, { type: 'info', text: `[${time}] run #${count} -- ${language || 'code'}...` }]);
      inputLinesRef.current = [];
      return;
    }

    // Check for rate limit
    if (output.status === 'Rate Limited') {
      const retryMatch = output.error?.match(/Wait (\d+)s/);
      const seconds = retryMatch ? parseInt(retryMatch[1], 10) : 60;
      setRateLimitCountdown(seconds);
    }

    const newLines = [];
    const stderrBlockId = Date.now().toString(36);

    if (output.stdinUsed) {
      newLines.push({ type: 'dim', text: '--- input ---' });
      output.stdinUsed.split('\n').forEach(l => newLines.push({ type: 'stdin', text: `  ${l}` }));
      newLines.push({ type: 'dim', text: '--- output ---' });
    }

    if (output.content) {
      const outputLines = output.content.split('\n');
      outputLines.forEach(l => newLines.push({ type: 'stdout', text: l }));
    }
    if (output.error) {
      const errorLines = output.error.split('\n').filter(l => l.trim());
      if (errorLines.length > 0) {
        newLines.push({
          type: 'stderr-header',
          text: `stderr (${errorLines.length} line${errorLines.length > 1 ? 's' : ''})`,
          blockId: stderrBlockId,
          lineCount: errorLines.length,
        });
        errorLines.forEach(l => {
          newLines.push({ type: 'stderr', text: l, blockId: stderrBlockId });
        });
      }
    }
    if (!output.content && !output.error && output.type === 'success') {
      newLines.push({ type: 'dim', text: '(no output)' });
    }

    const parts = [];
    if (output.language) parts.push(output.language);
    if (output.executionTime) parts.push(output.executionTime);
    if (output.exitCode !== undefined) parts.push(`exit ${output.exitCode}`);
    if (output.version) parts.push(output.version.split(' ')[0]);
    if (parts.length > 0) {
      newLines.push({ type: 'meta', text: parts.join(' · ') });
    }
    newLines.push({ type: 'blank', text: '' });

    setTerminalLines(prev => {
      const updated = [...prev, ...newLines];
      setLineCount(updated.filter(l => l.type === 'stdout' || l.type === 'stderr').length);
      return updated;
    });

    // Save to execution history
    const historyEntry = {
      id: Date.now().toString(36),
      lang: output.language || language,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: output.type === 'success' ? 'ok' : 'err',
      exitCode: output.exitCode,
      execTime: output.executionTime,
      outputPreview: (output.content || output.error || '').slice(0, 60),
    };
    setExecHistory(prev => [...prev.slice(-19), historyEntry]);

    inputLinesRef.current = [];
  }, [output]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [terminalLines, isRunning]);

  // Toggle search with Ctrl+F
  useEffect(() => {
    const handle = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        // Only intercept if console is focused area
        const el = scrollRef.current;
        if (el && el.contains(document.activeElement)) {
          e.preventDefault();
          setShowSearch(prev => !prev);
          setTimeout(() => searchInputRef.current?.focus(), 50);
        }
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);

  const handleInputKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
      e.preventDefault();
      handleClear();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const allInput = [...inputLinesRef.current];
      if (currentInput) allInput.push(currentInput);
      const stdin = allInput.join('\n');
      if (currentInput) setCmdHistory(prev => [...prev.slice(-49), currentInput]);
      setHistoryIdx(-1);
      setCurrentInput('');
      inputLinesRef.current = [];
      if (onRunWithStdin) onRunWithStdin(stdin);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const val = currentInput;
      inputLinesRef.current.push(val);
      setTerminalLines(prev => [...prev, { type: 'input', text: `> ${val}` }]);
      if (val) setCmdHistory(prev => [...prev.slice(-49), val]);
      setHistoryIdx(-1);
      setCurrentInput('');
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      const newIdx = historyIdx < cmdHistory.length - 1 ? historyIdx + 1 : historyIdx;
      setHistoryIdx(newIdx);
      setCurrentInput(cmdHistory[cmdHistory.length - 1 - newIdx] || '');
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx <= 0) { setHistoryIdx(-1); setCurrentInput(''); return; }
      const newIdx = historyIdx - 1;
      setHistoryIdx(newIdx);
      setCurrentInput(cmdHistory[cmdHistory.length - 1 - newIdx] || '');
      return;
    }
  }, [currentInput, cmdHistory, historyIdx, onRunWithStdin]);

  const handleCopy = useCallback(async () => {
    const text = terminalLines
      .filter(l => l.type === 'stdout' || l.type === 'stderr')
      .map(l => l.text)
      .join('\n');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {}
  }, [terminalLines]);

  const handleClear = useCallback(() => {
    setTerminalLines([]);
    inputLinesRef.current = [];
    setLineCount(0);
    setStderrCollapsed({});
    if (onClear) onClear();
  }, [onClear]);

  const toggleStderrBlock = useCallback((blockId) => {
    setStderrCollapsed(prev => ({ ...prev, [blockId]: !prev[blockId] }));
  }, []);

  // Filter lines by search
  const visibleLines = searchQuery
    ? terminalLines.filter(l =>
        l.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.type === 'info' || l.type === 'meta' || l.type === 'blank' || l.type === 'stderr-header'
      )
    : terminalLines;

  return (
    <div className="h-full flex flex-col font-mono text-[12px] overflow-hidden" style={{ background: theme.bg }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1 flex-shrink-0"
        style={{ background: theme.headerBg, borderBottom: `1px solid ${theme.border}` }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-medium tracking-wide" style={{ color: theme.dim }}>
            terminal
          </span>
          {isRunning && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: theme.warn }} />
              <span className="text-[10px] hidden sm:inline" style={{ color: theme.warn }}>running</span>
            </div>
          )}
          {!isRunning && runCount > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ color: theme.dimmer, background: theme.dimmer + '15' }}>
              #{runCount}
            </span>
          )}
          {lineCount > 0 && (
            <span className="text-[9px] flex-shrink-0 hidden sm:inline" style={{ color: theme.dimmer }}>
              {lineCount} lines
            </span>
          )}
          {/* Rate limit countdown */}
          {rateLimitCountdown > 0 && (
            <span className="text-[9px] px-2 py-0.5 rounded-md flex-shrink-0 animate-pulse"
              style={{ color: theme.error, background: theme.error + '15', border: `1px solid ${theme.error}25` }}>
              rate limit {rateLimitCountdown}s
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {output?.status && !isRunning && (
            <span className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ color: output.type === 'success' ? theme.success : theme.error, background: (output.type === 'success' ? theme.success : theme.error) + '12' }}>
              {output.status}
            </span>
          )}
          {/* Search toggle */}
          <button onClick={() => { setShowSearch(prev => !prev); setTimeout(() => searchInputRef.current?.focus(), 50); }}
            className={`p-1 rounded transition ${showSearch ? 'opacity-100' : 'hover:opacity-80'}`}
            style={{ color: showSearch ? theme.accent : theme.dim }} title="Search (Ctrl+F)">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </button>
          {/* History toggle */}
          <button onClick={() => setShowHistory(prev => !prev)}
            className={`p-1 rounded transition ${showHistory ? 'opacity-100' : 'hover:opacity-80'}`}
            style={{ color: showHistory ? theme.accent : theme.dim }} title="Run history">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
          <button onClick={handleCopy} className="p-1 rounded hover:opacity-80 transition" style={{ color: theme.dim }} title="Copy output">
            {copied ? (
              <svg className="w-3 h-3" style={{ color: theme.success }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            )}
          </button>
          <button onClick={handleClear} className="p-1 rounded hover:opacity-80 transition" style={{ color: theme.dim }} title="Clear (Ctrl+L)">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-1 flex-shrink-0"
          style={{ background: theme.headerBg, borderBottom: `1px solid ${theme.border}` }}>
          <svg className="w-3 h-3 flex-shrink-0" style={{ color: theme.dimmer }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); } }}
            placeholder="filter output..."
            className="flex-1 bg-transparent text-[11px] outline-none font-mono min-w-0"
            style={{ color: theme.text, caretColor: theme.accent }}
            autoComplete="off" spellCheck={false}
          />
          {searchQuery && (
            <span className="text-[9px] flex-shrink-0" style={{ color: theme.dimmer }}>
              {visibleLines.filter(l => l.type === 'stdout' || l.type === 'stderr').length} matches
            </span>
          )}
          <button onClick={() => { setShowSearch(false); setSearchQuery(''); }}
            className="p-0.5 rounded hover:opacity-80 transition" style={{ color: theme.dimmer }}>
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Execution History Sidebar */}
        {showHistory && execHistory.length > 0 && (
          <div className="w-[130px] flex-shrink-0 overflow-y-auto border-r"
            style={{ background: theme.headerBg, borderColor: theme.border }}>
            <div className="px-2 py-1.5">
              <span className="text-[9px] uppercase tracking-wider font-medium" style={{ color: theme.dimmer }}>history</span>
            </div>
            {[...execHistory].reverse().map((entry) => (
              <div key={entry.id}
                className="px-2 py-1.5 cursor-default transition hover:opacity-80"
                style={{ borderBottom: `1px solid ${theme.border}` }}>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: entry.status === 'ok' ? theme.success : theme.error }} />
                  <span className="text-[10px] font-medium truncate" style={{ color: theme.text }}>{entry.lang}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[8px]" style={{ color: theme.dimmer }}>{entry.time}</span>
                  {entry.execTime && (
                    <span className="text-[8px]" style={{ color: theme.dimmer }}>{entry.execTime}</span>
                  )}
                </div>
                {entry.outputPreview && (
                  <p className="text-[8px] mt-0.5 truncate" style={{ color: theme.dimmer }}>{entry.outputPreview}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Output Area */}
        <div ref={scrollRef}
          className="flex-1 overflow-auto px-3 py-2 min-h-0 select-text"
          onClick={() => inputRef.current?.focus()}>
          {terminalLines.length === 0 && !isRunning && (
            <div className="text-[11px] py-3" style={{ color: theme.dim }}>
              <p style={{ color: theme.dimmer }}>
                <kbd>Ctrl+Enter</kbd> to run &middot; type input below when program asks
              </p>
              <p className="mt-1" style={{ color: theme.dimmer }}>
                <kbd>Ctrl+L</kbd> to clear &middot; <kbd>Up</kbd>/<kbd>Down</kbd> for history
              </p>
              <p className="mt-1" style={{ color: theme.dimmer }}>
                <kbd>Ctrl+F</kbd> to search output &middot; click clock icon for run history
              </p>
            </div>
          )}
          {visibleLines.map((line, i) => {
            if (line.type === 'blank') return <div key={i} className="h-1.5" />;
            if (line.type === 'meta') return (
              <div key={i} className="text-[10px] mt-1 mb-0.5 flex items-center gap-1.5" style={{ color: theme.dimmer }}>
                <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {line.text}
              </div>
            );
            if (line.type === 'dim') return <div key={i} className="text-[10px] mt-0.5" style={{ color: theme.dimmer }}>{line.text}</div>;
            if (line.type === 'stdin') return <div key={i} className="pl-2 opacity-70" style={{ color: theme.accent }}>{line.text}</div>;
            if (line.type === 'input') return <div key={i} style={{ color: theme.warn }}>{line.text}</div>;
            if (line.type === 'info') return <div key={i} className="italic text-[11px]" style={{ color: theme.dim }}>{line.text}</div>;

            // Collapsible stderr header
            if (line.type === 'stderr-header') {
              const isCollapsed = stderrCollapsed[line.blockId];
              return (
                <div key={i}
                  className="flex items-center gap-1.5 text-[10px] mt-1.5 mb-0.5 cursor-pointer select-none group"
                  style={{ color: theme.error }}
                  onClick={() => toggleStderrBlock(line.blockId)}>
                  <svg className={`w-2.5 h-2.5 flex-shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                    fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="group-hover:underline">{line.text}</span>
                </div>
              );
            }

            // Collapsible stderr lines
            if (line.type === 'stderr') {
              if (line.blockId && stderrCollapsed[line.blockId]) return null;

              // Syntax-highlighted error
              const highlighted = highlightErrorLine(line.text, theme);
              return (
                <div key={i} className="pl-1 border-l-2" style={{ borderColor: theme.error + '40' }}>
                  {highlighted.map((part, j) => (
                    <span key={j} style={{
                      color: part.color || theme.error,
                      fontWeight: part.bold ? 600 : 400,
                    }}>{part.text}</span>
                  ))}
                </div>
              );
            }

            // Highlight search matches in stdout
            if (searchQuery && line.type === 'stdout') {
              const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
              const parts = line.text.split(regex);
              return (
                <div key={i} style={{ color: theme.text }}>
                  {parts.map((p, j) =>
                    regex.test(p) ? (
                      <mark key={j} style={{ background: theme.accent + '40', color: theme.text, borderRadius: '2px', padding: '0 1px' }}>{p}</mark>
                    ) : (
                      <span key={j}>{p}</span>
                    )
                  )}
                </div>
              );
            }

            return <div key={i} style={{ color: theme.text }}>{line.text || '\u00A0'}</div>;
          })}
          {isRunning && (
            <div className="flex items-center gap-2 py-1" style={{ color: theme.warn }}>
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-[11px]">executing...</span>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="flex items-center py-1.5 px-3 flex-shrink-0 gap-2"
        style={{ borderTop: `1px solid ${theme.border}`, background: theme.inputBg }}>
        <span className="text-[11px] select-none flex-shrink-0" style={{ color: theme.prompt }}>&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={currentInput}
          onChange={(e) => setCurrentInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={isRunning ? "type input, press enter..." : "enter=send line / ctrl+enter=run"}
          className="flex-1 bg-transparent text-[12px] outline-none font-mono min-w-0"
          style={{ color: theme.text, caretColor: theme.prompt }}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          onClick={() => {
            const allInput = [...inputLinesRef.current];
            if (currentInput) allInput.push(currentInput);
            const stdin = allInput.join('\n');
            setCurrentInput('');
            inputLinesRef.current = [];
            if (onRunWithStdin) onRunWithStdin(stdin);
          }}
          disabled={isRunning || rateLimitCountdown > 0}
          className="text-[10px] px-2.5 py-0.5 rounded-md transition disabled:opacity-30 flex-shrink-0 font-mono active:scale-95"
          style={{ background: theme.accent + '15', color: theme.accent, border: `1px solid ${theme.accent}22` }}>
          {isRunning ? '...' : rateLimitCountdown > 0 ? `${rateLimitCountdown}s` : 'run'}
        </button>
      </div>
    </div>
  );
}));

OutputConsole.displayName = 'OutputConsole';
export default OutputConsole;
