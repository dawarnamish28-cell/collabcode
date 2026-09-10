import { useState, useEffect, useMemo } from 'react';

const REGEX_PRESETS = [
  { name: 'Email', pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', flags: 'g' },
  { name: 'URL', pattern: 'https?:\\/\\/[\\w\\-\\.]+(?::\\d+)?(?:\\/[\\w\\/\\-\\._~:?#\\[\\]@!\\$&\'\\(\\)\\*\\+,;=]*)?', flags: 'g' },
  { name: 'Hex Color', pattern: '#(?:[0-9a-fA-F]{3}){1,2}\\b', flags: 'g' },
  { name: 'IPv4', pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b', flags: 'g' },
  { name: 'Phone (Intl)', pattern: '\\+?[0-9]{1,4}?[-.\\s]?\\(?[0-9]{1,3}?\\)?[-.\\s]?[0-9]{1,4}[-.\\s]?[0-9]{1,9}', flags: 'g' },
];

export default function DevToolsModal({
  isOpen,
  onClose,
  roomId = '',
  onInsertToEditor,
}) {
  const [activeTab, setActiveTab] = useState('regex'); // 'regex' | 'scratchpad'

  // Regex State
  const [regexPattern, setRegexPattern] = useState('([a-zA-Z]+)://([^/\\s]+)');
  const [regexFlags, setRegexFlags] = useState({ g: true, i: true, m: false, s: false });
  const [testText, setTestText] = useState('Visit https://collabcodeio.xyz or http://localhost:3000 to start pair programming!');

  // Scratchpad State
  const scratchKey = `collabcode:scratch:${roomId || 'default'}`;
  const [scratchText, setScratchText] = useState('');
  const [toast, setToast] = useState('');

  // Load scratchpad from storage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(scratchKey);
      if (saved) setScratchText(saved);
    } catch {}
  }, [scratchKey]);

  const handleScratchChange = (val) => {
    setScratchText(val);
    try {
      localStorage.setItem(scratchKey, val);
    } catch {}
  };

  const handleCopyScratch = () => {
    navigator.clipboard.writeText(scratchText).then(() => {
      setToast('Copied to clipboard');
      setTimeout(() => setToast(''), 2000);
    });
  };

  const handleInsertScratch = () => {
    if (onInsertToEditor && scratchText) {
      onInsertToEditor('\n' + scratchText + '\n');
      setToast('Inserted into editor');
      setTimeout(() => setToast(''), 2000);
    }
  };

  // Compile regex & matches
  const { matches, error } = useMemo(() => {
    if (!regexPattern) return { matches: [], error: null };
    try {
      const flagStr = Object.entries(regexFlags)
        .filter(([, val]) => val)
        .map(([k]) => k)
        .join('');
      const re = new RegExp(regexPattern, flagStr);
      const results = [];
      let m;

      if (flagStr.includes('g')) {
        let loopLimit = 0;
        while ((m = re.exec(testText)) !== null && loopLimit < 500) {
          loopLimit++;
          results.push({
            match: m[0],
            index: m.index,
            groups: m.slice(1),
          });
          if (m.index === re.lastIndex) re.lastIndex++;
        }
      } else {
        m = re.exec(testText);
        if (m) {
          results.push({
            match: m[0],
            index: m.index,
            groups: m.slice(1),
          });
        }
      }
      return { matches: results, error: null };
    } catch (err) {
      return { matches: [], error: err.message };
    }
  }, [regexPattern, regexFlags, testText]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6" onClick={onClose}>
      <div className="bg-[#141518] border border-[#2c2d33] rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#222] bg-[#18191c]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#c4b5fd]/10 border border-[#c4b5fd]/30 flex items-center justify-center text-[#c4b5fd]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white font-mono">Dev Sandbox Tools</h3>
              <p className="text-[11px] text-[#666] font-mono">Regex playground & persistent scratchpad</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-[#101114] p-0.5 rounded-lg border border-[#2a2b30]">
              <button
                onClick={() => setActiveTab('regex')}
                className={`px-3 py-1 text-xs font-mono rounded-md transition ${activeTab === 'regex' ? 'bg-[#222] text-white font-medium' : 'text-[#777] hover:text-[#bbb]'}`}
              >
                Regex Tester
              </button>
              <button
                onClick={() => setActiveTab('scratchpad')}
                className={`px-3 py-1 text-xs font-mono rounded-md transition ${activeTab === 'scratchpad' ? 'bg-[#222] text-white font-medium' : 'text-[#777] hover:text-[#bbb]'}`}
              >
                Scratchpad
              </button>
            </div>

            <button onClick={onClose} className="p-1.5 text-[#666] hover:text-white rounded-lg hover:bg-[#222] transition ml-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tab 1: Regex Tester */}
        {activeTab === 'regex' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-4 space-y-3 font-mono text-xs">
            {/* Pattern row */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-[#888]">
                <span>Regular Expression:</span>
                <div className="flex items-center gap-2">
                  <span className="text-[#666]">Presets:</span>
                  {REGEX_PRESETS.map(p => (
                    <button
                      key={p.name}
                      onClick={() => { setRegexPattern(p.pattern); setRegexFlags({ g: true, i: true, m: false, s: false }); }}
                      className="px-1.5 py-0.5 rounded bg-[#202126] hover:bg-[#2a2c33] border border-[#303138] text-[#aaa] hover:text-white text-[10px] transition"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center bg-[#101114] border border-[#2e3038] rounded-xl px-3 py-2 text-sm focus-within:border-[#c4b5fd]">
                  <span className="text-[#666] mr-1">/</span>
                  <input
                    type="text"
                    value={regexPattern}
                    onChange={e => setRegexPattern(e.target.value)}
                    placeholder="e.g. ([a-z]+)@([a-z]+)"
                    className="flex-1 bg-transparent text-[#e6edf3] font-mono focus:outline-none"
                  />
                  <span className="text-[#666] ml-1">/</span>
                </div>

                {/* Flag checkboxes */}
                <div className="flex items-center gap-1.5 bg-[#191a1e] border border-[#2e3038] rounded-xl p-1.5 px-2">
                  {['g', 'i', 'm', 's'].map(flag => (
                    <button
                      key={flag}
                      onClick={() => setRegexFlags(f => ({ ...f, [flag]: !f[flag] }))}
                      className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs transition ${
                        regexFlags[flag] ? 'bg-[#c4b5fd]/20 text-[#c4b5fd] border border-[#c4b5fd]/40' : 'text-[#666] hover:text-[#999]'
                      }`}
                      title={`Flag ${flag}`}
                    >
                      {flag}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-[11px] text-[#ff6b6b] mt-1">{error}</p>}
            </div>

            {/* Test String */}
            <div className="flex-1 flex flex-col min-h-0 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-[#888]">
                <span>Test String:</span>
                <span className="text-[#5bd882] font-semibold">{matches.length} matches found</span>
              </div>
              <textarea
                value={testText}
                onChange={e => setTestText(e.target.value)}
                placeholder="Insert test text here..."
                className="flex-1 bg-[#101114] border border-[#282a30] rounded-xl p-3 text-[#ccc] font-mono text-xs focus:outline-none focus:border-[#5e9eff] resize-none"
              />
            </div>

            {/* Matches table */}
            <div className="h-36 overflow-y-auto bg-[#101114] border border-[#282a30] rounded-xl p-2.5">
              <span className="text-[10px] text-[#666] uppercase tracking-wider font-semibold">Match Breakdown</span>
              {matches.length === 0 ? (
                <p className="text-[#555] text-[11px] mt-2 italic">No matches in test string</p>
              ) : (
                <div className="space-y-1.5 mt-1.5">
                  {matches.map((m, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-1.5 bg-[#17181c] rounded-lg border border-[#222]">
                      <span className="px-1.5 py-0.5 rounded bg-[#5bd882]/10 text-[#5bd882] text-[10px] font-bold">
                        #{idx + 1}
                      </span>
                      <span className="text-white font-mono font-medium">{m.match}</span>
                      <span className="text-[#666] text-[10px]">at index {m.index}</span>
                      {m.groups.length > 0 && (
                        <div className="flex items-center gap-1 ml-auto">
                          {m.groups.map((g, gi) => (
                            <span key={gi} className="px-1.5 py-0.5 rounded bg-[#5e9eff]/10 text-[#5e9eff] text-[10px]">
                              ${gi + 1}: {g}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Scratchpad */}
        {activeTab === 'scratchpad' && (
          <div className="flex-1 flex flex-col min-h-0 p-4 font-mono text-xs space-y-3">
            <div className="flex items-center justify-between text-[11px] text-[#888]">
              <span>Room Scratchpad (Auto-saved locally)</span>
              <div className="flex items-center gap-3">
                <span>{scratchText.length} chars</span>
                <span>&bull;</span>
                <span>{scratchText.split(/\s+/).filter(Boolean).length} words</span>
                <span>&bull;</span>
                <span>{scratchText.split('\n').length} lines</span>
              </div>
            </div>

            <textarea
              value={scratchText}
              onChange={e => handleScratchChange(e.target.value)}
              placeholder="Jot down algorithmic notes, curl commands, JSON payloads, or meeting points..."
              className="flex-1 bg-[#101114] border border-[#282a30] rounded-xl p-3.5 text-[#ddd] font-mono text-xs leading-5 focus:outline-none focus:border-[#c4b5fd] resize-none"
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-[#5bd882] font-mono">{toast}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleScratchChange('')}
                  className="px-3 py-1.5 rounded-lg border border-[#333] bg-[#1a1b20] text-[#777] hover:text-[#ff6b6b] text-xs font-mono transition"
                >
                  Clear
                </button>
                <button
                  onClick={handleCopyScratch}
                  className="px-3 py-1.5 rounded-lg border border-[#333] bg-[#222] text-[#ccc] hover:text-white text-xs font-mono transition flex items-center gap-1.5 active:scale-95"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>Copy</span>
                </button>
                {onInsertToEditor && (
                  <button
                    onClick={handleInsertScratch}
                    className="px-3.5 py-1.5 rounded-lg bg-[#c4b5fd] hover:bg-[#b8a6fb] text-[#1c1335] text-xs font-mono font-bold transition flex items-center gap-1.5 active:scale-95"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Insert into Code</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
