/**
 * Extensions Panel v1.0 — Themes & Terminal Customization
 * 
 * VSCode-style extensions panel for themes, terminal settings.
 * made with <3 by Namish
 */

import { memo, useState } from 'react';

const EDITOR_THEMES = [
  { id: 'vs-dark', name: 'Dark+ (Default)', desc: 'VSCode dark theme', preview: '#1e1e1e' },
  { id: 'vs', name: 'Light+', desc: 'VSCode light theme', preview: '#ffffff' },
  { id: 'hc-black', name: 'High Contrast', desc: 'High contrast dark', preview: '#000000' },
];

const TERMINAL_THEMES = [
  { id: 'vs-dark', name: 'Dark+ (Default)', desc: 'VSCode dark terminal', color: '#1e1e1e' },
  { id: 'monokai', name: 'Monokai', desc: 'Classic Monokai', color: '#272822' },
  { id: 'github-dark', name: 'GitHub Dark', desc: 'GitHub dark dimmed', color: '#0d1117' },
  { id: 'dracula', name: 'Dracula', desc: 'Popular Dracula theme', color: '#282a36' },
  { id: 'one-dark', name: 'One Dark Pro', desc: 'Atom One Dark', color: '#282c34' },
  { id: 'solarized-dark', name: 'Solarized Dark', desc: 'Solarized color scheme', color: '#002b36' },
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
    <div className="h-full flex flex-col bg-[#252526] border-r border-editor-border overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-editor-border/50">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Extensions</span>
      </div>

      {/* Section Tabs */}
      <div className="flex border-b border-editor-border/50">
        {[
          { id: 'themes', label: 'Themes', icon: '🎨' },
          { id: 'editor', label: 'Editor', icon: '⚙️' },
          { id: 'terminal', label: 'Terminal', icon: '💻' },
        ].map(tab => (
          <button key={tab.id}
            onClick={() => setSection(tab.id)}
            className={`flex-1 py-2 text-[10px] font-medium transition ${
              section === tab.id
                ? 'text-white border-b-2 border-blue-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}>
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {section === 'themes' && (
          <div className="space-y-4">
            {/* Editor Theme */}
            <div>
              <h3 className="text-[11px] font-semibold text-gray-300 mb-2">Editor Theme</h3>
              <div className="space-y-1">
                {EDITOR_THEMES.map(theme => (
                  <button key={theme.id}
                    onClick={() => onEditorThemeChange(theme.id)}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition text-left ${
                      editorTheme === theme.id
                        ? 'bg-blue-600/20 border border-blue-500/30'
                        : 'hover:bg-[#2a2d2e] border border-transparent'
                    }`}>
                    <div className="w-6 h-6 rounded border border-editor-border/50 flex-shrink-0" style={{ background: theme.preview }} />
                    <div className="min-w-0">
                      <p className={`text-xs truncate ${editorTheme === theme.id ? 'text-blue-300' : 'text-gray-300'}`}>{theme.name}</p>
                      <p className="text-[10px] text-gray-600 truncate">{theme.desc}</p>
                    </div>
                    {editorTheme === theme.id && (
                      <svg className="w-3.5 h-3.5 text-blue-400 ml-auto flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Terminal Theme */}
            <div>
              <h3 className="text-[11px] font-semibold text-gray-300 mb-2">Terminal Theme</h3>
              <div className="space-y-1">
                {TERMINAL_THEMES.map(theme => (
                  <button key={theme.id}
                    onClick={() => onTerminalThemeChange(theme.id)}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition text-left ${
                      terminalTheme === theme.id
                        ? 'bg-purple-600/20 border border-purple-500/30'
                        : 'hover:bg-[#2a2d2e] border border-transparent'
                    }`}>
                    <div className="w-6 h-6 rounded border border-editor-border/50 flex-shrink-0" style={{ background: theme.color }} />
                    <div className="min-w-0">
                      <p className={`text-xs truncate ${terminalTheme === theme.id ? 'text-purple-300' : 'text-gray-300'}`}>{theme.name}</p>
                      <p className="text-[10px] text-gray-600 truncate">{theme.desc}</p>
                    </div>
                    {terminalTheme === theme.id && (
                      <svg className="w-3.5 h-3.5 text-purple-400 ml-auto flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {section === 'editor' && (
          <div className="space-y-4">
            {/* Font Size */}
            <div>
              <h3 className="text-[11px] font-semibold text-gray-300 mb-2">Font Size</h3>
              <div className="flex flex-wrap gap-1.5">
                {FONT_SIZES.map(size => (
                  <button key={size}
                    onClick={() => onFontSizeChange(size)}
                    className={`px-2.5 py-1 rounded text-xs font-mono transition ${
                      fontSize === size
                        ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30'
                        : 'bg-[#2a2d2e] text-gray-400 hover:text-white border border-transparent'
                    }`}>
                    {size}px
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Size */}
            <div>
              <h3 className="text-[11px] font-semibold text-gray-300 mb-2">Tab Size</h3>
              <div className="flex gap-1.5">
                {TAB_SIZES.map(size => (
                  <button key={size}
                    onClick={() => onTabSizeChange(size)}
                    className={`px-3 py-1 rounded text-xs font-mono transition ${
                      tabSize === size
                        ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30'
                        : 'bg-[#2a2d2e] text-gray-400 hover:text-white border border-transparent'
                    }`}>
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-2">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-xs text-gray-300 group-hover:text-white transition">Minimap</span>
                <button onClick={onMinimapToggle}
                  className={`w-8 h-4 rounded-full transition-all relative ${minimap ? 'bg-blue-500' : 'bg-[#555]'}`}>
                  <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${minimap ? 'left-4.5' : 'left-0.5'}`}
                    style={{ left: minimap ? '17px' : '2px' }} />
                </button>
              </label>
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-xs text-gray-300 group-hover:text-white transition">Word Wrap</span>
                <button onClick={onWordWrapToggle}
                  className={`w-8 h-4 rounded-full transition-all relative ${wordWrap ? 'bg-blue-500' : 'bg-[#555]'}`}>
                  <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all`}
                    style={{ left: wordWrap ? '17px' : '2px' }} />
                </button>
              </label>
            </div>
          </div>
        )}

        {section === 'terminal' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-[11px] font-semibold text-gray-300 mb-1">Terminal Theme</h3>
              <p className="text-[10px] text-gray-600 mb-2">Choose a theme for the terminal panel</p>
              <div className="space-y-1">
                {TERMINAL_THEMES.map(theme => (
                  <button key={theme.id}
                    onClick={() => onTerminalThemeChange(theme.id)}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition text-left ${
                      terminalTheme === theme.id
                        ? 'bg-purple-600/20 border border-purple-500/30'
                        : 'hover:bg-[#2a2d2e] border border-transparent'
                    }`}>
                    <div className="w-5 h-5 rounded border border-editor-border/50 flex-shrink-0" style={{ background: theme.color }} />
                    <span className={`text-xs ${terminalTheme === theme.id ? 'text-purple-300' : 'text-gray-300'}`}>{theme.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-editor-border/30">
              <p className="text-[10px] text-gray-600">
                Terminal supports stdin input for all 15 languages.
                Type input and press Enter to buffer lines, Ctrl+Enter to run.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-editor-border/50 text-center">
        <p className="text-[9px] text-gray-600">made with &lt;3 by Namish</p>
      </div>
    </div>
  );
});

export default Extensions;
