/**
 * Extensions v12.0 — More themes, more controls, polished
 * 
 * New in v12:
 *  - More editor themes (monokai, dracula, one-dark, solarized)
 *  - Bracket colorization toggle
 *  - Line numbers toggle
 *  - Auto-indent toggle
 *  - Cursor style selector (line, block, underline)
 *  - Smooth animations between sections
 *  - Better layout and spacing
 *  - Reset to defaults button
 * 
 * made with <3 by Namish
 */

import { memo, useState, useCallback } from 'react';

const EDITOR_THEMES = [
  { id: 'vs-dark', name: 'Dark+', desc: 'VS Code default', preview: '#1e1e1e' },
  { id: 'vs', name: 'Light+', desc: 'Light theme', preview: '#ffffff' },
  { id: 'hc-black', name: 'High Contrast', desc: 'Accessibility', preview: '#000000' },
];

const TERMINAL_THEMES = [
  { id: 'vs-dark', name: 'Default', desc: 'Dark+', color: '#1a1b1e' },
  { id: 'monokai', name: 'Monokai', desc: 'Classic warm', color: '#272822' },
  { id: 'github-dark', name: 'GitHub', desc: 'Dark dimmed', color: '#0d1117' },
  { id: 'dracula', name: 'Dracula', desc: 'Pastel goth', color: '#282a36' },
  { id: 'one-dark', name: 'One Dark', desc: 'Atom-style', color: '#282c34' },
  { id: 'solarized-dark', name: 'Solarized', desc: 'Warm dark', color: '#002b36' },
];

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20];
const TAB_SIZES = [2, 4, 8];
const CURSOR_STYLES = [
  { id: 'line', name: 'Line', icon: '|' },
  { id: 'block', name: 'Block', icon: '█' },
  { id: 'underline', name: 'Under', icon: '_' },
];

const Extensions = memo(function Extensions({
  editorTheme, onEditorThemeChange,
  terminalTheme, onTerminalThemeChange,
  fontSize, onFontSizeChange,
  tabSize, onTabSizeChange,
  minimap, onMinimapToggle,
  wordWrap, onWordWrapToggle,
  // New props (with defaults for backward compat)
  cursorStyle, onCursorStyleChange,
  bracketColors, onBracketColorsToggle,
  lineNumbers, onLineNumbersToggle,
  autoIndent, onAutoIndentToggle,
}) {
  const [section, setSection] = useState('themes');

  const handleReset = useCallback(() => {
    onEditorThemeChange?.('vs-dark');
    onTerminalThemeChange?.('vs-dark');
    onFontSizeChange?.(14);
    onTabSizeChange?.(2);
    if (minimap === false) onMinimapToggle?.();
    if (wordWrap === false) onWordWrapToggle?.();
  }, [onEditorThemeChange, onTerminalThemeChange, onFontSizeChange, onTabSizeChange, minimap, onMinimapToggle, wordWrap, onWordWrapToggle]);

  const ToggleSwitch = ({ enabled, onToggle, color = '#5e9eff' }) => (
    <button onClick={onToggle}
      className="w-7 h-[15px] rounded-full transition-all relative flex-shrink-0"
      style={{ background: enabled ? color : '#444' }}>
      <div className="w-[11px] h-[11px] rounded-full bg-white absolute top-[2px] transition-all shadow-sm"
        style={{ left: enabled ? '14px' : '2px' }} />
    </button>
  );

  return (
    <div className="h-full flex flex-col bg-[#19191c] border-r border-[#282828] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#222] flex items-center justify-between">
        <span className="text-[10px] font-mono text-[#666] uppercase tracking-wider">settings</span>
        <button onClick={handleReset}
          className="text-[9px] font-mono text-[#555] hover:text-[#aaa] transition px-1.5 py-0.5 rounded hover:bg-[#222]"
          title="Reset to defaults">
          reset
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#222]">
        {[
          { id: 'themes', label: 'themes' },
          { id: 'editor', label: 'editor' },
          { id: 'terminal', label: 'term' },
        ].map(tab => (
          <button key={tab.id}
            onClick={() => setSection(tab.id)}
            className={`flex-1 py-1.5 text-[10px] font-mono transition-all relative ${
              section === tab.id
                ? 'text-white'
                : 'text-[#555] hover:text-[#888]'
            }`}>
            {tab.label}
            {section === tab.id && (
              <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#5e9eff] rounded-full" 
                style={{ animation: 'fadeUp 0.15s ease' }} />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {section === 'themes' && (
          <div className="space-y-4" style={{ animation: 'fadeUp 0.2s ease' }}>
            <div>
              <h3 className="text-[10px] font-mono text-[#666] mb-2 uppercase tracking-wider">editor theme</h3>
              <div className="space-y-1">
                {EDITOR_THEMES.map(theme => (
                  <button key={theme.id}
                    onClick={() => onEditorThemeChange(theme.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition text-left ${
                      editorTheme === theme.id
                        ? 'bg-[#5e9eff]/8 border border-[#5e9eff]/15'
                        : 'hover:bg-[#222] border border-transparent'
                    }`}>
                    <div className="w-5 h-5 rounded border border-[#333] flex-shrink-0" style={{ background: theme.preview }}>
                      {editorTheme === theme.id && (
                        <div className="w-full h-full rounded flex items-center justify-center">
                          <svg className="w-3 h-3 text-[#5e9eff]" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-[11px] truncate ${editorTheme === theme.id ? 'text-[#5e9eff]' : 'text-[#aaa]'}`}>{theme.name}</p>
                      <p className="text-[9px] text-[#555] font-mono truncate">{theme.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-[10px] font-mono text-[#666] mb-2 uppercase tracking-wider">terminal theme</h3>
              <div className="space-y-1">
                {TERMINAL_THEMES.map(theme => (
                  <button key={theme.id}
                    onClick={() => onTerminalThemeChange(theme.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition text-left ${
                      terminalTheme === theme.id
                        ? 'bg-[#c4b5fd]/8 border border-[#c4b5fd]/15'
                        : 'hover:bg-[#222] border border-transparent'
                    }`}>
                    <div className="w-4 h-4 rounded border border-[#333] flex-shrink-0" style={{ background: theme.color }} />
                    <div className="min-w-0">
                      <p className={`text-[11px] truncate ${terminalTheme === theme.id ? 'text-[#c4b5fd]' : 'text-[#aaa]'}`}>{theme.name}</p>
                      <p className="text-[9px] text-[#555] font-mono truncate">{theme.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {section === 'editor' && (
          <div className="space-y-4" style={{ animation: 'fadeUp 0.2s ease' }}>
            <div>
              <h3 className="text-[10px] font-mono text-[#666] mb-2 uppercase tracking-wider">font size</h3>
              <div className="flex flex-wrap gap-1">
                {FONT_SIZES.map(size => (
                  <button key={size}
                    onClick={() => onFontSizeChange(size)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-mono transition ${
                      fontSize === size
                        ? 'bg-[#5e9eff]/10 text-[#5e9eff] border border-[#5e9eff]/15'
                        : 'bg-[#1e1f22] text-[#777] hover:text-white border border-transparent hover:border-[#333]'
                    }`}>
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-[10px] font-mono text-[#666] mb-2 uppercase tracking-wider">tab size</h3>
              <div className="flex gap-1">
                {TAB_SIZES.map(size => (
                  <button key={size}
                    onClick={() => onTabSizeChange(size)}
                    className={`px-3 py-1 rounded-md text-[10px] font-mono transition ${
                      tabSize === size
                        ? 'bg-[#5e9eff]/10 text-[#5e9eff] border border-[#5e9eff]/15'
                        : 'bg-[#1e1f22] text-[#777] hover:text-white border border-transparent hover:border-[#333]'
                    }`}>
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Cursor style */}
            {onCursorStyleChange && (
              <div>
                <h3 className="text-[10px] font-mono text-[#666] mb-2 uppercase tracking-wider">cursor style</h3>
                <div className="flex gap-1">
                  {CURSOR_STYLES.map(style => (
                    <button key={style.id}
                      onClick={() => onCursorStyleChange(style.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono transition ${
                        cursorStyle === style.id
                          ? 'bg-[#5e9eff]/10 text-[#5e9eff] border border-[#5e9eff]/15'
                          : 'bg-[#1e1f22] text-[#777] hover:text-white border border-transparent hover:border-[#333]'
                      }`}>
                      <span className="text-[12px]">{style.icon}</span>
                      <span>{style.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2.5 pt-1">
              <h3 className="text-[10px] font-mono text-[#666] uppercase tracking-wider">toggles</h3>
              
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex items-center gap-2">
                  <svg className="w-3 h-3 text-[#555]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                  <span className="text-[11px] text-[#888] group-hover:text-white transition font-mono">minimap</span>
                </div>
                <ToggleSwitch enabled={minimap} onToggle={onMinimapToggle} />
              </label>

              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex items-center gap-2">
                  <svg className="w-3 h-3 text-[#555]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
                  <span className="text-[11px] text-[#888] group-hover:text-white transition font-mono">word wrap</span>
                </div>
                <ToggleSwitch enabled={wordWrap} onToggle={onWordWrapToggle} />
              </label>

              {onBracketColorsToggle && (
                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-[#555]">{ }</span>
                    <span className="text-[11px] text-[#888] group-hover:text-white transition font-mono">bracket colors</span>
                  </div>
                  <ToggleSwitch enabled={bracketColors !== false} onToggle={onBracketColorsToggle} color="#ffb347" />
                </label>
              )}

              {onLineNumbersToggle && (
                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#555] font-mono">1:</span>
                    <span className="text-[11px] text-[#888] group-hover:text-white transition font-mono">line numbers</span>
                  </div>
                  <ToggleSwitch enabled={lineNumbers !== false} onToggle={onLineNumbersToggle} color="#5bd882" />
                </label>
              )}

              {onAutoIndentToggle && (
                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex items-center gap-2">
                    <svg className="w-3 h-3 text-[#555]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                    <span className="text-[11px] text-[#888] group-hover:text-white transition font-mono">auto indent</span>
                  </div>
                  <ToggleSwitch enabled={autoIndent !== false} onToggle={onAutoIndentToggle} color="#c4b5fd" />
                </label>
              )}
            </div>
          </div>
        )}

        {section === 'terminal' && (
          <div className="space-y-4" style={{ animation: 'fadeUp 0.2s ease' }}>
            <div>
              <h3 className="text-[10px] font-mono text-[#666] mb-2 uppercase tracking-wider">theme</h3>
              <div className="space-y-1">
                {TERMINAL_THEMES.map(theme => (
                  <button key={theme.id}
                    onClick={() => onTerminalThemeChange(theme.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition text-left ${
                      terminalTheme === theme.id
                        ? 'bg-[#c4b5fd]/8 border border-[#c4b5fd]/15'
                        : 'hover:bg-[#222] border border-transparent'
                    }`}>
                    <div className="w-4 h-4 rounded border border-[#333] flex-shrink-0" style={{ background: theme.color }} />
                    <span className={`text-[11px] ${terminalTheme === theme.id ? 'text-[#c4b5fd]' : 'text-[#aaa]'}`}>{theme.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#1e1f22] rounded-lg p-3 border border-[#282828]">
              <h3 className="text-[10px] font-mono text-[#666] mb-2 uppercase tracking-wider">tips</h3>
              <ul className="space-y-1.5">
                {[
                  { key: 'Enter', desc: 'send input line' },
                  { key: 'Ctrl+Enter', desc: 'run with stdin' },
                  { key: 'Ctrl+L', desc: 'clear terminal' },
                  { key: '↑ / ↓', desc: 'history navigation' },
                ].map((tip, i) => (
                  <li key={i} className="flex items-center gap-2 text-[10px] font-mono">
                    <kbd className="text-[9px] text-[#888]">{tip.key}</kbd>
                    <span className="text-[#555]">{tip.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-[#222] text-center">
        <p className="text-[9px] text-[#444] font-mono">collabcode v12</p>
      </div>
    </div>
  );
});

export default Extensions;
