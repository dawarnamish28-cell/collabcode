/**
 * Stopwatch v2.0 — Embedded IDE Coding Timer with Reload Protection
 *
 * Designed for interview practice, timed challenges, and LeetCode-style problem solving.
 *  - User can manually start, pause, resume, and reset the stopwatch.
 *  - Automatically stops and records time when code executes successfully.
 *  - High-precision timestamp delta (immune to tab backgrounding / interval drift).
 *  - Accidental Reload Protection: persists state to sessionStorage and auto-restores on refresh.
 *  - Notifies parent via onStatusChange so IDE can enforce "start stopwatch to code".
 *
 * made with <3 by Namish
 */

import { useState, useEffect, useRef, useCallback, memo } from 'react';

function formatStopwatchTime(ms) {
  if (!ms || ms < 0) return '00:00.0';
  const totalSeconds = Math.floor(ms / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(remMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

const Stopwatch = memo(function Stopwatch({
  roomId = '',
  requireStopwatch = false,
  successTrigger = 0,
  onStopOnSuccess = null,
  onStatusChange = null,
  addToast = null,
  compact = false,
  className = '',
}) {
  // 'idle' | 'running' | 'paused' | 'success'
  const [status, setStatus] = useState('idle');
  const [elapsedMs, setElapsedMs] = useState(0);

  const startTimeRef = useRef(0);
  const accumulatedRef = useRef(0);
  const timerRef = useRef(null);
  const prevSuccessTriggerRef = useRef(successTrigger);
  const storageKey = `collabcode_stopwatch_${roomId || 'default'}`;

  // Notify parent whenever status changes
  useEffect(() => {
    if (onStatusChange) {
      onStatusChange({
        status,
        elapsedMs,
        isRunning: status === 'running',
        hasStarted: status !== 'idle',
      });
    }
  }, [status, onStatusChange]);

  // Save state to sessionStorage for accidental reload protection
  const saveStateToStorage = useCallback((currStatus, currAccumulated, currStartTime) => {
    try {
      if (currStatus === 'idle') {
        sessionStorage.removeItem(storageKey);
      } else {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({
            status: currStatus,
            accumulated: currAccumulated,
            startTime: currStartTime,
            savedAt: Date.now(),
          })
        );
      }
    } catch (e) {}
  }, [storageKey]);

  // Stop the timer interval
  const stopTick = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Interval tick loop (50ms interval for smooth tenths display)
  const startTick = useCallback(() => {
    stopTick();
    timerRef.current = setInterval(() => {
      const now = Date.now();
      const current = accumulatedRef.current + (now - startTimeRef.current);
      setElapsedMs(current);
    }, 50);
  }, [stopTick]);

  // Restore state from sessionStorage after page reload
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (data && data.status && data.status !== 'idle') {
          if (data.status === 'running') {
            const now = Date.now();
            accumulatedRef.current = data.accumulated || 0;
            startTimeRef.current = data.startTime || now;
            const currentTotal = accumulatedRef.current + (now - startTimeRef.current);
            setElapsedMs(currentTotal);
            setStatus('running');
            startTick();
            if (addToast) {
              addToast('⏱️ Stopwatch session restored', 'info');
            }
          } else {
            accumulatedRef.current = data.accumulated || 0;
            setElapsedMs(data.accumulated || 0);
            setStatus(data.status);
          }
        }
      }
    } catch (e) {}
  }, [storageKey, startTick, addToast]);

  // Save to storage before window unloads
  useEffect(() => {
    const handleUnload = () => {
      saveStateToStorage(status, accumulatedRef.current, startTimeRef.current);
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [status, saveStateToStorage]);

  // Start / Resume handler
  const handleStart = useCallback(() => {
    let acc = accumulatedRef.current;
    if (status === 'success') {
      acc = 0;
      accumulatedRef.current = 0;
      setElapsedMs(0);
    }
    const start = Date.now();
    startTimeRef.current = start;
    setStatus('running');
    saveStateToStorage('running', acc, start);
    startTick();
  }, [status, startTick, saveStateToStorage]);

  // Pause handler
  const handlePause = useCallback(() => {
    stopTick();
    const newAcc = accumulatedRef.current + (Date.now() - startTimeRef.current);
    accumulatedRef.current = newAcc;
    setElapsedMs(newAcc);
    setStatus('paused');
    saveStateToStorage('paused', newAcc, startTimeRef.current);
  }, [stopTick, saveStateToStorage]);

  // Toggle Start / Pause
  const handleToggle = useCallback(() => {
    if (status === 'running') {
      handlePause();
    } else {
      handleStart();
    }
  }, [status, handlePause, handleStart]);

  // Reset handler
  const handleReset = useCallback(() => {
    stopTick();
    accumulatedRef.current = 0;
    setElapsedMs(0);
    setStatus('idle');
    saveStateToStorage('idle', 0, 0);
  }, [stopTick, saveStateToStorage]);

  // Auto-stop when code execution succeeds!
  useEffect(() => {
    if (successTrigger && successTrigger !== prevSuccessTriggerRef.current) {
      prevSuccessTriggerRef.current = successTrigger;

      if (status === 'running') {
        stopTick();
        const finalMs = accumulatedRef.current + (Date.now() - startTimeRef.current);
        accumulatedRef.current = finalMs;
        setElapsedMs(finalMs);
        setStatus('success');
        saveStateToStorage('success', finalMs, startTimeRef.current);

        const formatted = formatStopwatchTime(finalMs);
        if (onStopOnSuccess) {
          onStopOnSuccess(finalMs, formatted);
        }
        if (addToast) {
          addToast(`⏱️ Solved in ${formatted}!`, 'success');
        }
      }
    }
  }, [successTrigger, status, stopTick, onStopOnSuccess, addToast, saveStateToStorage]);

  // Global event listener for command palette & hotkeys
  useEffect(() => {
    const handleCustomEvent = (e) => {
      if (!e?.detail) return;
      if (e.detail === 'toggle') handleToggle();
      else if (e.detail === 'start') handleStart();
      else if (e.detail === 'pause') handlePause();
      else if (e.detail === 'reset') handleReset();
    };
    window.addEventListener('collabcode:stopwatch', handleCustomEvent);
    return () => window.removeEventListener('collabcode:stopwatch', handleCustomEvent);
  }, [handleToggle, handleStart, handlePause, handleReset]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTick();
    };
  }, [stopTick]);

  const formattedTime = formatStopwatchTime(elapsedMs);

  return (
    <div
      className={`group relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[11px] transition-all duration-200 select-none ${
        status === 'running'
          ? 'bg-blue-500/10 border border-blue-500/40 text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.18)]'
          : status === 'success'
          ? 'bg-emerald-500/15 border border-emerald-500/50 text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.25)]'
          : status === 'paused'
          ? 'bg-amber-500/10 border border-amber-500/40 text-amber-300'
          : requireStopwatch
          ? 'bg-blue-500/15 border border-blue-400 text-blue-300 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.25)]'
          : 'bg-[#121316] border border-[#252830] text-[#94a3b8] hover:border-[#383d4a] hover:text-[#cbd5e1]'
      } ${className}`}
      title={
        status === 'running'
          ? 'Stopwatch running • Click to pause (stops automatically on successful run)'
          : status === 'success'
          ? `Solved in ${formattedTime}! Click to restart`
          : status === 'paused'
          ? 'Stopwatch paused • Click to resume'
          : 'Coding Stopwatch • Click to start (stops automatically on successful run)'
      }
    >
      {/* Icon + Time Display button */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded"
        aria-label={status === 'running' ? 'Pause stopwatch' : 'Start stopwatch'}
      >
        {status === 'success' ? (
          <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg
            className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${
              status === 'running' ? 'text-blue-400 animate-pulse' : 'text-[#94a3b8] group-hover:text-white'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}

        {/* Digital Time Display */}
        <span
          className={`tracking-wider font-semibold tabular-nums ${
            status === 'running'
              ? 'text-blue-300'
              : status === 'success'
              ? 'text-emerald-300 font-bold'
              : status === 'paused'
              ? 'text-amber-300'
              : 'text-[#94a3b8] group-hover:text-white'
          }`}
        >
          {formattedTime}
        </span>
      </button>

      {/* Status Badge when solved */}
      {status === 'success' && (
        <span className="hidden sm:inline-flex items-center px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold uppercase tracking-wider">
          Solved
        </span>
      )}

      {/* Required badge when stopwatch is enforced by admin */}
      {requireStopwatch && status === 'idle' && (
        <span className="hidden sm:inline-flex items-center px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 text-[9px] font-bold uppercase tracking-wider">
          Required
        </span>
      )}

      {/* Control Buttons: Play/Pause and Reset */}
      <div className="flex items-center gap-0.5 ml-0.5 pl-1 border-l border-white/10">
        {/* Play / Pause Toggle Button */}
        <button
          type="button"
          onClick={handleToggle}
          className={`p-1 rounded hover:bg-white/10 transition active:scale-95 ${
            status === 'running'
              ? 'text-blue-400 hover:text-blue-300'
              : status === 'success'
              ? 'text-emerald-400 hover:text-emerald-300'
              : 'text-[#94a3b8] hover:text-white'
          }`}
          title={status === 'running' ? 'Pause' : status === 'success' ? 'Restart' : 'Start'}
        >
          {status === 'running' ? (
            <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Reset Button (visible when not idle) */}
        {status !== 'idle' && (
          <button
            type="button"
            onClick={handleReset}
            className="p-1 rounded text-[#94a3b8] hover:text-white hover:bg-white/10 transition active:scale-95"
            title="Reset stopwatch (00:00.0)"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
});

export default Stopwatch;
