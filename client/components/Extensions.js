/**
 * Extensions v8.0 — Settings, warmer
 * made with <3 by Namish
 */

import { memo, useState } from 'react';

const EDITOR_THEMES = [
  { id: 'vs-dark', name: 'Dark+', desc: 'Default dark', preview: '#1e1e1e' },
  { id: 'vs', name: 'Light+', desc: 'Light theme', preview: '#ffffff' },
  { id: 'hc-black', name: 'High Contrast', desc: 'Accessibility', preview: '#000000' },
];

const TERMINAL_THEMES = [
  { id: 'vs-dark', name: 'Default', desc: 'Dark+', color: '#1a1b1e' },
  { id: 'monokai', name: 'Monokai', desc: 'Classic', color: '#272822' },
  { id: 'github-dark', name: 'GitHub', desc: 'Dark dimmed', color: '#0d1117' },
  { id: 'dracula', name: 'Dracula', desc: 'Pastel goth', color: '#282a36' },
  { id: 'one-dark', name: 'One Dark', desc: 'Atom-style', color: '#282c34' },
  { id: 'solarized-dark', name: 'Solarized', desc: 'Warm dark', color: '#002b36' },
];

const FONT_SIZES = [12, 13, 14, 15, 16, 18];
const TAB_SIZES = [2, 4, 8];

const Extensions = memo(function Extensions({
  editorTheme, onEditorThemeChange,
  terminalTheme, onTerminalThemeChange,
  fontSize, onFontSizeChange,
  tabSize, onTabSizeChange,
  minimap, onMinimapToggle,
  wordWrap, onWordWrapToggle,
}) {
  const [section, setSection] = useState('themes');

  return (
    <div className="h-full flex flex-col bg-[#19191c] border-r border-[#282828] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#222]">
        <span className="text-[10px] font-mono text-[#666] uppercase tracking-wider">settings</span>
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
            className={`flex-1 py-1.5 text-[10px] font-mono transition ${
              section === tab.id
                ? 'text-white border-b border-[#5e9eff]'
                : 'text-[#555] hover:text-[#888]'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {section === 'themes' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-[10px] font-mono text-[#666] mb-2 uppercase tracking-wider">editor</h3>
              <div className="space-y-1">
                {EDITOR_THEMES.map(theme => (
                  <button key={theme.id}
                    onClick={() => onEditorThemeChange(theme.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition text-left ${
                      editorTheme === theme.id
                        ? 'bg-[#5e9eff]/8 border border-[#5e9eff]/15'
                        : 'hover:bg-[#222] border border-transparent'
                    }`}>
                    <div className="w-5 h-5 rounded border border-[#333] flex-shrink-0" style={{ background: theme.preview }} />
                    <div className="min-w-0">
                      <p className={`text-[11px] truncate ${editorTheme === theme.id ? 'text-[#5e9eff]' : 'text-[#aaa]'}`}>{theme.name}</p>
                      <p className="text-[9px] text-[#555] font-mono truncate">{theme.desc}</p>
                    </div>
                    {editorTheme === theme.id && (
                      <svg className="w-3 h-3 text-[#5e9eff] ml-auto flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-[10px] font-mono text-[#666] mb-2 uppercase tracking-wider">terminal</h3>
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
          <div className="space-y-4">
            <div>
              <h3 className="text-[10px] font-mono text-[#666] mb-2 uppercase tracking-wider">font size</h3>
              <div className="flex flex-wrap gap-1">
                {FONT_SIZES.map(size => (
                  <button key={size}
                    onClick={() => onFontSizeChange(size)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-mono transition ${
                      fontSize === size
                        ? 'bg-[#5e9eff]/10 text-[#5e9eff] border border-[#5e9eff]/15'
                        : 'bg-[#1e1f22] text-[#777] hover:text-white border border-transparent'
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
                        : 'bg-[#1e1f22] text-[#777] hover:text-white border border-transparent'
                    }`}>
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-[11px] text-[#888] group-hover:text-white transition font-mono">minimap</span>
                <button onClick={onMinimapToggle}
                  className={`w-7 h-[15px] rounded-full transition-all relative ${minimap ? 'bg-[#5e9eff]' : 'bg-[#444]'}`}>
                  <div className="w-[11px] h-[11px] rounded-full bg-white absolute top-[2px] transition-all shadow-sm"
                    style={{ left: minimap ? '14px' : '2px' }} />
                </button>
              </label>
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-[11px] text-[#888] group-hover:text-white transition font-mono">word wrap</span>
                <button onClick={onWordWrapToggle}
                  className={`w-7 h-[15px] rounded-full transition-all relative ${wordWrap ? 'bg-[#5e9eff]' : 'bg-[#444]'}`}>
                  <div className="w-[11px] h-[11px] rounded-full bg-white absolute top-[2px] transition-all shadow-sm"
                    style={{ left: wordWrap ? '14px' : '2px' }} />
                </button>
              </label>
            </div>
          </div>
        )}

        {section === 'terminal' && (
          <div className="space-y-4">
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

            <div className="pt-1">
              <p className="text-[9px] text-[#444] font-mono leading-relaxed">
                20 languages. type input when program asks. ctrl+enter to run.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-[#222] text-center">
        <p className="text-[9px] text-[#444] font-mono">collabcode v8</p>
      </div>
    </div>
  );
});

export default Extensions;
