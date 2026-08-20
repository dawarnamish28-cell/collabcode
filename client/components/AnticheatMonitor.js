/**
 * AnticheatMonitor v2.0 — Client-Side Proctoring Engine (Production-Ready)
 * 
 * 5 rock-solid detections that actually work and report to server:
 *  1. Tab/window switch (visibilitychange + blur/focus)
 *  2. Copy/Paste interception (document copy/paste events)
 *  3. DevTools detection (keyboard shortcuts + outer/inner size heuristic)
 *  4. Right-click block (contextmenu prevention)
 *  5. Focus loss / window blur detection
 * 
 * Plus secondary detections:
 *  6. Fullscreen exit (fullscreenchange)
 *  7. Screenshot key (PrintScreen, Cmd+Shift+3/4/5)
 *  8. Idle timeout (no input for N seconds)
 * 
 * All controlled by server. Activates when anticheat:state-change
 * fires with enabled=true OR when room:state includes anticheat.enabled.
 * 
 * v2.0 fixes:
 *  - Stable refs prevent hook teardown loops
 *  - SSR-safe throughout
 *  - console.log traces for debugging
 * 
 * made with <3 by Namish
 */

import { useEffect, useRef, useCallback } from 'react';

// ─── Anticheat Hook ──────────────────────────────────────────────────────
export function useAnticheat(socketRef, enabled, settings, onViolation) {
  // All mutable state in refs to avoid re-triggering useEffect
  const settingsRef = useRef(settings || {});
  const enabledRef = useRef(enabled);
  const onViolationRef = useRef(onViolation);
  const socketRefRef = useRef(socketRef);
  const lastActivityRef = useRef(Date.now());
  const cleanupFnsRef = useRef([]);
  const windowSizeRef = useRef(null); // Lazy-init in useEffect
  const rateLimitMapRef = useRef({});
  const devtoolsWasOpenRef = useRef(false);
  const setupDoneRef = useRef(false);

  // Keep refs in sync — these never cause the effect to re-run
  useEffect(() => { settingsRef.current = settings || {}; }, [settings]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { onViolationRef.current = onViolation; }, [onViolation]);
  useEffect(() => { socketRefRef.current = socketRef; }, [socketRef]);

  // ─── Main effect: keyed only on `enabled` boolean ─────────────────
  useEffect(() => {
    // SSR guard
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Teardown previous listeners if any
    cleanupFnsRef.current.forEach(fn => { try { fn(); } catch(e){} });
    cleanupFnsRef.current = [];

    if (!enabled) {
      console.log('[AntiCheat] Disabled — all monitors stopped');
      setupDoneRef.current = false;
      return;
    }

    console.log('[AntiCheat] ENABLED — setting up monitors');
    setupDoneRef.current = true;
    windowSizeRef.current = { w: window.innerWidth, h: window.innerHeight };
    lastActivityRef.current = Date.now();
    rateLimitMapRef.current = {};

    const cleanups = [];
    const s = settingsRef.current;

    // ─── Rate-limited report function (stable, no deps) ─────────
    function report(type, metadata) {
      if (!enabledRef.current) return;
      // Client-side rate limit: 1 per type per 5 seconds
      const now = Date.now();
      if (rateLimitMapRef.current[type] && now - rateLimitMapRef.current[type] < 5000) return;
      rateLimitMapRef.current[type] = now;

      console.log(`[AntiCheat] VIOLATION: ${type}`, metadata);

      const sock = socketRefRef.current?.current;
      if (sock?.connected) {
        sock.emit('anticheat:violation', {
          type,
          metadata: {
            ...metadata,
            userAgent: navigator.userAgent || '',
            timestamp: now,
            screenRes: `${screen.width}x${screen.height}`,
            windowRes: `${window.innerWidth}x${window.innerHeight}`,
          },
        });
      } else {
        console.warn('[AntiCheat] Socket not connected, violation not sent:', type);
      }

      // Notify parent (e.g. show toast)
      const cb = onViolationRef.current;
      if (cb) cb(type, metadata);
    }

    // ═══════════════════════════════════════════════════════════════
    // 1. TAB/WINDOW SWITCH — visibilitychange is the most reliable
    // ═══════════════════════════════════════════════════════════════
    if (s.detectTabSwitch !== false) {
      const onVisChange = () => {
        if (document.hidden || document.visibilityState === 'hidden') {
          report('TAB_SWITCH', { method: 'visibilitychange', hidden: true });
        }
      };
      document.addEventListener('visibilitychange', onVisChange);
      cleanups.push(() => document.removeEventListener('visibilitychange', onVisChange));
      console.log('[AntiCheat] ✓ Tab switch detection active');
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. COPY / PASTE — capture phase to catch even Monaco events
    // ═══════════════════════════════════════════════════════════════
    if (s.blockCopyPaste !== false) {
      const onCopy = () => {
        const sel = window.getSelection?.()?.toString?.()?.slice(0, 100) || '';
        report('COPY', { selectionPreview: sel });
      };
      const onPaste = () => {
        report('PASTE', { target: document.activeElement?.tagName || 'unknown' });
      };
      // Capture phase = true, so we catch it before any element prevents it
      document.addEventListener('copy', onCopy, true);
      document.addEventListener('paste', onPaste, true);
      cleanups.push(() => {
        document.removeEventListener('copy', onCopy, true);
        document.removeEventListener('paste', onPaste, true);
      });
      console.log('[AntiCheat] ✓ Copy/paste detection active');
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. DEVTOOLS — keyboard shortcuts + outer-inner size heuristic
    // ═══════════════════════════════════════════════════════════════
    if (s.blockDevTools !== false) {
      // 3a. Keyboard shortcut interception
      const onKeyDown = (e) => {
        let detected = null;
        if (e.key === 'F12') detected = 'F12';
        else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i')) detected = 'Ctrl+Shift+I';
        else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j')) detected = 'Ctrl+Shift+J';
        else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) detected = 'Ctrl+Shift+C';
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) detected = 'Ctrl+U';

        if (detected) {
          e.preventDefault();
          e.stopPropagation();
          report('DEVTOOLS', { method: detected });
        }
      };
      // Capture phase to intercept before page scripts
      document.addEventListener('keydown', onKeyDown, true);
      cleanups.push(() => document.removeEventListener('keydown', onKeyDown, true));

      // 3b. Periodic outer-inner window size check (docked devtools changes this)
      devtoolsWasOpenRef.current = false;
      const checkInterval = setInterval(() => {
        const dw = window.outerWidth - window.innerWidth;
        const dh = window.outerHeight - window.innerHeight;
        // Threshold: 160px difference suggests devtools panel
        const isOpen = dw > 160 || dh > 160;
        if (isOpen && !devtoolsWasOpenRef.current) {
          devtoolsWasOpenRef.current = true;
          report('DEVTOOLS', {
            method: 'size_heuristic',
            outerW: window.outerWidth, innerW: window.innerWidth,
            outerH: window.outerHeight, innerH: window.innerHeight,
          });
        } else if (!isOpen) {
          devtoolsWasOpenRef.current = false;
        }
      }, 1500);
      cleanups.push(() => clearInterval(checkInterval));
      console.log('[AntiCheat] ✓ DevTools detection active');
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. RIGHT-CLICK — block context menu
    // ═══════════════════════════════════════════════════════════════
    if (s.blockRightClick !== false) {
      const onCtxMenu = (e) => {
        e.preventDefault();
        report('RIGHT_CLICK', { target: e.target?.tagName || 'unknown', x: e.clientX, y: e.clientY });
        return false;
      };
      document.addEventListener('contextmenu', onCtxMenu, true);
      cleanups.push(() => document.removeEventListener('contextmenu', onCtxMenu, true));
      console.log('[AntiCheat] ✓ Right-click block active');
    }

    // ═══════════════════════════════════════════════════════════════
    // 5. FOCUS LOSS — window.blur fires when user clicks outside browser
    // ═══════════════════════════════════════════════════════════════
    if (s.detectFocusLoss !== false) {
      const onBlur = () => {
        // Don't double-report with tab switch (visibilitychange is more accurate)
        // Only report blur if document is NOT hidden (that means click outside, not tab switch)
        if (!document.hidden) {
          report('FOCUS_LOSS', { activeElement: document.activeElement?.tagName || 'none' });
        }
      };
      window.addEventListener('blur', onBlur);
      cleanups.push(() => window.removeEventListener('blur', onBlur));
      console.log('[AntiCheat] ✓ Focus loss detection active');
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. FULLSCREEN EXIT
    // ═══════════════════════════════════════════════════════════════
    if (s.forceFullscreen !== false) {
      const onFsChange = () => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
          report('FULLSCREEN_EXIT', {});
        }
      };
      document.addEventListener('fullscreenchange', onFsChange);
      document.addEventListener('webkitfullscreenchange', onFsChange);
      cleanups.push(() => {
        document.removeEventListener('fullscreenchange', onFsChange);
        document.removeEventListener('webkitfullscreenchange', onFsChange);
      });
      console.log('[AntiCheat] ✓ Fullscreen exit detection active');
    }

    // ═══════════════════════════════════════════════════════════════
    // 7. SCREENSHOT KEY — PrintScreen, Win+Shift+S, Cmd+Shift+3/4/5
    // ═══════════════════════════════════════════════════════════════
    if (s.detectScreenshot !== false) {
      const onScreenshotKey = (e) => {
        let method = null;
        if (e.key === 'PrintScreen' || e.key === 'Snapshot') method = 'PrintScreen';
        else if (e.metaKey && e.shiftKey && e.key === 'S') method = 'Win+Shift+S';
        else if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) method = `Cmd+Shift+${e.key}`;

        if (method) {
          e.preventDefault();
          report('SCREENSHOT', { method });
        }
      };
      // keyup for PrintScreen (some browsers only fire keyup for it)
      document.addEventListener('keyup', onScreenshotKey, true);
      document.addEventListener('keydown', onScreenshotKey, true);
      cleanups.push(() => {
        document.removeEventListener('keyup', onScreenshotKey, true);
        document.removeEventListener('keydown', onScreenshotKey, true);
      });
      console.log('[AntiCheat] ✓ Screenshot detection active');
    }

    // ═══════════════════════════════════════════════════════════════
    // 8. IDLE TIMEOUT — no mouse/keyboard/touch for N seconds
    // ═══════════════════════════════════════════════════════════════
    if (s.detectIdle !== false) {
      const timeout = (s.idleTimeoutSec || 120) * 1000;
      const markActive = () => { lastActivityRef.current = Date.now(); };
      const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
      events.forEach(ev => document.addEventListener(ev, markActive, { passive: true }));

      const idleInterval = setInterval(() => {
        const idle = Date.now() - lastActivityRef.current;
        if (idle >= timeout) {
          report('IDLE_TIMEOUT', { idleSec: Math.floor(idle / 1000) });
          lastActivityRef.current = Date.now(); // reset to avoid spamming
        }
      }, 10000);

      cleanups.push(() => {
        events.forEach(ev => document.removeEventListener(ev, markActive));
        clearInterval(idleInterval);
      });
      console.log(`[AntiCheat] ✓ Idle detection active (${s.idleTimeoutSec || 120}s)`);
    }

    console.log(`[AntiCheat] All ${cleanups.length} monitors installed`);
    cleanupFnsRef.current = cleanups;

    // Cleanup on disable or unmount
    return () => {
      console.log('[AntiCheat] Tearing down monitors');
      cleanups.forEach(fn => { try { fn(); } catch(e){} });
      cleanupFnsRef.current = [];
      setupDoneRef.current = false;
    };
  }, [enabled]); // ONLY re-run when enabled changes — everything else is via refs
}

// ─── Anticheat Status Indicator Component ────────────────────────────────
export function AnticheatIndicator({ enabled, violationCount, flagged }) {
  if (!enabled) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: 'monospace',
        background: flagged ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.12)',
        border: flagged ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(34,197,94,0.3)',
        color: flagged ? '#f87171' : '#4ade80',
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: flagged ? '#ef4444' : '#22c55e',
          animation: 'anticheat-pulse 2s infinite',
        }}
      />
      <span>{flagged ? '\u26a0 FLAGGED' : '\ud83d\udee1 PROCTORED'}</span>
      {violationCount > 0 && (
        <span style={{
          background: flagged ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)',
          padding: '1px 5px',
          borderRadius: 4,
          fontSize: 10,
        }}>
          {violationCount}
        </span>
      )}
      <style>{`
        @keyframes anticheat-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

export default { useAnticheat, AnticheatIndicator };
