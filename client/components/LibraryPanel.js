/**
 * LibraryPanel v1.0 — Language Library Browser
 * 
 * Features:
 *  - Browse available libraries for the current language
 *  - Search/filter libraries by name, description, or category
 *  - Category-based grouping with collapsible sections
 *  - One-click "Insert Import" adds the import statement to the editor
 *  - Shows version info for installed packages (Python)
 *  - Distinguishes builtin vs installed vs unavailable
 *  - Responsive dark-theme UI matching CollabCode design
 * 
 * made with <3 by Namish
 */

import { useState, useEffect, useRef, useCallback, memo } from 'react';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

// Category icons mapping
const CATEGORY_ICONS = {
  'Data Science':     '📊',
  'Machine Learning': '🤖',
  'Visualization':    '📈',
  'Image Processing': '🖼️',
  'Web & HTTP':       '🌐',
  'NLP':              '💬',
  'Graphs':           '🔗',
  'Utilities':        '🔧',
  'Security':         '🔒',
  'Testing':          '🧪',
  'Std Library':      '📦',
  'Global API':       '🌍',
  'I/O':              '📁',
  'Containers':       '🗃️',
  'Algorithms':       '⚡',
  'Math':             '🔢',
  'Strings':          '📝',
  'Characters':       '🔤',
  'Types':            '🏷️',
  'Debug':            '🐛',
  'Error':            '⚠️',
  'Time':             '⏰',
  'Date/Time':        '📅',
  'Concurrency':      '🔀',
  'Memory':           '💾',
  'Functional':       'λ',
  'Networking':       '🌐',
  'Encoding':         '🔄',
  'System':           '💻',
  'Runtime':          '⚙️',
  'Formatting':       '✏️',
  'Iterators':        '🔁',
  'Collections':      '📋',
  'Streams':          '🌊',
  'Text':             '📝',
  'Data':             '📊',
  'Templates':        '📄',
  'CLI':              '💻',
  'Database':         '🗄️',
};

const LibraryPanel = memo(function LibraryPanel({ language, onInsertImport }) {
  const [libraries, setLibraries] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [collapsedCats, setCollapsedCats] = useState(new Set());
  const [copied, setCopied] = useState(null);
  const [totalLibs, setTotalLibs] = useState(0);
  const [note, setNote] = useState('');
  const searchRef = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Fetch libraries when language changes
  useEffect(() => {
    if (!language) return;
    setLoading(true);
    setError('');
    setSearch('');

    const controller = new AbortController();
    fetch(`${SERVER_URL}/api/libraries/${encodeURIComponent(language)}`, { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`No libraries found for ${language}`);
        return r.json();
      })
      .then(data => {
        if (!mounted.current) return;
        setLibraries(data.libraries || []);
        setCategories(data.categories || []);
        setTotalLibs(data.totalLibraries || 0);
        setNote(data.note || '');
        setCollapsedCats(new Set());
        setLoading(false);
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        if (!mounted.current) return;
        setLibraries([]);
        setCategories([]);
        setTotalLibs(0);
        setNote('');
        setLoading(false);
        if (err.message.includes('No libraries found')) {
          setNote('Built-in standard library available. Use language-native import syntax.');
        } else {
          setError('Failed to load libraries');
        }
      });

    return () => controller.abort();
  }, [language]);

  const toggleCategory = useCallback((cat) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const handleInsert = useCallback((lib) => {
    if (onInsertImport && lib.importStatement) {
      onInsertImport(lib.importStatement);
      setCopied(lib.name);
      setTimeout(() => { if (mounted.current) setCopied(null); }, 2000);
    }
  }, [onInsertImport]);

  const handleCopy = useCallback((text, name) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(name);
      setTimeout(() => { if (mounted.current) setCopied(null); }, 2000);
    });
  }, []);

  // Filter libraries by search
  const q = search.toLowerCase().trim();
  const filtered = q
    ? libraries.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q)
      )
    : libraries;

  // Group by category
  const grouped = {};
  for (const lib of filtered) {
    if (!grouped[lib.category]) grouped[lib.category] = [];
    grouped[lib.category].push(lib);
  }
  const orderedCategories = Object.keys(grouped);

  // Loading state
  if (loading) {
    return (
      <div className="p-3 animate-pulse">
        <div className="h-4 bg-[#222] rounded w-3/4 mb-3" />
        <div className="h-8 bg-[#222] rounded mb-3" />
        {[1,2,3,4,5].map(i => (
          <div key={i} className="h-14 bg-[#1a1a1d] rounded mb-2" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-[#ccc] text-xs select-none overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#222] flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">📚</span>
          <span className="font-semibold text-[11px] uppercase tracking-wider text-[#888]">Libraries</span>
        </div>
        <span className="text-[10px] text-[#555] font-mono px-1.5 py-0.5 bg-[#1a1a1d] rounded">
          {totalLibs > 0 ? `${filtered.length}/${totalLibs}` : language}
        </span>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-[#222] flex-shrink-0">
        <div className="relative">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${language} libraries...`}
            className="w-full bg-[#1a1a1d] border border-[#333] rounded-md py-1.5 pl-7 pr-7 text-[11px] text-[#ccc] placeholder-[#555] focus:border-[#5e9eff]/50 focus:outline-none transition"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); searchRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#aaa] transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Note for unsupported languages */}
      {note && libraries.length === 0 && (
        <div className="px-3 py-4 text-center">
          <div className="text-2xl mb-2">📦</div>
          <p className="text-[11px] text-[#777] leading-relaxed">{note}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-3 py-3 text-center">
          <p className="text-[11px] text-red-400">{error}</p>
        </div>
      )}

      {/* Library list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#333] scrollbar-track-transparent">
        {orderedCategories.map(cat => {
          const isCollapsed = collapsedCats.has(cat);
          const libs = grouped[cat];
          const icon = CATEGORY_ICONS[cat] || '📁';

          return (
            <div key={cat} className="border-b border-[#1a1a1d]">
              {/* Category header */}
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 bg-[#19191c] hover:bg-[#1e1e22] transition text-left"
              >
                <svg
                  className={`w-3 h-3 text-[#555] flex-shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-xs flex-shrink-0">{icon}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#777] flex-1">{cat}</span>
                <span className="text-[9px] text-[#444] font-mono">{libs.length}</span>
              </button>

              {/* Library items */}
              {!isCollapsed && (
                <div>
                  {libs.map(lib => (
                    <div
                      key={lib.name}
                      className="group flex items-start gap-2 px-3 py-1.5 hover:bg-[#1e1e22] transition cursor-default border-l-2 border-transparent hover:border-[#5e9eff]/30"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-[#e0e0e0] truncate">{lib.displayName || lib.name}</span>
                          {lib.version && (
                            <span className="text-[9px] text-[#555] font-mono bg-[#1a1a1d] px-1 rounded flex-shrink-0">v{lib.version}</span>
                          )}
                          {lib.builtin && (
                            <span className="text-[9px] text-[#4e8] bg-[#4e8]/10 px-1 rounded flex-shrink-0">builtin</span>
                          )}
                        </div>
                        <p className="text-[10px] text-[#666] leading-snug mt-0.5 truncate">{lib.description}</p>
                        {/* Import statement preview */}
                        <code className="text-[9px] text-[#5e9eff]/60 font-mono block mt-0.5 truncate">{lib.importStatement}</code>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0 pt-0.5">
                        {/* Insert import into editor */}
                        <button
                          onClick={() => handleInsert(lib)}
                          className={`p-1 rounded transition ${copied === lib.name ? 'bg-green-500/20 text-green-400' : 'bg-[#5e9eff]/10 text-[#5e9eff] hover:bg-[#5e9eff]/20'}`}
                          title={copied === lib.name ? 'Inserted!' : 'Insert import into editor'}
                        >
                          {copied === lib.name ? (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0-16l-4 4m4-4l4 4" />
                            </svg>
                          )}
                        </button>
                        {/* Copy import to clipboard */}
                        <button
                          onClick={() => handleCopy(lib.importStatement, lib.name + '-copy')}
                          className={`p-1 rounded transition ${copied === lib.name + '-copy' ? 'bg-green-500/20 text-green-400' : 'text-[#555] hover:text-[#aaa] hover:bg-[#222]'}`}
                          title={copied === lib.name + '-copy' ? 'Copied!' : 'Copy import'}
                        >
                          {copied === lib.name + '-copy' ? (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Empty state */}
        {filtered.length === 0 && libraries.length > 0 && (
          <div className="px-3 py-8 text-center">
            <div className="text-2xl mb-2">🔍</div>
            <p className="text-[11px] text-[#555]">No libraries matching &quot;{search}&quot;</p>
            <button onClick={() => setSearch('')} className="text-[10px] text-[#5e9eff] hover:underline mt-1">
              Clear search
            </button>
          </div>
        )}
      </div>

      {/* Footer with keyboard hint */}
      <div className="px-3 py-1.5 border-t border-[#222] flex-shrink-0 text-[9px] text-[#444] flex items-center justify-between">
        <span>↑ Insert import • 📋 Copy to clipboard</span>
        <span className="font-mono">{language}</span>
      </div>
    </div>
  );
});

export default LibraryPanel;
