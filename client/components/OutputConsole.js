/**
 * OutputConsole Component
 * 
 * Displays code execution output with:
 * - Color-coded output (success/error/info)
 * - Execution metadata (time, memory)
 * - Clear button
 * - Terminal-like appearance
 */

import { memo, useRef, useEffect } from 'react';

const OutputConsole = memo(function OutputConsole({ output, onClear, isRunning }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  return (
    <div className="h-full flex flex-col bg-[#1a1b26] border-t border-editor-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#252526] border-b border-editor-border">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs font-medium text-gray-400">Output</span>
          
          {/* Status indicator */}
          {isRunning && (
            <div className="flex items-center gap-1.5 ml-2">
              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-xs text-yellow-400">Running...</span>
            </div>
          )}
          
          {output?.executionTime && (
            <span className="text-[10px] text-gray-500 ml-2">
              {output.executionTime} | {output.memoryUsed}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {output?.status && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full
              ${output.type === 'success' ? 'bg-green-600/20 text-green-400' : ''}
              ${output.type === 'error' ? 'bg-red-600/20 text-red-400' : ''}
              ${output.type === 'info' ? 'bg-blue-600/20 text-blue-400' : ''}
            `}>
              {output.status}
            </span>
          )}
          {output?.mock && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-600/20 text-yellow-400">
              Mock
            </span>
          )}
          <button
            onClick={onClear}
            className="p-1 rounded hover:bg-[#2a2d2e] text-gray-500 hover:text-gray-300 transition-colors"
            title="Clear output"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Output Content */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-3 font-mono text-sm">
        {!output && !isRunning && (
          <div className="h-full flex items-center justify-center text-gray-600 text-xs">
            <div className="text-center">
              <p>Press <kbd className="px-1.5 py-0.5 bg-[#252526] rounded text-[10px] mx-0.5">Ctrl+Enter</kbd> to run code</p>
              <p className="mt-1 text-gray-700">Output will appear here</p>
            </div>
          </div>
        )}

        {isRunning && !output?.content && (
          <div className="flex items-center gap-2 text-yellow-400">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Executing code...</span>
          </div>
        )}

        {output && output.content && (
          <div className="space-y-1">
            {/* Prompt line */}
            <div className="flex items-start gap-2">
              <span className="text-terminal-green select-none">$</span>
              <pre className={`whitespace-pre-wrap break-words flex-1
                ${output.type === 'success' ? 'text-gray-200' : ''}
                ${output.type === 'error' ? 'text-terminal-red' : ''}
                ${output.type === 'info' ? 'text-terminal-blue' : ''}
              `}>
                {output.content}
              </pre>
            </div>

            {/* Separator */}
            <div className="border-t border-gray-800 pt-1 mt-2">
              <span className="text-terminal-green select-none text-xs">$</span>
              <span className="text-gray-600 text-xs ml-2 animate-pulse">_</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default OutputConsole;
