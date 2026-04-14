/**
 * RunButton Component v6.0
 * 
 * Floating action button for code execution.
 * Responsive — smaller on mobile.
 * made with <3 by Namish
 */

import { memo } from 'react';

const RunButton = memo(function RunButton({ onRun, isRunning, language }) {
  return (
    <div className="absolute top-2 sm:top-3 right-2 sm:right-4 z-30 flex items-center gap-1.5 sm:gap-2">
      {/* Keyboard shortcut hint */}
      <div className="hidden md:flex items-center gap-1 text-[10px] text-gray-500 bg-[#252526]/80 
                    backdrop-blur-sm px-2 py-1 rounded-md border border-editor-border/30">
        <kbd className="px-1 py-0.5 bg-[#333] rounded text-[10px] font-mono">Ctrl</kbd>
        <span>+</span>
        <kbd className="px-1 py-0.5 bg-[#333] rounded text-[10px] font-mono">Enter</kbd>
      </div>

      {/* Run Button */}
      <button
        onClick={onRun}
        disabled={isRunning}
        className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-medium text-xs sm:text-sm
                   shadow-lg transition-all duration-200 active:scale-95
                   ${isRunning
                     ? 'bg-yellow-600 text-yellow-100 cursor-wait shadow-yellow-600/20'
                     : 'bg-green-600 hover:bg-green-500 text-white shadow-green-600/30 hover:shadow-green-500/40'
                   }`}
        title={`Run ${language} code (Ctrl+Enter)`}
      >
        {isRunning ? (
          <>
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="hidden sm:inline">Running...</span>
            <span className="sm:hidden">...</span>
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span>Run</span>
          </>
        )}
      </button>
    </div>
  );
});

export default RunButton;
