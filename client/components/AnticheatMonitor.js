/**
 * AnticheatMonitor v1.0 — Client-Side Proctoring Engine
 * 
 * Detects 13 types of violations and reports to server via Socket.IO:
 *  1. Tab/window switch (visibilitychange)
 *  2. Copy (Ctrl+C / context menu)
 *  3. Paste (Ctrl+V / context menu)
 *  4. Fullscreen exit
 *  5. DevTools detection (resize heuristic + shortcut keys)
 *  6. Right-click (context menu block)
 *  7. Multiple monitors detection
 *  8. Suspicious window resize
 *  9. Focus loss (window blur)
 * 10. Clipboard API access
 * 11. Screenshot attempt (PrintScreen)
 * 12. Browser extension injection
 * 13. Idle timeout
 * 
 * Controlled by server — only activates when anticheat:state-change
 * event with enabled=true is received. All settings respect server config.
 * 
 * made with <3 by Namish
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// ─── Anticheat Hook ──────────────────────────────────────────────────────
export function useAnticheat(socketRef, enabled, settings, onViolation) {
  const settingsRef = useRef(settings || {});
  const enabledRef = useRef(enabled);
  const lastActivityRef = useRef(Date.now());
  const idleTimerRef = useRef(null);
  const devtoolsCheckRef = useRef(null);
  const cleanupFnsRef = useRef([]);
  const windowSizeRef = useRef({ w: typeof window !== 'undefined' ? window.innerWidth : 1920, h: typeof window !== 'undefined' ? window.innerHeight : 1080 });
  const violationCountRef = useRef({});

  // Update refs when props change
  useEffect(() => {
    settingsRef.current = settings || {};
    enabledRef.current = enabled;
  }, [settings, enabled]);

  // Rate limiter — max 1 report per type per 4 seconds (client side)
  const canReport = useCallback((type) => {
    const now = Date.now();
    const last = violationCountRef.current[type] || 0;
    if (now - last < 4000) return false;
    violationCountRef.current[type] = now;
    return true;
  }, []);

  // Send violation to server
  const reportViolation = useCallback((type, metadata = {}) => {
    if (!enabledRef.current) return;
    if (!canReport(type)) return;

    const socket = socketRef?.current;
    if (socket?.connected) {
      socket.emit('anticheat:violation', {
        type,
        metadata: {
          ...metadata,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          timestamp: Date.now(),
          screenRes: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : 'unknown',
          windowRes: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'unknown',
        },
      });
    }

    // Notify parent component
    if (onViolation) {
      onViolation(type, metadata);
    }
  }, [socketRef, canReport, onViolation]);

  useEffect(() => {
    if (!enabled) {
      // Cleanup everything if disabled
      cleanupFnsRef.current.forEach(fn => fn());
      cleanupFnsRef.current = [];
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
      if (devtoolsCheckRef.current) clearInterval(devtoolsCheckRef.current);
      return;
    }

    // SSR guard — all detections require browser APIs
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const s = settingsRef.current;
    const cleanups = [];

    // ─── 1. Tab/Window Switch Detection ─────────────────────────
    if (s.detectTabSwitch !== false) {
      const handleVisibilityChange = () => {
        if (document.hidden) {
          reportViolation('TAB_SWITCH', { hidden: true });
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      cleanups.push(() => document.removeEventListener('visibilitychange', handleVisibilityChange));
    }

    // ─── 2 & 3. Copy / Paste Detection ──────────────────────────
    if (s.blockCopyPaste !== false) {
      const handleCopy = (e) => {
        reportViolation('COPY', { selection: window.getSelection()?.toString()?.slice(0, 100) || '' });
        // Optionally block the copy
        // e.preventDefault();
      };
      const handlePaste = (e) => {
        reportViolation('PASTE', {});
        // Optionally block the paste
        // e.preventDefault();
      };
      document.addEventListener('copy', handleCopy, true);
      document.addEventListener('paste', handlePaste, true);
      cleanups.push(() => {
        document.removeEventListener('copy', handleCopy, true);
        document.removeEventListener('paste', handlePaste, true);
      });
    }

    // ─── 4. Fullscreen Exit Detection ───────────────────────────
    if (s.forceFullscreen !== false) {
      const handleFullscreenChange = () => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
          reportViolation('FULLSCREEN_EXIT', {});
        }
      };
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
      cleanups.push(() => {
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      });
    }

    // ─── 5. DevTools Detection ──────────────────────────────────
    if (s.blockDevTools !== false) {
      // Method 1: Key shortcuts
      const handleDevToolsKeys = (e) => {
        // F12
        if (e.key === 'F12') {
          e.preventDefault();
          reportViolation('DEVTOOLS', { method: 'F12' });
          return;
        }
        // Ctrl+Shift+I / Cmd+Opt+I (Inspector)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
          e.preventDefault();
          reportViolation('DEVTOOLS', { method: 'Ctrl+Shift+I' });
          return;
        }
        // Ctrl+Shift+J / Cmd+Opt+J (Console)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'J') {
          e.preventDefault();
          reportViolation('DEVTOOLS', { method: 'Ctrl+Shift+J' });
          return;
        }
        // Ctrl+Shift+C (Element picker)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
          e.preventDefault();
          reportViolation('DEVTOOLS', { method: 'Ctrl+Shift+C' });
          return;
        }
        // Ctrl+U (View Source)
        if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
          e.preventDefault();
          reportViolation('DEVTOOLS', { method: 'Ctrl+U' });
          return;
        }
      };
      document.addEventListener('keydown', handleDevToolsKeys, true);
      cleanups.push(() => document.removeEventListener('keydown', handleDevToolsKeys, true));

      // Method 2: Window size heuristic (devtools panel changes outer-inner diff)
      let devtoolsOpen = false;
      devtoolsCheckRef.current = setInterval(() => {
        const widthThreshold = window.outerWidth - window.innerWidth > 160;
        const heightThreshold = window.outerHeight - window.innerHeight > 160;
        const nowOpen = widthThreshold || heightThreshold;
        if (nowOpen && !devtoolsOpen) {
          devtoolsOpen = true;
          reportViolation('DEVTOOLS', { method: 'resize_heuristic', outer: `${window.outerWidth}x${window.outerHeight}`, inner: `${window.innerWidth}x${window.innerHeight}` });
        } else if (!nowOpen) {
          devtoolsOpen = false;
        }
      }, 2000);
      cleanups.push(() => {
        if (devtoolsCheckRef.current) clearInterval(devtoolsCheckRef.current);
      });
    }

    // ─── 6. Right-Click Detection ───────────────────────────────
    if (s.blockRightClick !== false) {
      const handleContextMenu = (e) => {
        e.preventDefault();
        reportViolation('RIGHT_CLICK', { target: e.target?.tagName || 'unknown' });
        return false;
      };
      document.addEventListener('contextmenu', handleContextMenu, true);
      cleanups.push(() => document.removeEventListener('contextmenu', handleContextMenu, true));
    }

    // ─── 7. Multiple Monitor Detection ──────────────────────────
    if (s.detectMultiMonitor !== false) {
      // Check screen count API (Chrome 100+)
      const checkMultiMonitor = async () => {
        try {
          if (window.screen?.isExtended) {
            reportViolation('MULTI_MONITOR', { isExtended: true, screens: 'multiple' });
          }
          // Also check if window.screenX is outside primary screen bounds
          if (window.screenX < 0 || window.screenX > screen.width) {
            reportViolation('MULTI_MONITOR', { screenX: window.screenX, screenWidth: screen.width });
          }
        } catch (e) {}
      };

      // Check on screen change events
      if (window.screen?.addEventListener) {
        const handleScreenChange = () => checkMultiMonitor();
        window.screen.addEventListener('change', handleScreenChange);
        cleanups.push(() => window.screen.removeEventListener('change', handleScreenChange));
      }

      // Initial check
      checkMultiMonitor();

      // Periodic check
      const multiMonitorInterval = setInterval(checkMultiMonitor, 15000);
      cleanups.push(() => clearInterval(multiMonitorInterval));
    }

    // ─── 8. Suspicious Window Resize ────────────────────────────
    if (s.detectResize !== false) {
      const handleResize = () => {
        const newW = window.innerWidth;
        const newH = window.innerHeight;
        const dW = Math.abs(newW - windowSizeRef.current.w);
        const dH = Math.abs(newH - windowSizeRef.current.h);
        // Only flag significant resizes (> 200px change)
        if (dW > 200 || dH > 200) {
          reportViolation('WINDOW_RESIZE', {
            from: `${windowSizeRef.current.w}x${windowSizeRef.current.h}`,
            to: `${newW}x${newH}`,
            delta: `${dW}x${dH}`,
          });
        }
        windowSizeRef.current = { w: newW, h: newH };
      };
      window.addEventListener('resize', handleResize);
      cleanups.push(() => window.removeEventListener('resize', handleResize));
    }

    // ─── 9. Focus Loss Detection ────────────────────────────────
    if (s.detectFocusLoss !== false) {
      const handleBlur = () => {
        reportViolation('FOCUS_LOSS', { activeElement: document.activeElement?.tagName || 'none' });
      };
      window.addEventListener('blur', handleBlur);
      cleanups.push(() => window.removeEventListener('blur', handleBlur));
    }

    // ─── 10. Clipboard API Access ───────────────────────────────
    if (s.blockCopyPaste !== false) {
      // Intercept clipboard read/write API
      const origRead = navigator.clipboard?.readText;
      const origWrite = navigator.clipboard?.writeText;
      if (navigator.clipboard) {
        try {
          navigator.clipboard.readText = async function() {
            reportViolation('CLIPBOARD_API', { action: 'read' });
            return origRead ? origRead.call(navigator.clipboard) : '';
          };
          navigator.clipboard.writeText = async function(text) {
            reportViolation('CLIPBOARD_API', { action: 'write', length: text?.length || 0 });
            return origWrite ? origWrite.call(navigator.clipboard, text) : undefined;
          };
          cleanups.push(() => {
            if (origRead) navigator.clipboard.readText = origRead;
            if (origWrite) navigator.clipboard.writeText = origWrite;
          });
        } catch (e) {
          // Some browsers won't allow reassignment
        }
      }
    }

    // ─── 11. Screenshot Detection ───────────────────────────────
    if (s.detectScreenshot !== false) {
      const handleScreenshot = (e) => {
        if (e.key === 'PrintScreen' || e.key === 'Snapshot') {
          e.preventDefault();
          reportViolation('SCREENSHOT', { method: 'PrintScreen' });
        }
        // Windows Snipping Tool: Win+Shift+S
        if (e.metaKey && e.shiftKey && e.key === 'S') {
          e.preventDefault();
          reportViolation('SCREENSHOT', { method: 'Win+Shift+S' });
        }
        // Mac: Cmd+Shift+3 or Cmd+Shift+4
        if (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5')) {
          e.preventDefault();
          reportViolation('SCREENSHOT', { method: `Cmd+Shift+${e.key}` });
        }
      };
      document.addEventListener('keyup', handleScreenshot, true);
      document.addEventListener('keydown', handleScreenshot, true);
      cleanups.push(() => {
        document.removeEventListener('keyup', handleScreenshot, true);
        document.removeEventListener('keydown', handleScreenshot, true);
      });
    }

    // ─── 12. Browser Extension Detection ────────────────────────
    if (s.detectExtensions !== false) {
      const checkExtensions = () => {
        // Check for injected DOM elements by extensions
        const allScripts = document.querySelectorAll('script[src]');
        for (const script of allScripts) {
          const src = script.getAttribute('src') || '';
          if (src.startsWith('chrome-extension://') || src.startsWith('moz-extension://') || src.startsWith('ms-browser-extension://')) {
            reportViolation('EXTENSION_INJECT', { extensionUrl: src.slice(0, 80) });
            break;
          }
        }
        // Check for injected style elements
        const allStyles = document.querySelectorAll('link[href]');
        for (const style of allStyles) {
          const href = style.getAttribute('href') || '';
          if (href.startsWith('chrome-extension://') || href.startsWith('moz-extension://')) {
            reportViolation('EXTENSION_INJECT', { extensionUrl: href.slice(0, 80) });
            break;
          }
        }
        // Check for mutation observer patterns (content scripts often add data attributes)
        const bodyAttrs = document.body?.attributes;
        if (bodyAttrs) {
          for (let i = 0; i < bodyAttrs.length; i++) {
            const name = bodyAttrs[i].name;
            if (name.startsWith('data-') && !['data-theme', 'data-page', 'data-reactroot'].includes(name)) {
              // Could be extension-injected, but let's be careful about false positives
              // Only report if clearly extension-like
              if (name.includes('extension') || name.includes('grammarly') || name.includes('lastpass') || name.includes('honey')) {
                reportViolation('EXTENSION_INJECT', { attribute: name });
                break;
              }
            }
          }
        }
      };

      // Check periodically
      const extCheckInterval = setInterval(checkExtensions, 20000);
      checkExtensions(); // Initial check
      cleanups.push(() => clearInterval(extCheckInterval));
    }

    // ─── 13. Idle Timeout Detection ─────────────────────────────
    if (s.detectIdle !== false) {
      const idleTimeout = (s.idleTimeoutSec || 120) * 1000;

      // Track activity
      const markActive = () => {
        lastActivityRef.current = Date.now();
      };
      document.addEventListener('mousemove', markActive, { passive: true });
      document.addEventListener('keydown', markActive, { passive: true });
      document.addEventListener('mousedown', markActive, { passive: true });
      document.addEventListener('touchstart', markActive, { passive: true });
      document.addEventListener('scroll', markActive, { passive: true });

      idleTimerRef.current = setInterval(() => {
        const idleDuration = Date.now() - lastActivityRef.current;
        if (idleDuration >= idleTimeout) {
          reportViolation('IDLE_TIMEOUT', { idleSec: Math.floor(idleDuration / 1000) });
          // Reset to avoid spamming
          lastActivityRef.current = Date.now();
        }
      }, 10000);

      cleanups.push(() => {
        document.removeEventListener('mousemove', markActive);
        document.removeEventListener('keydown', markActive);
        document.removeEventListener('mousedown', markActive);
        document.removeEventListener('touchstart', markActive);
        document.removeEventListener('scroll', markActive);
        if (idleTimerRef.current) clearInterval(idleTimerRef.current);
      });
    }

    // ─── Additional: Prevent text selection during anticheat ────
    // CSS-based selection block (optional, controlled by setting)
    if (s.blockCopyPaste !== false) {
      const style = document.createElement('style');
      style.id = 'anticheat-nocopy-style';
      style.textContent = `
        /* Allow selection in Monaco editor but monitor it */
        .anticheat-active { user-select: auto !important; -webkit-user-select: auto !important; }
      `;
      document.head.appendChild(style);
      document.body.classList.add('anticheat-active');
      cleanups.push(() => {
        document.body.classList.remove('anticheat-active');
        const el = document.getElementById('anticheat-nocopy-style');
        if (el) el.remove();
      });
    }

    cleanupFnsRef.current = cleanups;

    return () => {
      cleanups.forEach(fn => fn());
      cleanupFnsRef.current = [];
    };
  }, [enabled, reportViolation]);
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
      <span>{flagged ? '⚠ FLAGGED' : '🛡 PROCTORED'}</span>
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
