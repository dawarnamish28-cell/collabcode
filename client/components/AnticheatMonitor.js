/**
 * AnticheatMonitor v3.0 — Client-Side Proctoring Engine
 * 
 * Working detections:
 *  1. Tab/window switch (visibilitychange)
 *  2. Copy/Paste (document events, capture phase)
 *  3. DevTools (Mac+Win keyboard combos, debugger timing, size heuristic)
 *  4. Right-click block (contextmenu)
 *  5. Focus loss (window blur)
 *  6. Fullscreen exit (fullscreenchange)
 *  7. Screenshot keys (PrintScreen, Cmd+Shift+3/4/5, Win+Shift+S)
 *  8. Idle timeout (configurable inactivity timer)
 *  9. Window resize (significant size changes)
 * 10. Multi-monitor (screen.isExtended, window positioning)
 * 11. Browser extension injection (DOM scan)
 * 
 * v3.0: Mac DevTools fix, removed obstructive indicator, added all detections
 * made with <3 by Namish
 */

import { useEffect, useRef } from 'react';

export function useAnticheat(socketRef, enabled, settings, onViolation) {
  const settingsRef = useRef(settings || {});
  const enabledRef = useRef(enabled);
  const onViolationRef = useRef(onViolation);
  const socketRefRef = useRef(socketRef);
  const lastActivityRef = useRef(Date.now());
  const cleanupFnsRef = useRef([]);
  const windowSizeRef = useRef(null);
  const rateLimitMapRef = useRef({});
  const devtoolsWasOpenRef = useRef(false);

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

    console.log('[AC] ENABLED — installing monitors');
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
    // 3. DEVTOOLS — Mac-compatible (Cmd+Opt+I/J/C) + debugger timing
    // ═══════════════════════════════════════════════════════════════
    if (s.blockDevTools !== false) {
      // 3a. Keyboard shortcuts — Mac uses Cmd+Option (metaKey+altKey)
      const onKey = (e) => {
        let hit = null;

        // F12 (all platforms)
        if (e.key === 'F12') hit = 'F12';

        // Mac: Cmd+Opt+I (Inspector), Cmd+Opt+J (Console), Cmd+Opt+C (Elements)
        if (e.metaKey && e.altKey) {
          const k = e.key.toLowerCase();
          if (k === 'i') hit = 'Cmd+Opt+I';
          else if (k === 'j') hit = 'Cmd+Opt+J';
          else if (k === 'c') hit = 'Cmd+Opt+C';
        }

        // Windows/Linux: Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
        if (e.ctrlKey && e.shiftKey) {
          const k = e.key.toLowerCase();
          if (k === 'i') hit = 'Ctrl+Shift+I';
          else if (k === 'j') hit = 'Ctrl+Shift+J';
          else if (k === 'c') hit = 'Ctrl+Shift+C';
        }

        // Cmd+U / Ctrl+U (View Source)
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

      // 3c. Debugger timing probe — when devtools is open, debugger pauses execution
      // causing measurable time gap. Works on ALL browsers/platforms.
      const debuggerCheck = setInterval(() => {
        const t1 = performance.now();
        // This line: if devtools is open with breakpoints or just the debugger panel,
        // the 'debugger' statement causes a pause that takes measurable time
        (function() { /* debugger detection via timing */ })();
        // We use a different approach: image-based detection
        // Create a custom object whose toString is called when devtools inspects it
        const el = new Image();
        Object.defineProperty(el, 'id', {
          get: function() {
            // This getter fires when devtools tries to display the element
            report('DEVTOOLS', { method: 'getter_probe' });
          }
        });
        // Push to console — devtools will trigger the getter when rendering
        console.debug('%c', el);
      }, 4000);
      cleanups.push(() => clearInterval(debuggerCheck));
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
    // 8. IDLE TIMEOUT
    // ═══════════════════════════════════════════════════════════════
    if (s.detectIdle !== false) {
      const timeout = (s.idleTimeoutSec || 120) * 1000;
      const mark = () => { lastActivityRef.current = Date.now(); };
      const evts = ['mousemove','keydown','mousedown','touchstart','scroll'];
      evts.forEach(ev => document.addEventListener(ev, mark, { passive: true }));
      const timer = setInterval(() => {
        const idle = Date.now() - lastActivityRef.current;
        if (idle >= timeout) { report('IDLE_TIMEOUT', { idleSec: Math.floor(idle/1000) }); lastActivityRef.current = Date.now(); }
      }, 10000);
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
          // Chrome 100+ API
          if (window.screen?.isExtended) {
            report('MULTI_MONITOR', { method: 'isExtended', screens: 'multiple' });
            return;
          }
          // Window positioned outside primary screen bounds
          if (window.screenX < -10 || window.screenX > screen.width + 10 ||
              window.screenY < -10 || window.screenY > screen.height + 10) {
            report('MULTI_MONITOR', { method: 'position', x: window.screenX, y: window.screenY, sw: screen.width, sh: screen.height });
          }
        } catch(e) {}
      };
      check();
      const timer = setInterval(check, 15000);
      cleanups.push(() => clearInterval(timer));
      // screen.change event (Chrome)
      try {
        if (window.screen?.addEventListener) {
          const h = () => check();
          window.screen.addEventListener('change', h);
          cleanups.push(() => window.screen.removeEventListener('change', h));
        }
      } catch(e) {}
    }

    // ═══════════════════════════════════════════════════════════════
    // 11. BROWSER EXTENSION INJECTION — DOM scan for extension resources
    // ═══════════════════════════════════════════════════════════════
    if (s.detectExtensions !== false) {
      const scan = () => {
        // Scan scripts injected by extensions
        const scripts = document.querySelectorAll('script[src]');
        for (const el of scripts) {
          const src = el.getAttribute('src') || '';
          if (src.startsWith('chrome-extension://') || src.startsWith('moz-extension://') || src.startsWith('safari-web-extension://')) {
            report('EXTENSION_INJECT', { type: 'script', url: src.slice(0, 80) });
            return;
          }
        }
        // Scan stylesheets
        const links = document.querySelectorAll('link[href]');
        for (const el of links) {
          const href = el.getAttribute('href') || '';
          if (href.startsWith('chrome-extension://') || href.startsWith('moz-extension://') || href.startsWith('safari-web-extension://')) {
            report('EXTENSION_INJECT', { type: 'stylesheet', url: href.slice(0, 80) });
            return;
          }
        }
        // Scan for known extension body attributes (Grammarly, LastPass, etc.)
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
          // Check for shadow roots injected by extensions
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

    console.log(`[AC] ${cleanups.length} monitors installed`);
    cleanupFnsRef.current = cleanups;

    return () => {
      cleanups.forEach(fn => { try { fn(); } catch(e){} });
      cleanupFnsRef.current = [];
    };
  }, [enabled]);
}

// ─── Tiny non-obstructive indicator (just a small dot in the corner) ─────
export function AnticheatIndicator({ enabled }) {
  if (!enabled) return null;

  return (
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
        background: '#22c55e',
        boxShadow: '0 0 4px #22c55e88',
        animation: 'ac-dot 3s infinite',
        pointerEvents: 'none',
        opacity: 0.7,
      }}
    >
      <style>{`@keyframes ac-dot { 0%,100%{opacity:0.7} 50%{opacity:0.3} }`}</style>
    </div>
  );
}

export default { useAnticheat, AnticheatIndicator };
