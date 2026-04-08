/**
 * OutputConsole v4.0 — Interactive Terminal with Inline stdin
 * 
 * CORE FIX: stdin is now INLINE in the terminal — not a hidden tab.
 * When code uses input()/scanf()/etc., the stdin area appears prominently
 * ABOVE the output, always visible. Users type input → hit Run → see output.
 *
 * The "Run with Input" button is THE primary way to execute input-requiring code.
 * The main Run button auto-delegates to this when stdin is needed.
 *
 * Features:
 * - Inline stdin area (always visible when code needs input)
 * - Smart auto-detection of input patterns per language
 * - Separate stdout/stderr with color coding
 * - Execution history (last 10 runs)
 * - Copy-to-clipboard
 * - Rich metadata display
 * - Keyboard: Ctrl+Enter in stdin textarea runs code
 */

import { memo, useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';

// ─── Input Pattern Detection ──────────────────────────────────────────
const INPUT_PATTERNS = {
  python: [/\binput\s*\(/, /\bsys\.stdin/, /\bread\s*\(/],
  javascript: [/\breadline/, /\bprocess\.stdin/, /\bprompt\s*\(/],
  typescript: [/\breadline/, /\bprocess\.stdin/, /\bprompt\s*\(/],
  c: [/\bscanf\s*\(/, /\bfgets\s*\(/, /\bgetchar\s*\(/, /\bgets\s*\(/, /\bgetline\s*\(/],
  cpp: [/\bcin\s*>>/, /\bgetline\s*\(/, /\bscanf\s*\(/, /\bgetchar\s*\(/],
  java: [/\bScanner\b/, /\bSystem\.in\b/, /\bBufferedReader\b/, /\bConsole\b/],
  go: [/\bbufio\./, /\bfmt\.Scan/, /\bos\.Stdin/],
  rust: [/\bstdin\(\)/, /\bread_line\s*\(/],
  ruby: [/\bgets\b/, /\bSTDIN\b/, /\breadline\b/],
  php: [/\bfgets\s*\(\s*STDIN/, /\breadline\s*\(/, /\bfscanf\s*\(\s*STDIN/],
};

function detectNeedsInput(code, language) {
  if (!code) return false;
  const patterns = INPUT_PATTERNS[language] || [];
  return patterns.some(p => p.test(code));
}

function countInputCalls(code, language) {
  if (!code) return 0;
  const counts = {
    python: (code.match(/\binput\s*\(/g) || []).length,
    c: (code.match(/\bscanf\s*\(/g) || []).length + (code.match(/\bfgets\s*\(/g) || []).length,
    cpp: (code.match(/\bcin\s*>>/g) || []).length + (code.match(/\bgetline\s*\(/g) || []).length,
    java: (code.match(/\b(nextLine|nextInt|nextDouble|next)\s*\(/g) || []).length,
    go: (code.match(/\bScan(ln|f)?\s*\(/g) || []).length + (code.match(/\bReadString\s*\(/g) || []).length,
    rust: (code.match(/\bread_line\s*\(/g) || []).length,
    ruby: (code.match(/\bgets\b/g) || []).length,
    php: (code.match(/\bfgets\s*\(\s*STDIN/g) || []).length,
  };
  return counts[language] || 0;
}

const LANG_EXAMPLES = {
  python: 'e.g. Alice\\n25',
  javascript: 'e.g. Alice',
  c: 'e.g. 42',
  cpp: 'e.g. Alice',
  java: 'e.g. Alice',
  go: 'e.g. Alice',
  rust: 'e.g. Alice',
  ruby: 'e.g. Alice',
  php: 'e.g. Alice',
};

const LANG_FUNC = {
  python: 'input()',
  javascript: 'readline',
  typescript: 'readline',
  c: 'scanf()',
  cpp: 'cin >>',
  java: 'Scanner',
  go: 'Scan()',
  rust: 'read_line()',
  ruby: 'gets',
  php: 'fgets(STDIN)',
};

// ─── OutputConsole Component (with forwardRef for external stdin access) ──
const OutputConsole = memo(forwardRef(function OutputConsole(
  { output, onClear, isRunning, onRunWithStdin, language, code },
  ref
) {
  const scrollRef = useRef(null);
  const stdinRef = useRef(null);
  const [stdinValue, setStdinValue] = useState('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [stdinCollapsed, setStdinCollapsed] = useState(false);

  const needsInput = detectNeedsInput(code, language);
  const inputCount = countInputCalls(code, language);

  // Expose stdin value and needsInput to parent (Room page)
  useImperativeHandle(ref, () => ({
    getStdin: () => stdinValue,
    needsInput: () => needsInput,
    focusStdin: () => {
      setStdinCollapsed(false);
      setTimeout(() => stdinRef.current?.focus(), 50);
    },
  }));

  // Auto-expand stdin when code changes to need input
  useEffect(() => {
    if (needsInput) {
      setStdinCollapsed(false);
    }
  }, [needsInput]);

  // Add to history when output arrives
  useEffect(() => {
    if (output && (output.content || output.error) && output.type !== 'info') {
      setHistory(prev => [...prev.slice(-9), { ...output, timestamp: new Date(), language }]);
    }
  }, [output]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [output]);

  const handleCopy = useCallback(async () => {
    const text = output?.content || output?.error || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {}
  }, [output]);

  const handleRun = useCallback(() => {
    if (onRunWithStdin) {
      onRunWithStdin(stdinValue);
    }
  }, [stdinValue, onRunWithStdin]);

  const handleStdinKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRun();
    }
  }, [handleRun]);

  return (
    <div className="h-full flex flex-col bg-[#1a1b26] overflow-hidden">
      {/* ═══ HEADER BAR ═══ */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#252526] border-b border-editor-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-medium text-gray-300">Terminal</span>
          </div>

          {isRunning && (
            <div className="flex items-center gap-1.5 ml-1">
              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-[10px] text-yellow-400 font-medium">Running...</span>
            </div>
          )}

          {output?.engine && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2a2d2e] text-gray-500 font-mono">{output.engine}</span>
          )}
          {output?.executionTime && (
            <span className="text-[10px] text-gray-500 font-mono">{output.executionTime}</span>
          )}
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

          <button onClick={() => setShowHistory(!showHistory)}
            className={`p-1 rounded transition ${showHistory ? 'bg-purple-600/20 text-purple-400' : 'text-gray-500 hover:text-gray-300 hover:bg-[#2a2d2e]'}`}
            title={`History (${history.length} runs)`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
          <button onClick={handleCopy} disabled={!output?.content && !output?.error}
            className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-[#2a2d2e] transition disabled:opacity-30" title="Copy output">
            {copied
              ? <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            }
          </button>
          <button onClick={() => { onClear(); setHistory([]); }}
            className="p-1 rounded hover:bg-[#2a2d2e] text-gray-500 hover:text-gray-300 transition" title="Clear">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>

      {/* ═══ HISTORY PANEL ═══ */}
      {showHistory && history.length > 0 && (
        <div className="px-3 py-2 bg-[#1e1f2e] border-b border-editor-border flex-shrink-0 max-h-28 overflow-y-auto">
          <div className="space-y-1">
            {history.slice().reverse().map((h, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                <span className={h.type === 'success' ? 'text-green-400' : 'text-red-400'}>{h.type === 'success' ? '\u2713' : '\u2717'}</span>
                <span className="text-gray-500">{h.language}</span>
                <span className="text-gray-600">{h.executionTime}</span>
                <span className="text-gray-700">{h.timestamp?.toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ STDIN AREA (inline, always visible when code needs input) ═══ */}
      {needsInput && (
        <div className={`flex-shrink-0 border-b border-editor-border ${stdinCollapsed ? '' : 'bg-[#12131e]'}`}>
          {/* Stdin Header — always visible, clickable to collapse/expand */}
          <button
            onClick={() => setStdinCollapsed(!stdinCollapsed)}
            className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#1e1f2e] transition"
          >
            <div className="flex items-center gap-2">
              <svg className={`w-3 h-3 text-gray-500 transition-transform ${stdinCollapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-yellow-400">
                stdin required
              </span>
              <span className="text-[10px] text-gray-500">
                {LANG_FUNC[language] || 'input'} detected
                {inputCount > 0 && ` (${inputCount} call${inputCount > 1 ? 's' : ''})`}
              </span>
              {stdinValue && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-600/20 text-blue-400">
                  {stdinValue.split('\n').filter(Boolean).length} line{stdinValue.split('\n').filter(Boolean).length !== 1 ? 's' : ''}
                </span>
              )}
              {!stdinValue && !stdinCollapsed && (
                <span className="text-[10px] text-yellow-500 animate-pulse">type input below</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {stdinValue && (
                <button
                  onClick={(e) => { e.stopPropagation(); setStdinValue(''); }}
                  className="text-[10px] px-1.5 py-0.5 text-gray-500 hover:text-gray-300 rounded hover:bg-[#2a2d2e] transition"
                >
                  Clear
                </button>
              )}
            </div>
          </button>

          {/* Stdin Input Area (collapsible) */}
          {!stdinCollapsed && (
            <div className="px-3 pb-2">
              <div className="flex gap-2 items-stretch">
                <div className="flex-1 relative">
                  <textarea
                    ref={stdinRef}
                    value={stdinValue}
                    onChange={(e) => setStdinValue(e.target.value)}
                    onKeyDown={handleStdinKeyDown}
                    placeholder={`Type input here, one value per line... ${LANG_EXAMPLES[language] || ''}`}
                    rows={Math.min(Math.max(inputCount || 1, stdinValue.split('\n').length), 4)}
                    className="w-full bg-[#0d0e17] border border-yellow-500/30 rounded-md px-3 py-1.5 text-sm text-gray-200 font-mono
                      placeholder-gray-600 resize-none focus:outline-none focus:ring-2 focus:ring-yellow-500/40 focus:border-yellow-500/40
                      leading-relaxed"
                    autoFocus
                  />
                  <div className="absolute bottom-1.5 right-2 text-[9px] text-gray-600 pointer-events-none">
                    {stdinValue.split('\n').filter(Boolean).length} line(s)
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRun(); }}
                  disabled={isRunning}
                  className="flex flex-col items-center justify-center gap-1 px-3 bg-green-600 hover:bg-green-500 text-white rounded-md
                    font-medium transition-all disabled:opacity-50 active:scale-95 shadow-lg shadow-green-600/20 flex-shrink-0"
                  title="Run with this input (Ctrl+Enter)"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  <span className="text-[9px] leading-none">Run</span>
                </button>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] text-gray-600">
                  <kbd className="px-1 py-0.5 bg-[#252526] rounded text-[8px] border border-editor-border/50">Ctrl</kbd>+<kbd className="px-1 py-0.5 bg-[#252526] rounded text-[8px] border border-editor-border/50">Enter</kbd> to run
                </span>
                <span className="text-[9px] text-gray-700">|</span>
                <span className="text-[9px] text-gray-600">One value per line for multiple {LANG_FUNC[language] || 'input'} calls</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ OUTPUT AREA ═══ */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-3 font-mono text-sm min-h-0">
        {/* Empty state */}
        {!output && !isRunning && (
          <div className="h-full flex items-center justify-center text-gray-600 text-xs">
            <div className="text-center space-y-3">
              <div className="text-3xl opacity-15 font-mono">$_</div>
              <div className="space-y-1">
                <p>
                  Press <kbd className="px-1.5 py-0.5 bg-[#252526] rounded text-[10px] mx-0.5 border border-editor-border/50">Ctrl</kbd>+<kbd className="px-1.5 py-0.5 bg-[#252526] rounded text-[10px] mx-0.5 border border-editor-border/50">Enter</kbd> to run code
                </p>
                {needsInput && (
                  <p className="text-yellow-500 font-medium mt-2">
                    Your code uses {LANG_FUNC[language] || 'input'} — type your input above, then run!
                  </p>
                )}
              </div>
              <p className="text-gray-700 text-[10px]">All 10 languages with stdin support</p>
            </div>
          </div>
        )}

        {/* Running spinner */}
        {isRunning && (!output || output.type === 'info') && (
          <div className="flex items-center gap-3 text-yellow-400 py-2">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <div>
              <span className="text-sm">Executing code...</span>
              <span className="text-xs text-yellow-600 block">Compiling & running in isolated sandbox</span>
            </div>
          </div>
        )}

        {/* Actual output */}
        {output && output.type !== 'info' && (
          <div className="space-y-2">
            {/* Show stdin that was used */}
            {output.stdinUsed && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">stdin</span>
                  <div className="flex-1 h-px bg-blue-500/10" />
                </div>
                <pre className="whitespace-pre-wrap break-words text-blue-300/60 bg-blue-950/20 rounded-md px-3 py-1.5 border border-blue-500/10 text-xs italic">{output.stdinUsed}</pre>
              </div>
            )}

            {/* stdout */}
            {output.content && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] text-green-500 font-semibold uppercase tracking-wider">stdout</span>
                  <div className="flex-1 h-px bg-green-500/10" />
                </div>
                <pre className="whitespace-pre-wrap break-words text-gray-200 bg-[#12131e] rounded-md px-3 py-2 border border-green-500/10 leading-relaxed">{output.content}</pre>
              </div>
            )}

            {/* stderr */}
            {output.error && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">
                    {output.phase === 'compile' ? 'Compiler Error' : 'stderr'}
                  </span>
                  <div className="flex-1 h-px bg-red-500/10" />
                </div>
                <pre className="whitespace-pre-wrap break-words text-red-300 bg-red-950/30 rounded-md px-3 py-2 border border-red-500/15 leading-relaxed">{output.error}</pre>
              </div>
            )}

            {/* No output */}
            {!output.content && !output.error && output.type === 'success' && (
              <div className="text-gray-500 text-xs italic py-2">Program executed successfully with no output.</div>
            )}

            {/* Hint: code needed input but none was provided */}
            {output.type === 'error' && needsInput && !output.stdinUsed && (
              <div className="flex items-start gap-2 p-2.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mt-2">
                <svg className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div>
                  <p className="text-xs text-yellow-300 font-medium">This program needs input to run!</p>
                  <p className="text-[10px] text-yellow-500 mt-0.5">
                    Type your input values in the stdin area above (one per line), then click the green Run button or press Ctrl+Enter.
                  </p>
                </div>
              </div>
            )}

            {/* Timeout hint — suggest maybe stdin was expected */}
            {output.status === 'Time Limit Exceeded' && !output.stdinUsed && needsInput && (
              <div className="flex items-start gap-2 p-2.5 bg-orange-500/10 border border-orange-500/20 rounded-lg mt-2">
                <svg className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-xs text-orange-300 font-medium">Timeout: your code was waiting for input!</p>
                  <p className="text-[10px] text-orange-500 mt-0.5">
                    Type your input values in the stdin area above before running. The program timed out because it was waiting for {LANG_FUNC[language] || 'input'}.
                  </p>
                </div>
              </div>
            )}

            {/* Metadata footer */}
            <div className="flex items-center gap-3 pt-1 text-[10px] text-gray-600 border-t border-gray-800 mt-2">
              {output.engine && <span><span className="text-gray-500">Engine:</span> <span className="text-gray-400">{output.engine}</span></span>}
              {output.language && <span><span className="text-gray-500">Lang:</span> <span className="text-gray-400">{output.language}</span></span>}
              {output.executionTime && <span><span className="text-gray-500">Time:</span> <span className="text-gray-400">{output.executionTime}</span></span>}
              {output.version && <span className="hidden sm:inline"><span className="text-gray-500">Ver:</span> <span className="text-gray-400">{output.version}</span></span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}));

OutputConsole.displayName = 'OutputConsole';
export default OutputConsole;
