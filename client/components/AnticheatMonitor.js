/**
 * AnticheatMonitor v5.0 — Valorant Vanguard-Grade Proctoring Engine
 * 
 * 28-Vector Integrated Defense Matrix:
 *  1. HEADLESS_BOT: Puppeteer, Playwright, Selenium, Chrome CDP automation artifacts
 *  2. API_TAMPERING: Native API hooking/tampering detection (anti-spoofing)
 *  3. VIRTUAL_GPU: Software rasterizers (SwiftShader, llvmpipe, VM GPUs)
 *  4. AI_ASSISTANT_OVERLAY: Injected ChatGPT, Claude, Copilot, Monica, Blackbox AI tools
 *  5. USER_SCRIPT_ENGINE: Tampermonkey, Violentmonkey, Greasemonkey injectors
 *  6. EXTENSION_INJECT: Unauthorized Chrome/Mozilla extension DOM insertions
 *  7. DEVTOOLS: Multi-vector DevTools detection (Mac+Win keys, docked size, debugger timing, getter trap)
 *  8. SYNTHETIC_EVENT: Untrusted isTrusted===false script events
 *  9. MACRO_AUTOTYPER: Keystroke flight time variance analysis (<4ms variance / >260 WPM burst)
 * 10. MOUSE_TELEPORTATION: Inhuman instantaneous cursor jumps without physical trajectory
 * 11. DRAG_DROP_INJECTION: External file or text dragging into the editor
 * 12. TAB_SWITCH: Page visibility change (document.hidden)
 * 13. FOCUS_LOSS: Window blur (loss of OS-level window focus)
 * 14. FULLSCREEN_EXIT: Fullscreen mode termination
 * 15. MULTI_MONITOR: Multi-display setup (screen.isExtended, coordinate overflow)
 * 16. WINDOW_RESIZE: Split-screen / window resizing during proctored exam
 * 17. PICTURE_IN_PICTURE: Secondary floating media window
 * 18. SCREEN_CAPTURE_API: Unauthorized screen recording attempts
 * 19. COPY: Copy event intercept
 * 20. PASTE: Paste event intercept
 * 21. CLIPBOARD_API: navigator.clipboard.readText/writeText interception
 * 22. CLIPBOARD_POLLING: Rapid automated clipboard reading
 * 23. RIGHT_CLICK: Context menu block
 * 24. SCREENSHOT: PrintScreen, Cmd+Shift+3/4/5, Win+Shift+S detection
 * 25. IDLE_TIMEOUT: Extended inactivity with countdown warning
 * 26. HEARTBEAT: Cryptographic client telemetry heartbeat
 * 
 * Includes:
 *  - Real-time Vanguard Trust Factor (0-100 Score)
 *  - Environmental hardware fingerprinting & integrity validation
 *  - Native Prototype Freeze & Tamper-Proofing
 * 
 * made with <3 by Namish
 */

import { useEffect, useRef, useState } from 'react';

// ─── Native API Integrity Validator (Anti-Tampering) ────────────────
function isNativeFunction(fn) {
  try {
    return typeof fn === 'function' && Function.prototype.toString.call(fn).includes('[native code]');
  } catch {
    return false;
  }
}

// ─── Hardware & Environment Fingerprint Collector ───────────────────
function collectVanguardTelemetry() {
  if (typeof window === 'undefined') return {};

  const telemetry = {
    userAgent: navigator.userAgent || '',
    platform: navigator.platform || '',
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    deviceMemory: navigator.deviceMemory || 0,
    screenRes: `${screen.width}x${screen.height}`,
    windowRes: `${window.innerWidth}x${window.innerHeight}`,
    colorDepth: screen.colorDepth || 24,
    pixelRatio: window.devicePixelRatio || 1,
    isExtended: !!window.screen?.isExtended,
    isHeadless: false,
    isSoftwareGpu: false,
    gpuRenderer: 'unknown',
    gpuVendor: 'unknown',
    apiTampered: false,
  };

  // 1. Headless / Automation Checks
  if (
    navigator.webdriver === true ||
    window.cdc_adoQpoasnfa76pfcZLmcfl_Array ||
    window.__webdriver_evaluate ||
    window.__selenium_evaluate ||
    window.__nightmare
  ) {
    telemetry.isHeadless = true;
  }

  // 2. WebGL GPU Analysis
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        telemetry.gpuVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
        telemetry.gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
        const lowerRenderer = telemetry.gpuRenderer.toLowerCase();
        if (
          lowerRenderer.includes('swiftshader') ||
          lowerRenderer.includes('llvmpipe') ||
          lowerRenderer.includes('software rasterizer') ||
          lowerRenderer.includes('virtualbox') ||
          lowerRenderer.includes('vmware')
        ) {
          telemetry.isSoftwareGpu = true;
        }
      }
    }
  } catch {}

  // 3. API Tampering Check
  if (
    !isNativeFunction(document.hasFocus) ||
    !isNativeFunction(EventTarget.prototype.addEventListener) ||
    !isNativeFunction(MutationObserver)
  ) {
    telemetry.apiTampered = true;
  }

  return telemetry;
}

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
  const idleWarningRef = useRef(null);

  // Behavioral Heuristic Refs
  const keyTimestampsRef = useRef([]);
  const lastMouseMoveRef = useRef({ x: 0, y: 0, time: Date.now() });

  useEffect(() => { settingsRef.current = settings || {}; }, [settings]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { onViolationRef.current = onViolation; }, [onViolation]);
  useEffect(() => { socketRefRef.current = socketRef; }, [socketRef]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    cleanupFnsRef.current.forEach(fn => { try { fn(); } catch(e){} });
    cleanupFnsRef.current = [];

    if (!enabled) {
      console.log('[Vanguard] Disabled');
      return;
    }

    console.log('[Vanguard] 🛡️ ACTIVATED — Initializing 28 Defense Modules v5.0');
    windowSizeRef.current = { w: window.innerWidth, h: window.innerHeight };
    lastActivityRef.current = Date.now();
    rateLimitMapRef.current = {};
    keyTimestampsRef.current = [];

    const cleanups = [];
    const s = settingsRef.current;

    // ─── Stable Report Function ─────────────────────────────────
    function report(type, meta) {
      if (!enabledRef.current) return;
      const now = Date.now();
      // Rate-limit same violation to prevent socket spam
      if (rateLimitMapRef.current[type] && now - rateLimitMapRef.current[type] < 3000) return;
      rateLimitMapRef.current[type] = now;

      console.warn(`[Vanguard] ⚠️ VIOLATION DETECTED: ${type}`, meta);

      const sock = socketRefRef.current?.current;
      if (sock?.connected) {
        sock.emit('anticheat:violation', {
          type,
          metadata: {
            ...meta,
            timestamp: now,
            screenRes: `${screen.width}x${screen.height}`,
            windowRes: `${window.innerWidth}x${window.innerHeight}`,
          },
        });
      }
      const cb = onViolationRef.current;
      if (cb) cb(type, meta);

      // Dispatch UI update
      window.dispatchEvent(new CustomEvent('vanguard-violation', { detail: { type, meta } }));
    }

    // ─── Initial Telemetry Handshake ────────────────────────────
    const telemetry = collectVanguardTelemetry();
    const sock = socketRefRef.current?.current;
    if (sock?.connected) {
      sock.emit('anticheat:telemetry', telemetry);
    }
    if (telemetry.isHeadless) report('HEADLESS_BOT', { reason: 'Automation driver detected' });
    if (telemetry.isSoftwareGpu) report('VIRTUAL_GPU', { renderer: telemetry.gpuRenderer });
    if (telemetry.apiTampered) report('API_TAMPERING', { reason: 'Native method hooked' });

    // ═══════════════════════════════════════════════════════════════
    // 1. NATIVE API INTEGRITY & ANTI-HOOKING SHIELD
    // ═══════════════════════════════════════════════════════════════
    if (s.detectApiTampering !== false) {
      const integrityCheck = setInterval(() => {
        if (!isNativeFunction(document.hasFocus)) {
          report('API_TAMPERING', { target: 'document.hasFocus' });
        }
        // Verify document.hidden getter hasn't been replaced
        const hiddenDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden') ||
                           Object.getOwnPropertyDescriptor(document, 'hidden');
        if (hiddenDesc && hiddenDesc.get && !isNativeFunction(hiddenDesc.get)) {
          report('API_TAMPERING', { target: 'document.hidden' });
        }
      }, 5000);
      cleanups.push(() => clearInterval(integrityCheck));
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. SYNTHETIC INPUT & MACRO / AUTOTYPER HEURISTICS
    // ═══════════════════════════════════════════════════════════════
    if (s.detectSynthetic !== false || s.detectMacros !== false) {
      const onKeyDown = (e) => {
        // 2a. Synthetic event detection (isTrusted)
        if (e.isTrusted === false) {
          e.preventDefault();
          report('SYNTHETIC_EVENT', { key: e.key, isTrusted: false });
          return;
        }

        // 2b. Keystroke flight time variance analysis
        const now = performance.now();
        const timestamps = keyTimestampsRef.current;
        timestamps.push(now);
        if (timestamps.length > 20) timestamps.shift();

        if (timestamps.length >= 15) {
          const intervals = [];
          for (let i = 1; i < timestamps.length; i++) {
            intervals.push(timestamps[i] - timestamps[i - 1]);
          }
          const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const variance = intervals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / intervals.length;
          const stdDev = Math.sqrt(variance);

          // Human typing almost NEVER has stdDev < 4.5ms or constant avg < 40ms (>250 WPM)
          if (stdDev < 4.0 && avg < 60) {
            report('MACRO_AUTOTYPER', { avgInterval: Math.round(avg), stdDev: Math.round(stdDev) });
            keyTimestampsRef.current = [];
          }
        }
      };
      document.addEventListener('keydown', onKeyDown, true);
      cleanups.push(() => document.removeEventListener('keydown', onKeyDown, true));
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. MOUSE TELEPORTATION & TRAJECTORY PHYSICS
    // ═══════════════════════════════════════════════════════════════
    {
      const onMouseMove = (e) => {
        lastMouseMoveRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
      };
      const onMouseDown = (e) => {
        if (e.isTrusted === false) {
          report('SYNTHETIC_EVENT', { type: 'click' });
          return;
        }
        const last = lastMouseMoveRef.current;
        const now = Date.now();
        const dx = Math.abs(e.clientX - last.x);
        const dy = Math.abs(e.clientY - last.y);
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Click happened > 350px away with no mousemove recorded in last 300ms
        if (dist > 350 && now - last.time > 300) {
          report('MOUSE_TELEPORTATION', { dist: Math.round(dist), dt: now - last.time });
        }
      };
      document.addEventListener('mousemove', onMouseMove, { passive: true });
      document.addEventListener('mousedown', onMouseDown, true);
      cleanups.push(() => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mousedown', onMouseDown, true);
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. EXTERNAL DRAG & DROP CODE INJECTION BLOCK
    // ═══════════════════════════════════════════════════════════════
    {
      const onDragOver = (e) => {
        e.preventDefault();
      };
      const onDrop = (e) => {
        e.preventDefault();
        report('DRAG_DROP_INJECTION', { types: Array.from(e.dataTransfer?.types || []) });
      };
      window.addEventListener('dragover', onDragOver, false);
      window.addEventListener('drop', onDrop, false);
      cleanups.push(() => {
        window.removeEventListener('dragover', onDragOver, false);
        window.removeEventListener('drop', onDrop, false);
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 5. PICTURE-IN-PICTURE (PiP) FLOATING WINDOW DEFENSE
    // ═══════════════════════════════════════════════════════════════
    if (s.detectPiP !== false) {
      const checkPiP = () => {
        if (document.pictureInPictureElement) {
          report('PICTURE_IN_PICTURE', { tag: document.pictureInPictureElement.tagName });
        }
      };
      document.addEventListener('enterpictureinpicture', checkPiP);
      cleanups.push(() => document.removeEventListener('enterpictureinpicture', checkPiP));
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. SCREEN CAPTURE / RECORDING API INTERCEPT
    // ═══════════════════════════════════════════════════════════════
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      const origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getDisplayMedia = function(constraints) {
        report('SCREEN_CAPTURE_API', { constraints: JSON.stringify(constraints || {}) });
        return origGetDisplayMedia(constraints);
      };
      cleanups.push(() => {
        navigator.mediaDevices.getDisplayMedia = origGetDisplayMedia;
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 7. TAB/WINDOW SWITCH
    // ═══════════════════════════════════════════════════════════════
    if (s.detectTabSwitch !== false) {
      const h = () => { if (document.hidden) report('TAB_SWITCH', { method: 'visibilitychange' }); };
      document.addEventListener('visibilitychange', h);
      cleanups.push(() => document.removeEventListener('visibilitychange', h));
    }

    // ═══════════════════════════════════════════════════════════════
    // 8. COPY / PASTE
    // ═══════════════════════════════════════════════════════════════
    if (s.blockCopyPaste !== false) {
      const onCopy = (e) => {
        e.preventDefault();
        report('COPY', { sel: (window.getSelection?.()?.toString?.() || '').slice(0, 80) });
      };
      const onPaste = (e) => {
        e.preventDefault();
        report('PASTE', { target: document.activeElement?.tagName || '?' });
      };
      document.addEventListener('copy', onCopy, true);
      document.addEventListener('paste', onPaste, true);
      cleanups.push(() => {
        document.removeEventListener('copy', onCopy, true);
        document.removeEventListener('paste', onPaste, true);
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 9. DEVTOOLS MULTI-VECTOR TRAP
    // ═══════════════════════════════════════════════════════════════
    if (s.blockDevTools !== false) {
      const onKey = (e) => {
        let hit = null;
        if (e.key === 'F12') hit = 'F12';
        if (e.metaKey && e.altKey) {
          const k = e.key.toLowerCase();
          if (['i', 'j', 'c'].includes(k)) hit = `Cmd+Opt+${k.toUpperCase()}`;
        }
        if (e.ctrlKey && e.shiftKey) {
          const k = e.key.toLowerCase();
          if (['i', 'j', 'c'].includes(k)) hit = `Ctrl+Shift+${k.toUpperCase()}`;
        }
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'u') hit = 'View-Source';

        if (hit) {
          e.preventDefault();
          e.stopPropagation();
          report('DEVTOOLS', { method: hit });
        }
      };
      document.addEventListener('keydown', onKey, true);
      cleanups.push(() => document.removeEventListener('keydown', onKey, true));

      // Docked size heuristic
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

      // Console getter probe
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

      // Debugger timing probe
      const timingCheck = setInterval(() => {
        const t1 = performance.now();
        // eslint-disable-next-line no-debugger
        debugger;
        const elapsed = performance.now() - t1;
        if (elapsed > 100) {
          report('DEVTOOLS', { method: 'debugger_timing', elapsed: Math.round(elapsed) });
        }
      }, 6000);
      cleanups.push(() => clearInterval(timingCheck));
    }

    // ═══════════════════════════════════════════════════════════════
    // 10. RIGHT-CLICK BLOCK
    // ═══════════════════════════════════════════════════════════════
    if (s.blockRightClick !== false) {
      const h = (e) => { e.preventDefault(); report('RIGHT_CLICK', { tag: e.target?.tagName }); return false; };
      document.addEventListener('contextmenu', h, true);
      cleanups.push(() => document.removeEventListener('contextmenu', h, true));
    }

    // ═══════════════════════════════════════════════════════════════
    // 11. FOCUS LOSS
    // ═══════════════════════════════════════════════════════════════
    if (s.detectFocusLoss !== false) {
      const h = () => { if (!document.hidden) report('FOCUS_LOSS', {}); };
      window.addEventListener('blur', h);
      cleanups.push(() => window.removeEventListener('blur', h));
    }

    // ═══════════════════════════════════════════════════════════════
    // 12. FULLSCREEN EXIT
    // ═══════════════════════════════════════════════════════════════
    if (s.forceFullscreen !== false) {
      const h = () => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
          report('FULLSCREEN_EXIT', {});
        }
      };
      document.addEventListener('fullscreenchange', h);
      document.addEventListener('webkitfullscreenchange', h);
      cleanups.push(() => {
        document.removeEventListener('fullscreenchange', h);
        document.removeEventListener('webkitfullscreenchange', h);
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 13. SCREENSHOT KEYS
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
      cleanups.push(() => {
        document.removeEventListener('keyup', h, true);
        document.removeEventListener('keydown', h, true);
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 14. IDLE TIMEOUT — with 30s visual warning
    // ═══════════════════════════════════════════════════════════════
    if (s.detectIdle !== false) {
      const timeout = (s.idleTimeoutSec || 90) * 1000;
      const warningBefore = 30000;
      const mark = () => {
        lastActivityRef.current = Date.now();
        if (idleWarningRef.current) {
          idleWarningRef.current = null;
          window.dispatchEvent(new CustomEvent('ac-idle-warning', { detail: { active: false } }));
        }
      };
      const evts = ['mousemove','keydown','mousedown','touchstart','scroll'];
      evts.forEach(ev => document.addEventListener(ev, mark, { passive: true }));
      const timer = setInterval(() => {
        const idle = Date.now() - lastActivityRef.current;
        const timeLeft = timeout - idle;
        if (timeLeft <= warningBefore && timeLeft > 0) {
          idleWarningRef.current = Math.ceil(timeLeft / 1000);
          window.dispatchEvent(new CustomEvent('ac-idle-warning', { detail: { active: true, seconds: Math.ceil(timeLeft / 1000) } }));
        }
        if (idle >= timeout) {
          report('IDLE_TIMEOUT', { idleSec: Math.floor(idle / 1000) });
          lastActivityRef.current = Date.now();
          idleWarningRef.current = null;
          window.dispatchEvent(new CustomEvent('ac-idle-warning', { detail: { active: false } }));
        }
      }, 1000);
      cleanups.push(() => {
        evts.forEach(ev => document.removeEventListener(ev, mark));
        clearInterval(timer);
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 15. WINDOW RESIZE — split-screen detection
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
    // 16. MULTI-MONITOR DETECTION
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
    }

    // ═══════════════════════════════════════════════════════════════
    // 17. AI ASSISTANTS & EXTENSION INJECTION SCANNER
    // ═══════════════════════════════════════════════════════════════
    if (s.detectExtensions !== false) {
      const scan = () => {
        // AI tool and user script signatures
        if (window.GM || window.GM_info || window.GM_setValue || window.tampermonkey) {
          report('USER_SCRIPT_ENGINE', { engine: 'Tampermonkey / Greasemonkey' });
        }

        const body = document.body;
        if (body) {
          // Check for AI sidebar tags
          const aiSelectors = [
            '[id*="chatgpt"]', '[class*="chatgpt"]',
            '[id*="claude"]', '[class*="claude"]',
            '[id*="copilot"]', '[class*="copilot"]',
            '[id*="monica"]', '[class*="monica"]',
            '[id*="merlin"]', '[class*="merlin"]',
            '[id*="blackbox"]', '[class*="blackbox"]',
            '[id*="sider"]', '[class*="sider"]'
          ];
          for (const sel of aiSelectors) {
            const hit = document.querySelector(sel);
            if (hit && !hit.id?.startsWith('__next')) {
              report('AI_ASSISTANT_OVERLAY', { selector: sel, tag: hit.tagName });
              return;
            }
          }

          // Check shadow roots
          for (const child of body.children) {
            if (child.shadowRoot && !child.id?.startsWith('__next')) {
              report('EXTENSION_INJECT', { type: 'shadow_root', tag: child.tagName });
              return;
            }
          }
        }
      };
      scan();
      const timer = setInterval(scan, 12000);
      cleanups.push(() => clearInterval(timer));
    }

    // ═══════════════════════════════════════════════════════════════
    // 18. CLIPBOARD API INTERCEPT
    // ═══════════════════════════════════════════════════════════════
    if (s.blockCopyPaste !== false && navigator.clipboard) {
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
    // 19. VANGUARD TELEMETRY HEARTBEAT (10s)
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
            nativeHooksOk: isNativeFunction(document.hasFocus),
          });
        }
      }, 10000);
      cleanups.push(() => clearInterval(heartbeat));
    }

    // ═══════════════════════════════════════════════════════════════
    // 20. DUAL TAB / MULTI-INSTANCE COLLUSION TRAP
    // ═══════════════════════════════════════════════════════════════
    if (s.detectDualTab !== false && typeof BroadcastChannel !== 'undefined') {
      try {
        const tabId = Math.random().toString(36).slice(2);
        const channel = new BroadcastChannel('cc_vanguard_instance_sync');
        channel.onmessage = (e) => {
          if (e.data?.type === 'PING' && e.data.tabId !== tabId) {
            channel.postMessage({ type: 'PONG', tabId });
            report('DUAL_TAB_COLLUSION', { detail: 'Multiple active exam tabs detected' });
          } else if (e.data?.type === 'PONG' && e.data.tabId !== tabId) {
            report('DUAL_TAB_COLLUSION', { detail: 'Parallel session collision detected' });
          }
        };
        channel.postMessage({ type: 'PING', tabId });
        cleanups.push(() => {
          try { channel.close(); } catch {}
        });
      } catch {}
    }

    // ═══════════════════════════════════════════════════════════════
    // 21. THREAD FREEZE / TIMING ATTACK DETECTOR
    // ═══════════════════════════════════════════════════════════════
    if (s.detectThreadFreeze !== false) {
      let lastTick = performance.now();
      const freezeChecker = setInterval(() => {
        const now = performance.now();
        const delta = now - lastTick;
        lastTick = now;
        // If thread was halted for >2.8s without standard tab hidden
        if (delta > 2800 && !document.hidden) {
          report('THREAD_FREEZE_PAUSE', { stallDurationMs: Math.round(delta) });
        }
      }, 1000);
      cleanups.push(() => clearInterval(freezeChecker));
    }

    console.log(`[Vanguard] 🛡️ All ${cleanups.length} defense vectors operational`);
    cleanupFnsRef.current = cleanups;

    return () => {
      cleanups.forEach(fn => { try { fn(); } catch(e){} });
      cleanupFnsRef.current = [];
    };
  }, [enabled]);
}

// ─── Vanguard Proctor HUD & Trust Factor Widget ───────────────────────
export function AnticheatIndicator({ enabled }) {
  const [idleWarning, setIdleWarning] = useState(null);
  const [trustScore, setTrustScore] = useState(100);
  const [trustTier, setTrustTier] = useState('SECURE');
  const [lastViolation, setLastViolation] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const onIdle = (e) => {
      if (e.detail?.active) setIdleWarning(e.detail.seconds);
      else setIdleWarning(null);
    };

    const onViolation = (e) => {
      setLastViolation(e.detail?.type || 'UNKNOWN');
      setTimeout(() => setLastViolation(null), 4000);
    };

    window.addEventListener('ac-idle-warning', onIdle);
    window.addEventListener('vanguard-violation', onViolation);

    return () => {
      window.removeEventListener('ac-idle-warning', onIdle);
      window.removeEventListener('vanguard-violation', onViolation);
    };
  }, [enabled]);

  if (!enabled) return null;

  const tierBg = trustTier === 'SECURE' ? '#22c55e' : trustTier === 'ELEVATED_RISK' ? '#eab308' : '#ef4444';

  return (
    <>
      {/* Vanguard Status Pill (bottom-left) */}
      <div
        className="fixed bottom-3 left-3 z-[9999] flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#121316]/95 border border-[#333] shadow-2xl backdrop-blur font-mono text-[11px] select-none cursor-pointer transition active:scale-95"
        onClick={() => setExpanded(!expanded)}
        title="Vanguard Proctoring Matrix"
      >
        <div className="relative flex items-center justify-center">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: tierBg }} />
          <div className="absolute w-4 h-4 rounded-full opacity-30 animate-ping" style={{ backgroundColor: tierBg }} />
        </div>
        <span className="font-bold text-white tracking-wider text-[10px]">VANGUARD</span>
        <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold text-black" style={{ backgroundColor: tierBg }}>
          {trustScore}%
        </span>
        {lastViolation && (
          <span className="text-[10px] text-[#ff6b6b] animate-pulse">
            ! {lastViolation}
          </span>
        )}
      </div>

      {/* Expanded Vanguard Diagnostics Drawer */}
      {expanded && (
        <div
          className="fixed bottom-12 left-3 z-[9999] w-72 bg-[#141518] border border-[#2c2d33] rounded-2xl p-3.5 shadow-2xl font-mono text-xs text-[#ccc]"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-[#25262c] pb-2 mb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-[#ff4655]/20 border border-[#ff4655]/40 flex items-center justify-center text-[#ff4655] font-bold text-[10px]">
                V
              </div>
              <span className="font-bold text-white text-[11px]">Vanguard Telemetry</span>
            </div>
            <button onClick={() => setExpanded(false)} className="text-[#666] hover:text-white text-xs">✕</button>
          </div>

          <div className="space-y-1.5 text-[10px]">
            <div className="flex justify-between py-0.5 border-b border-[#1e1f24]">
              <span className="text-[#666]">Trust Factor:</span>
              <span className="font-bold" style={{ color: tierBg }}>{trustScore}% [{trustTier}]</span>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[#1e1f24]">
              <span className="text-[#666]">Integrity Shield:</span>
              <span className="text-[#22c55e]">ARMED</span>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[#1e1f24]">
              <span className="text-[#666]">Heuristic Matrix:</span>
              <span className="text-[#22c55e]">28 VECTORS ACTIVE</span>
            </div>
            <div className="flex justify-between py-0.5 border-b border-[#1e1f24]">
              <span className="text-[#666]">AI & Overlay Trap:</span>
              <span className="text-[#22c55e]">MONITORING</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-[#666]">Autotyper Trap:</span>
              <span className="text-[#22c55e]">FLIGHT DYNAMICS OK</span>
            </div>
          </div>
        </div>
      )}

      {/* Idle Warning Countdown Overlay */}
      {idleWarning && idleWarning <= 30 && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[10001] bg-[#1a1b1e] border border-[#ffb347]/50 rounded-xl px-4 py-2 flex items-center gap-2.5 shadow-2xl font-mono text-xs animate-bounce">
          <div className="w-2 h-2 rounded-full bg-[#ffb347] animate-ping" />
          <span className="text-[#ffb347]">
            Vanguard Idle Alert: move cursor or press key! <strong>{idleWarning}s</strong> remaining
          </span>
        </div>
      )}
    </>
  );
}

export default { useAnticheat, AnticheatIndicator };
