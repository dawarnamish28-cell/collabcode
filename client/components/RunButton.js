/**
 * RunButton v8.0 — Less shouty, more confident
 * made with <3 by Namish
 */

import { memo } from 'react';

const RunButton = memo(function RunButton({ onRun, isRunning, language }) {
  return (
    <div className="absolute top-2.5 sm:top-3 right-3 sm:right-4 z-30 flex items-center gap-2">
      {/* Shortcut hint */}
      <div className="hidden md:flex items-center gap-1.5 text-[10px] text-[#555] bg-[#1a1b1e]/90 
                    backdrop-blur-sm px-2.5 py-1 rounded-lg border border-[#282828] font-mono">
        <kbd>Ctrl</kbd>
        <span className="text-[#444]">+</span>
        <kbd>Enter</kbd>
      </div>

      {/* The button */}
      <button
        onClick={onRun}
        disabled={isRunning}
        className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl font-mono text-[12px] sm:text-[13px]
                   transition-all duration-150 active:scale-[0.96] font-medium
                   ${isRunning
                     ? 'bg-[#ffb347]/10 text-[#ffb347] border border-[#ffb347]/20 cursor-wait'
                     : 'bg-[#5bd882]/10 hover:bg-[#5bd882]/18 text-[#5bd882] border border-[#5bd882]/20 hover:border-[#5bd882]/35'
                   }`}
        title={`Run ${language} code (Ctrl+Enter)`}
      >
        {isRunning ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="hidden sm:inline">running</span>
            <span className="sm:hidden">...</span>
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span>run</span>
          </>
        )}
      </button>
    </div>
  );
});

export default RunButton;
