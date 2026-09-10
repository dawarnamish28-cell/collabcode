/**
 * SettingsModal v15.0 — Full-featured settings UI
 *
 * A centralized settings modal accessible via Ctrl+, or navbar gear icon.
 * Replaces the side-panel as the primary settings interface while keeping
 * the sidebar Extensions panel for quick access.
 *
 * Features:
 *  - Tabbed layout: Editor, Terminal, Keybindings, About
 *  - Live preview of theme changes
 *  - Search/filter settings
 *  - Import/export settings as JSON
 *  - Reset individual sections or all settings
 *
 * made with <3 by Namish
 */

import { memo, useState, useCallback, useEffect, useRef } from 'react';

const EDITOR_THEMES = [
  { id: 'vs-dark', name: 'Dark+', desc: 'VS Code default dark', preview: '#1e1e1e' },
  { id: 'vs', name: 'Light+', desc: 'Clean light theme', preview: '#ffffff' },
  { id: 'hc-black', name: 'High Contrast', desc: 'Accessibility optimized', preview: '#000000' },
];

const TERMINAL_THEMES = [
  { id: 'vs-dark', name: 'Default Dark', color: '#1a1b1e' },
  { id: 'monokai', name: 'Monokai', color: '#272822' },
  { id: 'github-dark', name: 'GitHub Dark', color: '#0d1117' },
  { id: 'dracula', name: 'Dracula', color: '#282a36' },
  { id: 'one-dark', name: 'One Dark', color: '#282c34' },
  { id: 'solarized-dark', name: 'Solarized', color: '#002b36' },
];

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20];
const TAB_SIZES = [2, 4, 8];
const CURSOR_STYLES = [
  { id: 'line', name: 'Line', icon: '|' },
  { id: 'block', name: 'Block', icon: '█' },
  { id: 'underline', name: 'Underline', icon: '_' },
];

const TABS = [
  { id: 'editor', label: 'Editor', icon: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7' },
  { id: 'terminal', label: 'Terminal', icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { id: 'keybindings', label: 'Keys', icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' },
  { id: 'about', label: 'About', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
];

const SHORTCUTS = [
  { keys: ['Ctrl', 'Enter'], desc: 'Run code', category: 'execution' },
  { keys: ['Ctrl', 'K'], desc: 'Command palette', category: 'navigation' },
  { keys: ['Ctrl', 'B'], desc: 'Toggle chat', category: 'panels' },
  { keys: ['Ctrl', '`'], desc: 'Toggle terminal', category: 'panels' },
  { keys: ['Ctrl', 'S'], desc: 'Save file', category: 'files' },
  { keys: ['Ctrl', 'O'], desc: 'Open file', category: 'files' },
  { keys: ['Ctrl', 'L'], desc: 'Clear terminal', category: 'terminal' },
  { keys: ['Ctrl', ','], desc: 'Open settings', category: 'navigation' },
  { keys: ['Ctrl', 'F'], desc: 'Search in output', category: 'terminal' },
  { keys: ['?'], desc: 'Shortcuts overlay', category: 'navigation' },
  { keys: ['Esc'], desc: 'Close modals', category: 'navigation' },
];

const ToggleSwitch = ({ enabled, onToggle, color = '#5e9eff' }) => (
  <button onClick={onToggle}
    className="w-8 h-[17px] rounded-full transition-all relative flex-shrink-0"
    style={{ background: enabled ? color : '#444' }}>
    <div className="w-[13px] h-[13px] rounded-full bg-white absolute top-[2px] transition-all shadow-sm"
      style={{ left: enabled ? '15px' : '2px' }} />
  </button>
);

const SettingsModal = memo(function SettingsModal({
  isOpen, onClose,
  // Editor settings
  editorTheme, onEditorThemeChange,
  terminalTheme, onTerminalThemeChange,
  fontSize, onFontSizeChange,
  tabSize, onTabSizeChange,
  minimap, onMinimapToggle,
  wordWrap, onWordWrapToggle,
  cursorStyle, onCursorStyleChange,
  bracketColors, onBracketColorsToggle,
  lineNumbers, onLineNumbersToggle,
  autoIndent, onAutoIndentToggle,
  // Notification settings
  notifSoundEnabled, onToggleNotifSound,
}) {
  const [activeTab, setActiveTab] = useState('editor');
  const [searchQuery, setSearchQuery] = useState('');
  const [exportCopied, setExportCopied] = useState(false);
  const modalRef = useRef(null);
  const searchRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [isOpen, onClose]);

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 100);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const handleResetAll = useCallback(() => {
    onEditorThemeChange?.('vs-dark');
    onTerminalThemeChange?.('vs-dark');
    onFontSizeChange?.(14);
    onTabSizeChange?.(2);
    onCursorStyleChange?.('line');
    if (!minimap) onMinimapToggle?.();
    if (!wordWrap) onWordWrapToggle?.();
    if (!bracketColors) onBracketColorsToggle?.();
    if (!lineNumbers) onLineNumbersToggle?.();
    if (!autoIndent) onAutoIndentToggle?.();
  }, [onEditorThemeChange, onTerminalThemeChange, onFontSizeChange, onTabSizeChange, onCursorStyleChange, minimap, onMinimapToggle, wordWrap, onWordWrapToggle, bracketColors, onBracketColorsToggle, lineNumbers, onLineNumbersToggle, autoIndent, onAutoIndentToggle]);

  const handleExportSettings = useCallback(() => {
    const settings = {
      editorTheme, terminalTheme, fontSize, tabSize,
      minimap, wordWrap, cursorStyle, bracketColors, lineNumbers, autoIndent,
      notifSoundEnabled,
    };
    navigator.clipboard.writeText(JSON.stringify(settings, null, 2)).then(() => {
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2000);
    }).catch(() => {});
  }, [editorTheme, terminalTheme, fontSize, tabSize, minimap, wordWrap, cursorStyle, bracketColors, lineNumbers, autoIndent, notifSoundEnabled]);

  const handleImportSettings = useCallback(() => {
    const input = prompt('Paste settings JSON:');
    if (!input) return;
    try {
      const s = JSON.parse(input);
      if (s.editorTheme) onEditorThemeChange?.(s.editorTheme);
      if (s.terminalTheme) onTerminalThemeChange?.(s.terminalTheme);
      if (s.fontSize) onFontSizeChange?.(s.fontSize);
      if (s.tabSize) onTabSizeChange?.(s.tabSize);
      if (s.cursorStyle) onCursorStyleChange?.(s.cursorStyle);
    } catch (e) {
      alert('Invalid JSON');
    }
  }, [onEditorThemeChange, onTerminalThemeChange, onFontSizeChange, onTabSizeChange, onCursorStyleChange]);

  if (!isOpen) return null;

  const q = searchQuery.toLowerCase();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onClick={onClose}>
      <div ref={modalRef}
        className="modal-enter bg-[#1a1b1e] border border-[#333] rounded-2xl w-full max-w-2xl max-h-[80vh] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#282828] flex-shrink-0">
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-[#5e9eff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h2 className="text-[14px] font-medium text-white">Settings</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleResetAll}
              className="text-[10px] font-mono text-[#666] hover:text-[#ff6b6b] transition px-2 py-1 rounded-md hover:bg-[#ff6b6b]/5"
              title="Reset all settings to defaults">
              reset all
            </button>
            <button onClick={onClose}
              className="p-1.5 text-[#666] hover:text-white transition rounded-lg hover:bg-[#222]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-5 py-2 border-b border-[#222] flex-shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#151517] rounded-lg border border-[#282828]">
            <svg className="w-3.5 h-3.5 text-[#555] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input ref={searchRef} type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search settings..." className="flex-1 bg-transparent text-[12px] text-white placeholder-[#555] outline-none font-mono" />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-[#555] hover:text-[#aaa] transition">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar Tabs */}
          <div className="w-[120px] flex-shrink-0 border-r border-[#222] bg-[#19191c] py-2 overflow-y-auto">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] font-mono transition ${
                  activeTab === tab.id
                    ? 'text-[#5e9eff] bg-[#5e9eff]/5 border-r-2 border-r-[#5e9eff]'
                    : 'text-[#666] hover:text-[#aaa] hover:bg-[#222]'
                }`}>
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {/* Editor Tab */}
            {activeTab === 'editor' && (
              <div className="space-y-6" style={{ animation: 'fadeUp 0.2s ease' }}>
                {/* Theme */}
                {(!q || 'editor theme'.includes(q)) && (
                  <section>
                    <h3 className="text-[11px] font-mono text-[#888] uppercase tracking-wider mb-3 flex items-center gap-2">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
                      Editor Theme
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      {EDITOR_THEMES.map(theme => (
                        <button key={theme.id} onClick={() => onEditorThemeChange(theme.id)}
                          className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl transition ${
                            editorTheme === theme.id
                              ? 'bg-[#5e9eff]/8 border-2 border-[#5e9eff]/30'
                              : 'hover:bg-[#222] border-2 border-transparent hover:border-[#333]'
                          }`}>
                          <div className="w-8 h-8 rounded-lg border border-[#444]" style={{ background: theme.preview }}>
                            {editorTheme === theme.id && (
                              <div className="w-full h-full rounded-lg flex items-center justify-center">
                                <svg className="w-4 h-4 text-[#5e9eff]" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <span className={`text-[10px] font-mono ${editorTheme === theme.id ? 'text-[#5e9eff]' : 'text-[#888]'}`}>{theme.name}</span>
                          <span className="text-[8px] text-[#555]">{theme.desc}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {/* Font Size */}
                {(!q || 'font size'.includes(q)) && (
                  <section>
                    <h3 className="text-[11px] font-mono text-[#888] uppercase tracking-wider mb-3">Font Size</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {FONT_SIZES.map(size => (
                        <button key={size} onClick={() => onFontSizeChange(size)}
                          className={`w-10 h-8 rounded-lg text-[11px] font-mono transition ${
                            fontSize === size
                              ? 'bg-[#5e9eff]/10 text-[#5e9eff] border border-[#5e9eff]/20'
                              : 'bg-[#1e1f22] text-[#777] hover:text-white border border-transparent hover:border-[#333]'
                          }`}>
                          {size}
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-[#444] mt-2 font-mono">Current: {fontSize}px</p>
                  </section>
                )}

                {/* Tab Size */}
                {(!q || 'tab size indent'.includes(q)) && (
                  <section>
                    <h3 className="text-[11px] font-mono text-[#888] uppercase tracking-wider mb-3">Tab Size</h3>
                    <div className="flex gap-1.5">
                      {TAB_SIZES.map(size => (
                        <button key={size} onClick={() => onTabSizeChange(size)}
                          className={`px-4 py-1.5 rounded-lg text-[11px] font-mono transition ${
                            tabSize === size
                              ? 'bg-[#5e9eff]/10 text-[#5e9eff] border border-[#5e9eff]/20'
                              : 'bg-[#1e1f22] text-[#777] hover:text-white border border-transparent hover:border-[#333]'
                          }`}>
                          {size} spaces
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {/* Cursor Style */}
                {(!q || 'cursor style'.includes(q)) && (
                  <section>
                    <h3 className="text-[11px] font-mono text-[#888] uppercase tracking-wider mb-3">Cursor Style</h3>
                    <div className="flex gap-1.5">
                      {CURSOR_STYLES.map(style => (
                        <button key={style.id} onClick={() => onCursorStyleChange(style.id)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-mono transition ${
                            cursorStyle === style.id
                              ? 'bg-[#5e9eff]/10 text-[#5e9eff] border border-[#5e9eff]/20'
                              : 'bg-[#1e1f22] text-[#777] hover:text-white border border-transparent hover:border-[#333]'
                          }`}>
                          <span className="text-[14px]">{style.icon}</span>
                          <span>{style.name}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {/* Toggles */}
                {(!q || 'minimap word wrap bracket line numbers auto indent'.includes(q)) && (
                  <section>
                    <h3 className="text-[11px] font-mono text-[#888] uppercase tracking-wider mb-3">Editor Features</h3>
                    <div className="space-y-3 bg-[#151517] rounded-xl p-4 border border-[#222]">
                      {[
                        { label: 'Minimap', desc: 'Show code overview on the right', enabled: minimap, toggle: onMinimapToggle, color: '#5e9eff' },
                        { label: 'Word Wrap', desc: 'Wrap long lines to fit editor width', enabled: wordWrap, toggle: onWordWrapToggle, color: '#5e9eff' },
                        { label: 'Bracket Colors', desc: 'Colorize matching brackets', enabled: bracketColors, toggle: onBracketColorsToggle, color: '#ffb347' },
                        { label: 'Line Numbers', desc: 'Show line numbers in gutter', enabled: lineNumbers, toggle: onLineNumbersToggle, color: '#5bd882' },
                        { label: 'Auto Indent', desc: 'Automatically indent new lines', enabled: autoIndent, toggle: onAutoIndentToggle, color: '#c4b5fd' },
                        { label: 'Notification Sounds', desc: 'Play sound on new notifications', enabled: notifSoundEnabled, toggle: onToggleNotifSound, color: '#ffb347' },
                      ].map((item, i) => (
                        <label key={i} className="flex items-center justify-between cursor-pointer group py-1">
                          <div className="min-w-0">
                            <p className="text-[11px] text-[#bbb] group-hover:text-white transition font-mono">{item.label}</p>
                            <p className="text-[9px] text-[#555] mt-0.5">{item.desc}</p>
                          </div>
                          <ToggleSwitch enabled={item.enabled !== false} onToggle={item.toggle} color={item.color} />
                        </label>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* Terminal Tab */}
            {activeTab === 'terminal' && (
              <div className="space-y-6" style={{ animation: 'fadeUp 0.2s ease' }}>
                <section>
                  <h3 className="text-[11px] font-mono text-[#888] uppercase tracking-wider mb-3">Terminal Theme</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {TERMINAL_THEMES.map(theme => (
                      <button key={theme.id} onClick={() => onTerminalThemeChange(theme.id)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left ${
                          terminalTheme === theme.id
                            ? 'bg-[#c4b5fd]/8 border-2 border-[#c4b5fd]/25'
                            : 'hover:bg-[#222] border-2 border-transparent hover:border-[#333]'
                        }`}>
                        <div className="w-6 h-6 rounded-md border border-[#444] flex-shrink-0" style={{ background: theme.color }} />
                        <span className={`text-[11px] font-mono ${terminalTheme === theme.id ? 'text-[#c4b5fd]' : 'text-[#aaa]'}`}>{theme.name}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-[11px] font-mono text-[#888] uppercase tracking-wider mb-3">Terminal Shortcuts</h3>
                  <div className="bg-[#151517] rounded-xl p-4 border border-[#222] space-y-2">
                    {[
                      { key: 'Enter', desc: 'Send input line to program' },
                      { key: 'Ctrl+Enter', desc: 'Run code with collected stdin' },
                      { key: 'Ctrl+L', desc: 'Clear terminal output' },
                      { key: 'Ctrl+F', desc: 'Search / filter output' },
                      { key: 'Up / Down', desc: 'Navigate input history' },
                    ].map((tip, i) => (
                      <div key={i} className="flex items-center justify-between py-1">
                        <span className="text-[10px] text-[#888] font-mono">{tip.desc}</span>
                        <kbd className="text-[9px]">{tip.key}</kbd>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {/* Keybindings Tab */}
            {activeTab === 'keybindings' && (
              <div className="space-y-4" style={{ animation: 'fadeUp 0.2s ease' }}>
                <h3 className="text-[11px] font-mono text-[#888] uppercase tracking-wider mb-1">All Keyboard Shortcuts</h3>
                <div className="bg-[#151517] rounded-xl border border-[#222] overflow-hidden">
                  {SHORTCUTS.filter(s => !q || s.desc.toLowerCase().includes(q) || s.keys.join(' ').toLowerCase().includes(q)).map((shortcut, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-[#222] last:border-0 hover:bg-[#1e1f22] transition">
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-mono text-[#444] uppercase w-16">{shortcut.category}</span>
                        <span className="text-[11px] text-[#bbb]">{shortcut.desc}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, j) => (
                          <span key={j}>
                            {j > 0 && <span className="text-[#444] text-[9px] mx-0.5">+</span>}
                            <kbd className="text-[10px]">{key}</kbd>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* About Tab */}
            {activeTab === 'about' && (
              <div className="space-y-5" style={{ animation: 'fadeUp 0.2s ease' }}>
                <div className="text-center py-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#222] border border-[#333] flex items-center justify-center text-[20px] font-mono font-bold text-[#5e9eff] mx-auto mb-3">
                    {'//'}
                  </div>
                  <h3 className="text-[16px] font-semibold text-white">CollabCode</h3>
                  <p className="text-[11px] text-[#666] font-mono mt-1">v15.0 — collaborative coding platform</p>
                  <p className="text-[10px] text-[#444] font-mono mt-0.5">made with &lt;3 by Namish</p>
                </div>

                <div className="bg-[#151517] rounded-xl p-4 border border-[#222] space-y-2">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-[#666]">Languages</span>
                    <span className="text-[#aaa]">20</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-[#666]">Real-time sync</span>
                    <span className="text-[#aaa]">Yjs CRDT</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-[#666]">Communication</span>
                    <span className="text-[#aaa]">Socket.IO</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-[#666]">Editor</span>
                    <span className="text-[#aaa]">Monaco</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-[#666]">Framework</span>
                    <span className="text-[#aaa]">Next.js + Express</span>
                  </div>
                </div>

                {/* Import / Export */}
                <section>
                  <h3 className="text-[11px] font-mono text-[#888] uppercase tracking-wider mb-3">Settings Data</h3>
                  <div className="flex gap-2">
                    <button onClick={handleExportSettings}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#151517] border border-[#282828] rounded-lg text-[11px] font-mono text-[#888] hover:text-white hover:border-[#5e9eff]/30 transition">
                      {exportCopied ? (
                        <><svg className="w-3 h-3 text-[#5bd882]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>copied!</>
                      ) : (
                        <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>export</>
                      )}
                    </button>
                    <button onClick={handleImportSettings}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#151517] border border-[#282828] rounded-lg text-[11px] font-mono text-[#888] hover:text-white hover:border-[#5e9eff]/30 transition">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      import
                    </button>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t border-[#222] flex items-center justify-between flex-shrink-0">
          <span className="text-[9px] text-[#444] font-mono">Ctrl+, to open settings</span>
          <span className="text-[9px] text-[#444] font-mono">changes saved automatically</span>
        </div>
      </div>
    </div>
  );
});

export default SettingsModal;
