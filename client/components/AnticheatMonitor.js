/**
 * AnticheatMonitor v4.0 — Client-Side Proctoring Engine
 * 
 * Working detections:
 *  1. Tab/window switch (visibilitychange)
 *  2. Copy/Paste (document events, capture phase)
 *  3. DevTools (Mac+Win keyboard combos, size heuristic, getter probe)
 *  4. Right-click block (contextmenu)
 *  5. Focus loss (window blur)
 *  6. Fullscreen exit (fullscreenchange)
 *  7. Screenshot keys (PrintScreen, Cmd+Shift+3/4/5, Win+Shift+S)
 *  8. Idle timeout (configurable timer with 30s visual warning)
 *  9. Window resize (significant size changes >200px)
 * 10. Multi-monitor (screen.isExtended, window positioning)
 * 11. Browser extension injection (DOM scan)
 * 12. Clipboard API intercept (navigator.clipboard.readText/writeText)
 * 13. Heartbeat keepalive (proves tab is still active, server-verified)
 * 
 * v4.0: +clipboard API, +idle warning, +heartbeat, +debugger timing probe
 * made with <3 by Namish
 */

import { useEffect, useRef, useState } from 'react';

export function useAnticheat(socketRef, enabled, settings, onViolation) {
  const settingsRef = useRef(settings || {});
  const enabledRef = useRef(enabled);
  const onViolationRef = useRef(onViolation);
  const socketRefRef = useRef(socketRef);
  const lastActivityRef = useRef(Date.now());
  const cleanupFnsRef = useRef([]);
  const windowSizeRef = useRef(typeof window !== 'undefined' ? { w: window.innerWidth, h: window.innerHeight } : null);
  const rateLimitMapRef = useRef({});
  const devtoolsWasOpenRef = useRef(false);
  const idleWarningRef = useRef(null); // expose for indicator

  useEffect(() => { settingsRef.current = settings || {}; }, [settings]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { onViolationRef.current = onViolation; }, [onViolation]);
  useEffect(() => { socketRefRef.current = socketRef; }, [socketRef]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    cleanupFnsRef.current.forEach(fn => { try { fn(); } catch(e){} });
    cleanupFnsRef.current = [];

    if (!enabled) {
      console.log('[AC] Disabled');
      return;
    }

    console.log('[AC] ENABLED — installing monitors v4.0');
    windowSizeRef.current = { w: window.innerWidth, h: window.innerHeight };
    lastActivityRef.current = Date.now();
    rateLimitMapRef.current = {};

    const cleanups = [];
    const s = settingsRef.current;

    // ─── Stable report function ─────────────────────────────────
    function report(type, meta) {
      if (!enabledRef.current) return;
      const now = Date.now();
      if (rateLimitMapRef.current[type] && now - rateLimitMapRef.current[type] < 5000) return;
      rateLimitMapRef.current[type] = now;

      console.log(`[AC] VIOLATION: ${type}`, meta);

      const sock = socketRefRef.current?.current;
      if (sock?.connected) {
        sock.emit('anticheat:violation', {
          type,
          metadata: {
            ...meta,
            userAgent: navigator.userAgent || '',
            timestamp: now,
            screenRes: `${screen.width}x${screen.height}`,
            windowRes: `${window.innerWidth}x${window.innerHeight}`,
          },
        });
      }
      const cb = onViolationRef.current;
      if (cb) cb(type, meta);
    }

    // ═══════════════════════════════════════════════════════════════
    // 1. TAB/WINDOW SWITCH
    // ═══════════════════════════════════════════════════════════════
    if (s.detectTabSwitch !== false) {
      const h = () => { if (document.hidden) report('TAB_SWITCH', { method: 'visibilitychange' }); };
      document.addEventListener('visibilitychange', h);
      cleanups.push(() => document.removeEventListener('visibilitychange', h));
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. COPY / PASTE
    // ═══════════════════════════════════════════════════════════════
    if (s.blockCopyPaste !== false) {
      const onCopy = () => report('COPY', { sel: (window.getSelection?.()?.toString?.() || '').slice(0, 80) });
      const onPaste = () => report('PASTE', { target: document.activeElement?.tagName || '?' });
      document.addEventListener('copy', onCopy, true);
      document.addEventListener('paste', onPaste, true);
      cleanups.push(() => { document.removeEventListener('copy', onCopy, true); document.removeEventListener('paste', onPaste, true); });
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. DEVTOOLS — Mac-compatible (Cmd+Opt+I/J/C) + size + getter
    // ═══════════════════════════════════════════════════════════════
    if (s.blockDevTools !== false) {
      // 3a. Keyboard shortcuts — Mac uses Cmd+Option (metaKey+altKey)
      const onKey = (e) => {
        let hit = null;

        if (e.key === 'F12') hit = 'F12';

        // Mac: Cmd+Opt+I/J/C
        if (e.metaKey && e.altKey) {
          const k = e.key.toLowerCase();
          if (k === 'i') hit = 'Cmd+Opt+I';
          else if (k === 'j') hit = 'Cmd+Opt+J';
          else if (k === 'c') hit = 'Cmd+Opt+C';
        }

        // Windows/Linux: Ctrl+Shift+I/J/C
        if (e.ctrlKey && e.shiftKey) {
          const k = e.key.toLowerCase();
          if (k === 'i') hit = 'Ctrl+Shift+I';
          else if (k === 'j') hit = 'Ctrl+Shift+J';
          else if (k === 'c') hit = 'Ctrl+Shift+C';
        }

        // View Source
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'u') hit = 'Ctrl/Cmd+U';

        if (hit) {
          e.preventDefault();
          e.stopPropagation();
          report('DEVTOOLS', { method: hit });
        }
      };
      document.addEventListener('keydown', onKey, true);
      cleanups.push(() => document.removeEventListener('keydown', onKey, true));

      // 3b. Size heuristic — docked devtools increases outer-inner gap
      devtoolsWasOpenRef.current = false;
      const sizeCheck = setInterval(() => {
        const dw = window.outerWidth - window.innerWidth;
        const dh = window.outerHeight - window.innerHeight;
        const open = dw > 160 || dh > 160;
        if (open && !devtoolsWasOpenRef.current) {
          devtoolsWasOpenRef.current = true;
          report('DEVTOOLS', { method: 'size_heuristic', dw, dh });
        } else if (!open) {
          devtoolsWasOpenRef.current = false;
        }
      }, 1500);
      cleanups.push(() => clearInterval(sizeCheck));

      // 3c. Console getter probe — devtools renders objects and triggers getter
      const debuggerCheck = setInterval(() => {
        const el = new Image();
        Object.defineProperty(el, 'id', {
          get: function() {
            report('DEVTOOLS', { method: 'getter_probe' });
          }
        });
        console.debug('%c', el);
      }, 4000);
      cleanups.push(() => clearInterval(debuggerCheck));

      // 3d. Debugger timing probe — actual debugger statement timing
      const timingCheck = setInterval(() => {
        const t1 = performance.now();
        // eslint-disable-next-line no-debugger
        debugger;
        const elapsed = performance.now() - t1;
        // If devtools is open with debugger panel, this takes >100ms
        if (elapsed > 100) {
          report('DEVTOOLS', { method: 'debugger_timing', elapsed: Math.round(elapsed) });
        }
      }, 6000);
      cleanups.push(() => clearInterval(timingCheck));
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. RIGHT-CLICK
    // ═══════════════════════════════════════════════════════════════
    if (s.blockRightClick !== false) {
      const h = (e) => { e.preventDefault(); report('RIGHT_CLICK', { tag: e.target?.tagName }); return false; };
      document.addEventListener('contextmenu', h, true);
      cleanups.push(() => document.removeEventListener('contextmenu', h, true));
    }

    // ═══════════════════════════════════════════════════════════════
    // 5. FOCUS LOSS
    // ═══════════════════════════════════════════════════════════════
    if (s.detectFocusLoss !== false) {
      const h = () => { if (!document.hidden) report('FOCUS_LOSS', {}); };
      window.addEventListener('blur', h);
      cleanups.push(() => window.removeEventListener('blur', h));
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. FULLSCREEN EXIT
    // ═══════════════════════════════════════════════════════════════
    if (s.forceFullscreen !== false) {
      const h = () => { if (!document.fullscreenElement && !document.webkitFullscreenElement) report('FULLSCREEN_EXIT', {}); };
      document.addEventListener('fullscreenchange', h);
      document.addEventListener('webkitfullscreenchange', h);
      cleanups.push(() => { document.removeEventListener('fullscreenchange', h); document.removeEventListener('webkitfullscreenchange', h); });
    }

    // ═══════════════════════════════════════════════════════════════
    // 7. SCREENSHOT KEYS
    // ═══════════════════════════════════════════════════════════════
    if (s.detectScreenshot !== false) {
      const h = (e) => {
        let m = null;
        if (e.key === 'PrintScreen' || e.key === 'Snapshot') m = 'PrintScreen';
        else if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 's') m = 'Win+Shift+S';
        else if (e.metaKey && e.shiftKey && ['3','4','5'].includes(e.key)) m = `Cmd+Shift+${e.key}`;
        if (m) { e.preventDefault(); report('SCREENSHOT', { method: m }); }
      };
      document.addEventListener('keyup', h, true);
      document.addEventListener('keydown', h, true);
      cleanups.push(() => { document.removeEventListener('keyup', h, true); document.removeEventListener('keydown', h, true); });
    }

    // ═══════════════════════════════════════════════════════════════
    // 8. IDLE TIMEOUT — with 30s visual warning before violation
    // ═══════════════════════════════════════════════════════════════
    if (s.detectIdle !== false) {
      const timeout = (s.idleTimeoutSec || 120) * 1000;
      const warningBefore = 30000; // 30s warning before timeout
      const mark = () => {
        lastActivityRef.current = Date.now();
        // Clear warning when user becomes active
        if (idleWarningRef.current) {
          idleWarningRef.current = null;
          // Dispatch custom event so indicator can update
          window.dispatchEvent(new CustomEvent('ac-idle-warning', { detail: { active: false } }));
        }
      };
      const evts = ['mousemove','keydown','mousedown','touchstart','scroll'];
      evts.forEach(ev => document.addEventListener(ev, mark, { passive: true }));
      const timer = setInterval(() => {
        const idle = Date.now() - lastActivityRef.current;
        const timeLeft = timeout - idle;
        if (timeLeft <= warningBefore && timeLeft > 0 && !idleWarningRef.current) {
          // Show warning
          idleWarningRef.current = Math.ceil(timeLeft / 1000);
          window.dispatchEvent(new CustomEvent('ac-idle-warning', { detail: { active: true, seconds: Math.ceil(timeLeft / 1000) } }));
        }
        if (idleWarningRef.current && timeLeft > 0) {
          idleWarningRef.current = Math.ceil(timeLeft / 1000);
          window.dispatchEvent(new CustomEvent('ac-idle-warning', { detail: { active: true, seconds: Math.ceil(timeLeft / 1000) } }));
        }
        if (idle >= timeout) {
          report('IDLE_TIMEOUT', { idleSec: Math.floor(idle / 1000) });
          lastActivityRef.current = Date.now();
          idleWarningRef.current = null;
          window.dispatchEvent(new CustomEvent('ac-idle-warning', { detail: { active: false } }));
        }
      }, 1000); // Check every second for smooth countdown
      cleanups.push(() => { evts.forEach(ev => document.removeEventListener(ev, mark)); clearInterval(timer); });
    }

    // ═══════════════════════════════════════════════════════════════
    // 9. WINDOW RESIZE — significant changes (>200px) suggest split-screen
    // ═══════════════════════════════════════════════════════════════
    if (s.detectResize !== false) {
      const h = () => {
        const nw = window.innerWidth, nh = window.innerHeight;
        const prev = windowSizeRef.current;
        if (prev) {
          const dw = Math.abs(nw - prev.w), dh = Math.abs(nh - prev.h);
          if (dw > 200 || dh > 200) {
            report('WINDOW_RESIZE', { from: `${prev.w}x${prev.h}`, to: `${nw}x${nh}`, dw, dh });
          }
        }
        windowSizeRef.current = { w: nw, h: nh };
      };
      window.addEventListener('resize', h);
      cleanups.push(() => window.removeEventListener('resize', h));
    }

    // ═══════════════════════════════════════════════════════════════
    // 10. MULTI-MONITOR — screen.isExtended API + window position
    // ═══════════════════════════════════════════════════════════════
    if (s.detectMultiMonitor !== false) {
      const check = () => {
        try {
          if (window.screen?.isExtended) {
            report('MULTI_MONITOR', { method: 'isExtended', screens: 'multiple' });
            return;
          }
          if (window.screenX < -10 || window.screenX > screen.width + 10 ||
              window.screenY < -10 || window.screenY > screen.height + 10) {
            report('MULTI_MONITOR', { method: 'position', x: window.screenX, y: window.screenY, sw: screen.width, sh: screen.height });
          }
        } catch(e) {}
      };
      check();
      const timer = setInterval(check, 15000);
      cleanups.push(() => clearInterval(timer));
      try {
        if (window.screen?.addEventListener) {
          const h = () => check();
          window.screen.addEventListener('change', h);
          cleanups.push(() => window.screen.removeEventListener('change', h));
        }
      } catch(e) {}
    }

    // ═══════════════════════════════════════════════════════════════
    // 11. BROWSER EXTENSION INJECTION — DOM scan
    // ═══════════════════════════════════════════════════════════════
    if (s.detectExtensions !== false) {
      const scan = () => {
        const scripts = document.querySelectorAll('script[src]');
        for (const el of scripts) {
          const src = el.getAttribute('src') || '';
          if (src.startsWith('chrome-extension://') || src.startsWith('moz-extension://') || src.startsWith('safari-web-extension://')) {
            report('EXTENSION_INJECT', { type: 'script', url: src.slice(0, 80) });
            return;
          }
        }
        const links = document.querySelectorAll('link[href]');
        for (const el of links) {
          const href = el.getAttribute('href') || '';
          if (href.startsWith('chrome-extension://') || href.startsWith('moz-extension://') || href.startsWith('safari-web-extension://')) {
            report('EXTENSION_INJECT', { type: 'stylesheet', url: href.slice(0, 80) });
            return;
          }
        }
        const body = document.body;
        if (body) {
          const attrs = body.getAttributeNames();
          for (const name of attrs) {
            if (name.includes('grammarly') || name.includes('lastpass') || name.includes('bitwarden') ||
                name.includes('honey') || name.includes('ublock') || name.includes('adblock')) {
              report('EXTENSION_INJECT', { type: 'attribute', attr: name });
              return;
            }
          }
          for (const child of body.children) {
            if (child.shadowRoot && !child.id?.startsWith('__next')) {
              report('EXTENSION_INJECT', { type: 'shadow_root', tag: child.tagName, id: child.id || 'none' });
              return;
            }
          }
        }
      };
      scan();
      const timer = setInterval(scan, 20000);
      cleanups.push(() => clearInterval(timer));
    }

    // ═══════════════════════════════════════════════════════════════
    // 12. CLIPBOARD API INTERCEPT — detect navigator.clipboard usage
    // ═══════════════════════════════════════════════════════════════
    if (s.blockCopyPaste !== false && navigator.clipboard) {
      // Wrap navigator.clipboard.readText and writeText
      const origRead = navigator.clipboard.readText?.bind(navigator.clipboard);
      const origWrite = navigator.clipboard.writeText?.bind(navigator.clipboard);

      if (origRead) {
        navigator.clipboard.readText = function() {
          report('CLIPBOARD_API', { method: 'readText' });
          return origRead();
        };
      }
      if (origWrite) {
        navigator.clipboard.writeText = function(text) {
          report('CLIPBOARD_API', { method: 'writeText', len: (text || '').length });
          return origWrite(text);
        };
      }

      cleanups.push(() => {
        if (origRead) navigator.clipboard.readText = origRead;
        if (origWrite) navigator.clipboard.writeText = origWrite;
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 13. HEARTBEAT — proves this tab is still active (server-verified)
    // ═══════════════════════════════════════════════════════════════
    {
      const heartbeat = setInterval(() => {
        const sock = socketRefRef.current?.current;
        if (sock?.connected) {
          sock.emit('anticheat:heartbeat', {
            ts: Date.now(),
            focused: document.hasFocus(),
            visible: !document.hidden,
            fullscreen: !!document.fullscreenElement,
          });
        }
      }, 10000); // every 10s
      cleanups.push(() => clearInterval(heartbeat));
    }

    console.log(`[AC] ${cleanups.length} monitors installed (v4.0)`);
    cleanupFnsRef.current = cleanups;

    return () => {
      cleanups.forEach(fn => { try { fn(); } catch(e){} });
      cleanupFnsRef.current = [];
    };
  }, [enabled]);
}

// ─── AntiCheat Indicator — tiny dot + idle warning overlay ───────────────
export function AnticheatIndicator({ enabled }) {
  const [idleWarning, setIdleWarning] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    const handler = (e) => {
      if (e.detail?.active) {
        setIdleWarning(e.detail.seconds);
      } else {
        setIdleWarning(null);
      }
    };
    window.addEventListener('ac-idle-warning', handler);
    return () => window.removeEventListener('ac-idle-warning', handler);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      {/* Tiny green dot */}
      <div
        title="AntiCheat active"
        style={{
          position: 'fixed',
          bottom: 6,
          left: 6,
          zIndex: 10000,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: idleWarning ? '#ffb347' : '#22c55e',
          boxShadow: idleWarning ? '0 0 6px #ffb34788' : '0 0 4px #22c55e88',
          animation: 'ac-dot 3s infinite',
          pointerEvents: 'none',
          opacity: 0.7,
        }}
      >
        <style>{`@keyframes ac-dot { 0%,100%{opacity:0.7} 50%{opacity:0.3} }`}</style>
      </div>
      {/* Idle warning overlay */}
      {idleWarning && idleWarning <= 30 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10001, background: '#1a1b1e', border: '1px solid #ffb34740',
          borderRadius: 12, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 24px #00000060', fontFamily: 'ui-monospace, monospace',
          animation: 'ac-warn-in 0.3s ease',
        }}>
          <style>{`@keyframes ac-warn-in { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffb347', animation: 'ac-dot 1s infinite' }} />
          <span style={{ color: '#ffb347', fontSize: 11 }}>
            Idle warning — move your mouse! <strong>{idleWarning}s</strong> until violation
          </span>
        </div>
      )}
    </>
  );
}

export default { useAnticheat, AnticheatIndicator };
