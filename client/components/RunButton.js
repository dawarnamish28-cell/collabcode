/**
 * RunButton Component v4.0
 * 
 * Floating action button for code execution.
 * Shows input indicator when code needs stdin.
 * The run action auto-includes stdin from OutputConsole.
 */

import { memo } from 'react';

const RunButton = memo(function RunButton({ onRun, isRunning, language, needsInput }) {
  return (
    <div className="absolute top-3 right-4 z-30 flex items-center gap-2">
      {/* Keyboard shortcut hint */}
      <div className="hidden sm:flex items-center gap-1 text-[10px] text-gray-500 bg-[#252526]/80 
                    backdrop-blur-sm px-2 py-1 rounded-md border border-editor-border/30">
        <kbd className="px-1 py-0.5 bg-[#333] rounded text-[10px] font-mono">Ctrl</kbd>
        <span>+</span>
        <kbd className="px-1 py-0.5 bg-[#333] rounded text-[10px] font-mono">Enter</kbd>
        <span className="text-gray-600 ml-1">to run</span>
      </div>

      {/* Input indicator */}
      {needsInput && (
        <div className="hidden sm:flex items-center gap-1 text-[10px] bg-yellow-500/10 border border-yellow-500/30 
                      backdrop-blur-sm px-2 py-1 rounded-md text-yellow-400">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span>stdin</span>
        </div>
      )}

      {/* Run Button */}
      <button
        onClick={onRun}
        disabled={isRunning}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
                   shadow-lg transition-all duration-200 active:scale-95
                   ${isRunning
                     ? 'bg-yellow-600 text-yellow-100 cursor-wait shadow-yellow-600/20'
                     : 'bg-green-600 hover:bg-green-500 text-white shadow-green-600/30 hover:shadow-green-500/40'
                   }`}
        title={`Run ${language} code${needsInput ? ' (with stdin from terminal)' : ''}`}
      >
        {isRunning ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Running...</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
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
