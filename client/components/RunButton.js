/**
 * RunButton v23.0 — High Clarity Embedded Toolbar Action
 * Primary action button for code execution.
 * Designed to sit seamlessly in the editor header toolbar without overlapping code or minimap.
 * made with <3 by Namish
 */

import { memo } from 'react';

const RunButton = memo(function RunButton({ onRun, isRunning, language, embedded = true }) {
  const content = (
    <div className="flex items-center gap-1.5">
      {/* Run Action Button */}
      <button
        type="button"
        onClick={onRun}
        disabled={isRunning}
        className={`group relative flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-mono text-[12px] font-bold tracking-wide transition-all duration-150 active:scale-[0.97] shadow-sm select-none ${
          isRunning
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-wait animate-pulse'
            : 'bg-emerald-500 hover:bg-emerald-400 text-[#091e13] border border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.25)] hover:shadow-[0_0_16px_rgba(16,185,129,0.4)]'
        }`}
        title={`Execute ${language || 'Code'} (Ctrl+Enter)`}
      >
        {isRunning ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Running...</span>
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5 fill-current flex-shrink-0 transition-transform duration-150 group-hover:scale-110" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span className="uppercase tracking-wider">Run</span>
            {/* Embedded Keyboard Shortcut Badge */}
            <span className="hidden lg:inline-flex items-center px-1.5 py-0.2 rounded bg-black/20 text-[#091e13] text-[10px] font-mono font-semibold ml-0.5 opacity-90">
              Ctrl+↵
            </span>
          </>
        )}
      </button>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="hidden sm:flex items-center">
      {content}
    </div>
  );
});

export default RunButton;

