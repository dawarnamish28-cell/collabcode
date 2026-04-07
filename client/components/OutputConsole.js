/**
 * OutputConsole v2.0 — Interactive Terminal
 * 
 * Features:
 * - Separate stdout/stderr with color coding
 * - Expandable stdin input panel (for input()/scanf()/etc.)
 * - Execution history (last 10 runs)
 * - Copy-to-clipboard
 * - Language-specific execution info
 * - Interactive feel with timing and engine display
 */

import { memo, useRef, useEffect, useState, useCallback } from 'react';

const OutputConsole = memo(function OutputConsole({ output, onClear, isRunning, onRunWithStdin, language }) {
  const scrollRef = useRef(null);
  const [stdinValue, setStdinValue] = useState('');
  const [showStdin, setShowStdin] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const stdinRef = useRef(null);

  useEffect(() => {
    if (output && (output.content || output.error) && output.type !== 'info') {
      setHistory(prev => [...prev.slice(-9), { ...output, timestamp: new Date(), language }]);
    }
  }, [output]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [output]);

  const handleCopy = useCallback(async () => {
    const text = output?.content || output?.error || '';
    if (!text) return;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (e) {}
  }, [output]);

  const handleRunStdin = useCallback(() => {
    if (onRunWithStdin) onRunWithStdin(stdinValue);
  }, [stdinValue, onRunWithStdin]);

  // Stdin hints per language
  const stdinHints = {
    python: 'Provide input for input() calls, one per line',
    javascript: 'Provide input for readline, one per line',
    c: 'Provide input for scanf()/fgets(), one per line',
    cpp: 'Provide input for cin/getline, one per line',
    java: 'Provide input for Scanner, one per line',
    go: 'Provide input for bufio.Reader, one per line',
    rust: 'Provide input for stdin().read_line(), one per line',
    ruby: 'Provide input for gets, one per line',
    php: 'Provide input for fgets(STDIN), one per line',
  };

  return (
    <div className="h-full flex flex-col bg-[#1a1b26]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#252526] border-b border-editor-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs font-medium text-gray-400">Terminal</span>
          {isRunning && <div className="flex items-center gap-1.5 ml-2"><div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" /><span className="text-xs text-yellow-400">Running...</span></div>}
          {output?.engine && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2a2d2e] text-gray-500 font-mono ml-1">{output.engine}</span>}
          {output?.executionTime && <span className="text-[10px] text-gray-500 font-mono">{output.executionTime}</span>}
          {output?.version && <span className="text-[10px] text-gray-600 font-mono hidden sm:inline">{output.version}</span>}
        </div>
        <div className="flex items-center gap-1">
          {output?.status && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full border
              ${output.type === 'success' ? 'bg-green-600/15 text-green-400 border-green-600/30' : ''}
              ${output.type === 'error' ? 'bg-red-600/15 text-red-400 border-red-600/30' : ''}
              ${output.type === 'info' ? 'bg-blue-600/15 text-blue-400 border-blue-600/30' : ''}`}>
              {output.status}
            </span>
          )}
          {output?.exitCode !== undefined && output?.exitCode !== null && output.exitCode !== 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600/15 text-red-400 font-mono">exit:{output.exitCode}</span>
          )}

          {/* History toggle */}
          <button onClick={() => setShowHistory(!showHistory)}
            className={`p-1 rounded transition ${showHistory ? 'bg-purple-600/20 text-purple-400' : 'text-gray-500 hover:text-gray-300 hover:bg-[#2a2d2e]'}`}
            title={`History (${history.length} runs)`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>

          {/* Stdin toggle */}
          <button onClick={() => { setShowStdin(!showStdin); setTimeout(() => stdinRef.current?.focus(), 100); }}
            className={`p-1 rounded transition ${showStdin ? 'bg-blue-600/20 text-blue-400' : 'text-gray-500 hover:text-gray-300 hover:bg-[#2a2d2e]'}`}
            title="Toggle stdin input (for input()/scanf())">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>
          </button>

          {/* Copy */}
          <button onClick={handleCopy} disabled={!output?.content && !output?.error}
            className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-[#2a2d2e] transition disabled:opacity-30" title="Copy output">
            {copied ? <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
          </button>

          {/* Clear */}
          <button onClick={() => { onClear(); setHistory([]); }}
            className="p-1 rounded hover:bg-[#2a2d2e] text-gray-500 hover:text-gray-300 transition" title="Clear">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>

      {/* Stdin Input */}
      {showStdin && (
        <div className="px-3 py-2 bg-[#1e1f2e] border-b border-editor-border flex-shrink-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">stdin</span>
            <span className="text-[10px] text-gray-600">{stdinHints[language] || 'Provide input, one per line'}</span>
          </div>
          <div className="flex items-start gap-2">
            <textarea ref={stdinRef} value={stdinValue} onChange={(e) => setStdinValue(e.target.value)}
              placeholder="Enter input here..." rows={3}
              className="flex-1 bg-[#0d0e17] border border-editor-border/50 rounded px-2 py-1.5 text-xs text-gray-300 font-mono placeholder-gray-600 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
          </div>
          <div className="flex justify-between items-center mt-1.5">
            <span className="text-[10px] text-gray-600">{stdinValue.split('\n').filter(Boolean).length} line(s)</span>
            <button onClick={handleRunStdin} disabled={isRunning}
              className="text-[10px] px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded font-medium transition disabled:opacity-50">
              ▶ Run with Input
            </button>
          </div>
        </div>
      )}

      {/* History Panel */}
      {showHistory && history.length > 0 && (
        <div className="px-3 py-2 bg-[#1e1f2e] border-b border-editor-border flex-shrink-0 max-h-32 overflow-y-auto">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider">History</span>
            <span className="text-[10px] text-gray-600">{history.length} run(s)</span>
          </div>
          <div className="space-y-1">
            {history.slice().reverse().map((h, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                <span className={h.type === 'success' ? 'text-green-400' : 'text-red-400'}>{h.type === 'success' ? '✓' : '✗'}</span>
                <span className="text-gray-500">{h.language}</span>
                <span className="text-gray-600">{h.executionTime}</span>
                <span className="text-gray-700">{h.timestamp?.toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Output Content */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-3 font-mono text-sm min-h-0">
        {!output && !isRunning && (
          <div className="h-full flex items-center justify-center text-gray-600 text-xs">
            <div className="text-center space-y-2">
              <div className="text-2xl opacity-20">{'>'}_</div>
              <p>Press <kbd className="px-1.5 py-0.5 bg-[#252526] rounded text-[10px] mx-0.5 border border-editor-border/50">Ctrl</kbd>+<kbd className="px-1.5 py-0.5 bg-[#252526] rounded text-[10px] mx-0.5 border border-editor-border/50">Enter</kbd> to run code</p>
              <p className="text-gray-700 text-[10px]">All 10 languages supported with local execution | Use stdin for input()/scanf()</p>
            </div>
          </div>
        )}

        {isRunning && (!output || output.type === 'info') && (
          <div className="flex items-center gap-3 text-yellow-400 py-2">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <div><span className="text-sm">Executing code...</span><span className="text-xs text-yellow-600 block">Compiling & running in isolated sandbox</span></div>
          </div>
        )}

        {output && output.type !== 'info' && (
          <div className="space-y-2">
            {output.content && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] text-green-500 font-semibold uppercase tracking-wider">stdout</span>
                  <div className="flex-1 h-px bg-green-500/10" />
                </div>
                <pre className="whitespace-pre-wrap break-words text-gray-200 bg-[#12131e] rounded-md px-3 py-2 border border-green-500/10 leading-relaxed">{output.content}</pre>
              </div>
            )}
            {output.error && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">{output.phase === 'compile' ? 'Compiler Error' : 'stderr'}</span>
                  <div className="flex-1 h-px bg-red-500/10" />
                </div>
                <pre className="whitespace-pre-wrap break-words text-red-300 bg-red-950/30 rounded-md px-3 py-2 border border-red-500/15 leading-relaxed">{output.error}</pre>
              </div>
            )}
            {!output.content && !output.error && output.type === 'success' && (
              <div className="text-gray-500 text-xs italic py-2">Program executed successfully with no output.</div>
            )}
            <div className="flex items-center gap-3 pt-1 text-[10px] text-gray-600 border-t border-gray-800 mt-2">
              {output.engine && <span><span className="text-gray-500">Engine:</span> <span className="text-gray-400">{output.engine}</span></span>}
              {output.language && <span><span className="text-gray-500">Lang:</span> <span className="text-gray-400">{output.language}</span></span>}
              {output.executionTime && <span><span className="text-gray-500">Time:</span> <span className="text-gray-400">{output.executionTime}</span></span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default OutputConsole;
