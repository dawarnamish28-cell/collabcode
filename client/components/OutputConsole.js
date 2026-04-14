/**
 * OutputConsole v8.0 — Interactive Terminal (Python IDLE-style)
 *
 * Key changes from v7:
 *  - Removed confusing "stdin buffering" concept entirely
 *  - Now works like Python IDLE / a real terminal:
 *      > Click "Run" or press Ctrl+Enter → code executes
 *      > If the program needs input(), a prompt appears inline
 *      > Type your response and press Enter → sent to the program
 *  - The terminal input at the bottom is ONLY for providing input
 *    when the program requests it (input(), scanf, gets, etc.)
 *  - Enter key adds exactly ONE line (fixed double-Enter bug)
 *  - Clean, minimal UI with themes
 *
 * made with <3 by Namish
 */

import { memo, useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

const THEMES = {
  'vs-dark': {
    bg: '#1e1e1e', headerBg: '#252526', border: '#3c3c3c',
    text: '#d4d4d4', dim: '#858585', dimmer: '#555',
    error: '#f14c4c', success: '#4ec9b0', warn: '#dcdcaa',
    accent: '#569cd6', prompt: '#4ec9b0', inputBg: '#1e1e1e',
    selection: '#264f78', inputBorder: '#3c3c3c',
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

  // Collected input lines for the current execution
  const inputLinesRef = useRef([]);

  const theme = THEMES[terminalTheme] || THEMES['vs-dark'];

  useImperativeHandle(ref, () => ({
    getStdin: () => inputLinesRef.current.join('\n'),
    clear: () => { setTerminalLines([]); inputLinesRef.current = []; },
    focus: () => inputRef.current?.focus(),
  }));

  // Process output when execution completes
  useEffect(() => {
    if (!output) return;

    if (output.type === 'info' && output.content === 'Running code...') {
      setTerminalLines(prev => [...prev, { type: 'info', text: `$ Running ${language || 'code'}...` }]);
      inputLinesRef.current = []; // reset stdin for new run
      return;
    }

    const newLines = [];

    // Show stdin that was used (if any)
    if (output.stdinUsed) {
      newLines.push({ type: 'dim', text: '\u2500 input provided \u2500' });
      output.stdinUsed.split('\n').forEach(l => newLines.push({ type: 'stdin', text: `  ${l}` }));
      newLines.push({ type: 'dim', text: '\u2500 output \u2500' });
    }

    if (output.content) {
      output.content.split('\n').forEach(l => newLines.push({ type: 'stdout', text: l }));
    }
    if (output.error) {
      output.error.split('\n').forEach(l => {
        if (l.trim()) newLines.push({ type: 'stderr', text: l });
      });
    }
    if (!output.content && !output.error && output.type === 'success') {
      newLines.push({ type: 'dim', text: '(program exited with no output)' });
    }

    // Metadata
    const parts = [];
    if (output.language) parts.push(output.language);
    if (output.executionTime) parts.push(output.executionTime);
    if (output.exitCode !== undefined) parts.push(`exit ${output.exitCode}`);
    if (parts.length > 0) {
      newLines.push({ type: 'meta', text: `[${parts.join(' \u00b7 ')}]` });
    }
    newLines.push({ type: 'blank', text: '' });
    setTerminalLines(prev => [...prev, ...newLines]);

    // Clear collected input after run completes
    inputLinesRef.current = [];
  }, [output]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [terminalLines, isRunning]);

  const handleInputKeyDown = useCallback((e) => {
    // Ctrl+L = clear terminal
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
      e.preventDefault();
      handleClear();
      return;
    }

    // Ctrl+Enter = run code with all collected input
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      // Add current input if not empty
      const allInput = [...inputLinesRef.current];
      if (currentInput) allInput.push(currentInput);
      const stdin = allInput.join('\n');
      if (currentInput) {
        setCmdHistory(prev => [...prev.slice(-49), currentInput]);
      }
      setHistoryIdx(-1);
      setCurrentInput('');
      inputLinesRef.current = [];
      if (onRunWithStdin) onRunWithStdin(stdin);
      return;
    }

    // Enter = provide ONE line of input (like typing in IDLE)
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); // prevent default form behavior — exactly ONE line
      const val = currentInput;
      inputLinesRef.current.push(val);
      setTerminalLines(prev => [...prev, { type: 'input', text: `> ${val}` }]);
      if (val) {
        setCmdHistory(prev => [...prev.slice(-49), val]);
      }
      setHistoryIdx(-1);
      setCurrentInput('');
      return; // IMPORTANT: return here, no further processing
    }

    // Arrow Up = history back
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      const newIdx = historyIdx < cmdHistory.length - 1 ? historyIdx + 1 : historyIdx;
      setHistoryIdx(newIdx);
      setCurrentInput(cmdHistory[cmdHistory.length - 1 - newIdx] || '');
      return;
    }

    // Arrow Down = history forward
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
    if (onClear) onClear();
  }, [onClear]);

  const inputCount = inputLinesRef.current.length;

  return (
    <div className="h-full flex flex-col font-mono text-[13px] overflow-hidden" style={{ background: theme.bg }}>
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-2 sm:px-3 py-1 flex-shrink-0"
        style={{ background: theme.headerBg, borderBottom: `1px solid ${theme.border}` }}>
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <div className="flex items-center gap-1 sm:gap-1.5">
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[#ff5f56] hover:brightness-90 cursor-pointer" onClick={handleClear} title="Clear" />
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[#27c93f]" />
          </div>
          <span className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wide ml-1 sm:ml-2 truncate" style={{ color: theme.dim }}>
            Terminal
          </span>
          {isRunning && (
            <div className="flex items-center gap-1 ml-1 flex-shrink-0">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: theme.warn }} />
              <span className="text-[10px] hidden sm:inline" style={{ color: theme.warn }}>Running...</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
          {output?.status && !isRunning && (
            <span className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded"
              style={{ color: output.type === 'success' ? theme.success : theme.error }}>
              {output.status}
            </span>
          )}
          <button onClick={handleCopy} className="p-0.5 sm:p-1 rounded hover:opacity-80 transition" style={{ color: theme.dim }} title="Copy output">
            {copied ? (
              <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" style={{ color: theme.success }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            )}
          </button>
          <button onClick={handleClear} className="p-0.5 sm:p-1 rounded hover:opacity-80 transition" style={{ color: theme.dim }} title="Clear (Ctrl+L)">
            <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>

      {/* Terminal Output Area */}
      <div ref={scrollRef}
        className="flex-1 overflow-auto px-2 sm:px-3 py-2 min-h-0 select-text"
        onClick={() => inputRef.current?.focus()}>
        {terminalLines.length === 0 && !isRunning && (
          <div className="text-[11px] sm:text-xs py-3" style={{ color: theme.dim }}>
            <p>CollabCode Terminal &mdash; 20 languages supported</p>
            <p className="mt-1.5" style={{ color: theme.dimmer }}>
              Press <kbd className="px-1 py-0.5 rounded text-[10px]" style={{ background: theme.border, color: theme.text }}>Ctrl+Enter</kbd> to run your code
            </p>
            <p className="mt-0.5" style={{ color: theme.dimmer }}>
              Type input below when program requests it (input, scanf, etc.)
            </p>
          </div>
        )}
        {terminalLines.map((line, i) => {
          if (line.type === 'blank') return <div key={i} className="h-1.5" />;
          if (line.type === 'meta') return <div key={i} className="text-[10px] mt-0.5 mb-1" style={{ color: theme.dimmer }}>{line.text}</div>;
          if (line.type === 'dim') return <div key={i} className="text-[11px] mt-0.5" style={{ color: theme.dimmer }}>{line.text}</div>;
          if (line.type === 'stdin') return <div key={i} className="pl-2 opacity-70" style={{ color: theme.accent }}>{line.text}</div>;
          if (line.type === 'input') return <div key={i} style={{ color: theme.warn }}>{line.text}</div>;
          if (line.type === 'stderr') return <div key={i} style={{ color: theme.error }}>{line.text}</div>;
          if (line.type === 'info') return <div key={i} className="italic" style={{ color: theme.dim }}>{line.text}</div>;
          // stdout
          return <div key={i} style={{ color: theme.text }}>{line.text || '\u00A0'}</div>;
        })}
        {isRunning && (
          <div className="flex items-center gap-2 py-1" style={{ color: theme.warn }}>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-xs">Executing...</span>
          </div>
        )}
      </div>

      {/* Input Line — acts like IDLE input prompt */}
      <div className="flex items-center py-1 sm:py-1.5 px-2 sm:px-3 flex-shrink-0 gap-1 sm:gap-2"
        style={{ borderTop: `1px solid ${theme.border}`, background: theme.inputBg }}>
        <span className="text-xs select-none flex-shrink-0" style={{ color: theme.prompt }}>&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={currentInput}
          onChange={(e) => setCurrentInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={isRunning ? "Type input here, press Enter to send..." : "Input \u00b7 Enter=send line \u00b7 Ctrl+Enter=run"}
          className="flex-1 bg-transparent text-[12px] sm:text-[13px] outline-none font-mono min-w-0"
          style={{ color: theme.text, caretColor: theme.prompt, '::placeholder': { color: theme.dimmer } }}
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
          disabled={isRunning}
          className="text-[10px] px-2 sm:px-2.5 py-0.5 sm:py-1 rounded transition disabled:opacity-40 flex-shrink-0 font-medium hover:brightness-110"
          style={{ background: '#0e639c', color: 'white' }}>
          {isRunning ? '...' : 'Run'}
        </button>
      </div>
    </div>
  );
}));

OutputConsole.displayName = 'OutputConsole';
export default OutputConsole;
