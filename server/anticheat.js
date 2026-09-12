/**
 * AntiCheat Vanguard Engine v5.0 — Valorant-Grade Proctoring & Heuristics
 * 
 * 28 Multi-Layered Detection Criterion:
 *  [Kernel & Environment]
 *   1. HEADLESS_BOT: Puppeteer, Playwright, Selenium, Chrome CDP automation artifacts
 *   2. API_TAMPERING: Native API hooking/tampering detection (anti-spoofing)
 *   3. VIRTUAL_GPU: Software rasterizer & emulated GPUs (SwiftShader, llvmpipe)
 *   4. AI_ASSISTANT_OVERLAY: Injected ChatGPT, Claude, Copilot, Blackbox AI tools
 *   5. USER_SCRIPT_ENGINE: Tampermonkey, Violentmonkey, Greasemonkey injectors
 *   6. EXTENSION_INJECT: Unauthorized Chrome/Mozilla extension DOM insertions
 *   7. DEVTOOLS: Multi-vector DevTools detection (Mac+Win keys, docked size, debugger timing, getter trap)
 * 
 *  [Behavioral & Input Heuristics]
 *   8. SYNTHETIC_EVENT: Non-human isTrusted===false dispatchEvent injection
 *   9. MACRO_AUTOTYPER: Flight time variance analysis (<5ms variance or >260 WPM burst)
 *  10. MOUSE_TELEPORTATION: Inhuman instantaneous cursor jumps without physical trajectory
 *  11. DRAG_DROP_INJECTION: External file or text dragging into the editor
 * 
 *  [Screen, Focus & Window Defense]
 *  12. TAB_SWITCH: Page visibility change (document.hidden)
 *  13. FOCUS_LOSS: Window blur (loss of OS-level window focus)
 *  14. FULLSCREEN_EXIT: Fullscreen mode termination
 *  15. MULTI_MONITOR: Multi-display setup (screen.isExtended, coordinate overflow)
 *  16. WINDOW_RESIZE: Split-screen / window resizing during proctored exam
 *  17. PICTURE_IN_PICTURE: Secondary floating media window
 *  18. SCREEN_CAPTURE_API: Unauthorized screen recording attempts
 * 
 *  [Content, Clipboard & Media Defense]
 *  19. COPY: Copy event intercept
 *  20. PASTE: Paste event intercept
 *  21. CLIPBOARD_API: navigator.clipboard.readText/writeText interception
 *  22. CLIPBOARD_POLLING: Rapid automated clipboard reading
 *  23. RIGHT_CLICK: Context menu block
 *  24. SCREENSHOT: PrintScreen, Cmd+Shift+3/4/5, Win+Shift+S detection
 * 
 *  [Presence & Heartbeat]
 *  25. IDLE_TIMEOUT: Extended inactivity with countdown warning
 *  26. HEARTBEAT_MISSING: Loss of cryptographic client telemetry heartbeat
 * 
 * Includes:
 *  - Real-time Vanguard Trust Factor (0-100 Score with 4 Risk Tiers)
 *  - Environmental hardware fingerprinting & integrity validation
 *  - Sensitivity profiles (Standard, Strict, Vanguard Paranoia)
 *  - Auto-flagging and auto-disqualification engine
 * 
 * made with <3 by Namish
 */

// ─── 28 Violation Types ───────────────────────────────────────────────
const VIOLATION_TYPES = {
  // Kernel, Environment & Automation
  HEADLESS_BOT:         { id: 'headless_bot',         name: 'Headless / Automation Bot',   severity: 'critical', weight: 8, category: 'kernel' },
  API_TAMPERING:        { id: 'api_tampering',        name: 'Native API Tampering Hook',   severity: 'critical', weight: 8, category: 'kernel' },
  VIRTUAL_GPU:          { id: 'virtual_gpu',          name: 'Virtual / Software GPU',      severity: 'critical', weight: 6, category: 'kernel' },
  AI_ASSISTANT_OVERLAY: { id: 'ai_assistant_overlay', name: 'AI Assistant Overlay Tool',   severity: 'critical', weight: 7, category: 'injection' },
  USER_SCRIPT_ENGINE:   { id: 'user_script_engine',   name: 'UserScript / Cheat Injector', severity: 'critical', weight: 7, category: 'injection' },
  EXTENSION_INJECT:     { id: 'extension_inject',     name: 'Browser Extension Injected',  severity: 'critical', weight: 5, category: 'injection' },
  DEVTOOLS:             { id: 'devtools',             name: 'Developer Tools Opened',      severity: 'critical', weight: 5, category: 'integrity' },

  // Behavioral & Input Heuristics
  SYNTHETIC_EVENT:      { id: 'synthetic_event',      name: 'Synthetic / Untrusted Input', severity: 'high',     weight: 4, category: 'behavioral' },
  MACRO_AUTOTYPER:      { id: 'macro_autotyper',      name: 'Autotyper / Inhuman WPM',     severity: 'high',     weight: 4, category: 'behavioral' },
  MOUSE_TELEPORTATION:  { id: 'mouse_teleportation',  name: 'Anomalous Mouse Trajectory',  severity: 'medium',   weight: 2, category: 'behavioral' },
  DRAG_DROP_INJECTION:  { id: 'drag_drop_injection',  name: 'External Drag & Drop Code',   severity: 'high',     weight: 3, category: 'behavioral' },

  // Screen, Focus & Window Defense
  TAB_SWITCH:           { id: 'tab_switch',           name: 'Tab/Window Switch',           severity: 'high',     weight: 3, category: 'focus' },
  FOCUS_LOSS:           { id: 'focus_loss',           name: 'Window Focus Lost',           severity: 'medium',   weight: 2, category: 'focus' },
  FULLSCREEN_EXIT:      { id: 'fullscreen_exit',      name: 'Fullscreen Exit',             severity: 'high',     weight: 3, category: 'focus' },
  MULTI_MONITOR:        { id: 'multi_monitor',        name: 'Multiple Displays Active',    severity: 'medium',   weight: 2, category: 'hardware' },
  WINDOW_RESIZE:        { id: 'window_resize',        name: 'Suspicious Window Resize',    severity: 'low',      weight: 1, category: 'focus' },
  PICTURE_IN_PICTURE:   { id: 'picture_in_picture',   name: 'Picture-in-Picture Active',   severity: 'high',     weight: 4, category: 'media' },
  SCREEN_CAPTURE_API:   { id: 'screen_capture_api',   name: 'Screen Recording Triggered',  severity: 'critical', weight: 6, category: 'media' },

  // Content & Clipboard Defense
  COPY:                 { id: 'copy',                 name: 'Copy Attempt',                severity: 'medium',   weight: 2, category: 'content' },
  PASTE:                { id: 'paste',                name: 'Paste Attempt',               severity: 'high',     weight: 3, category: 'content' },
  CLIPBOARD_API:        { id: 'clipboard_api',        name: 'Clipboard API Access',        severity: 'medium',   weight: 2, category: 'content' },
  CLIPBOARD_POLLING:    { id: 'clipboard_polling',    name: 'Rapid Clipboard Polling',    severity: 'high',     weight: 4, category: 'content' },
  RIGHT_CLICK:          { id: 'right_click',          name: 'Right-Click Context Menu',    severity: 'low',      weight: 1, category: 'content' },
  SCREENSHOT:           { id: 'screenshot',           name: 'Screenshot Attempt',          severity: 'high',     weight: 3, category: 'media' },

  // Presence & Heartbeat
  IDLE_TIMEOUT:         { id: 'idle_timeout',         name: 'Session Idle Timeout',        severity: 'low',      weight: 1, category: 'presence' },
  HEARTBEAT_MISSING:    { id: 'heartbeat_missing',    name: 'Telemetry Heartbeat Dropped', severity: 'medium',   weight: 3, category: 'presence' },

  // Multi-Instance & Timing Integrity
  DUAL_TAB_COLLUSION:   { id: 'dual_tab_collusion',   name: 'Dual Tab / Multi-Instance',   severity: 'critical', weight: 6, category: 'integrity' },
  THREAD_FREEZE_PAUSE:  { id: 'thread_freeze_pause',  name: 'Debugger Thread Freeze Pause', severity: 'high',     weight: 4, category: 'integrity' },
};

// ─── Vanguard Sensitivity Presets ────────────────────────────────────
const SENSITIVITY_PROFILES = {
  STANDARD: {
    autoFlagThreshold: 15,
    autoBanThreshold: 35,
    trustDecayMultiplier: 2.0,
    enforceFullscreen: true,
  },
  STRICT: {
    autoFlagThreshold: 10,
    autoBanThreshold: 25,
    trustDecayMultiplier: 3.0,
    enforceFullscreen: true,
  },
  VANGUARD_PARANOIA: {
    autoFlagThreshold: 6,
    autoBanThreshold: 16,
    trustDecayMultiplier: 4.5,
    enforceFullscreen: true,
  },
};

// ─── AntiCheat State ──────────────────────────────────────────────────
const anticheatState = {
  enabled: false,
  profile: 'VANGUARD_PARANOIA',
  settings: {
    blockCopyPaste: true,
    blockRightClick: true,
    blockDevTools: true,
    detectTabSwitch: true,
    detectFocusLoss: true,
    forceFullscreen: true,
    detectMultiMonitor: true,
    detectScreenshot: true,
    detectResize: true,
    detectIdle: true,
    detectExtensions: true,
    detectHeadless: true,
    detectSynthetic: true,
    detectMacros: true,
    detectPiP: true,
    detectApiTampering: true,
    detectDualTab: true,
    detectThreadFreeze: true,
    idleTimeoutSec: 90,
    autoFlagThreshold: 8,
    autoBanThreshold: 20,
    trustDecayMultiplier: 3.5,
  },
  violations: [],
  userScores: new Map(),       // userId -> { totalWeight, trustScore, tier, violations[], flagged, username, telemetry }
  flaggedUsers: new Set(),
  userTelemetry: new Map(),     // userId -> hardware fingerprint
  startedAt: null,
};

// ─── Helper: Compute Vanguard Trust Factor ───────────────────────────
function calculateTrustFactor(totalWeight, multiplier = 3.5) {
  const penalty = totalWeight * multiplier;
  const score = Math.max(0, Math.round(100 - penalty));

  let tier = 'SECURE';
  let tierColor = '#22c55e'; // Green

  if (score < 30) {
    tier = 'COMPROMISED';
    tierColor = '#ef4444'; // Red
  } else if (score < 60) {
    tier = 'SUSPICIOUS';
    tierColor = '#f97316'; // Orange
  } else if (score < 85) {
    tier = 'ELEVATED_RISK';
    tierColor = '#eab308'; // Yellow
  }

  return { score, tier, tierColor };
}

// ─── Core Functions ───────────────────────────────────────────────────

function enableAnticheat(settings = {}) {
  anticheatState.enabled = true;
  anticheatState.startedAt = Date.now();
  Object.assign(anticheatState.settings, settings);
  console.log('[Vanguard] ENABLED — Riot-Level Proctoring Active with settings:', JSON.stringify(anticheatState.settings));
}

function disableAnticheat() {
  anticheatState.enabled = false;
  console.log('[Vanguard] DISABLED');
}

function resetAnticheat() {
  anticheatState.violations = [];
  anticheatState.userScores.clear();
  anticheatState.flaggedUsers.clear();
  anticheatState.userTelemetry.clear();
  anticheatState.startedAt = null;
  console.log('[Vanguard] RESET — All records and scores cleared');
}

function getSettings() {
  return { ...anticheatState.settings, profile: anticheatState.profile };
}

function updateSettings(newSettings) {
  if (newSettings.profile && SENSITIVITY_PROFILES[newSettings.profile]) {
    anticheatState.profile = newSettings.profile;
    Object.assign(anticheatState.settings, SENSITIVITY_PROFILES[newSettings.profile]);
  }
  Object.assign(anticheatState.settings, newSettings);
  return getSettings();
}

function recordTelemetry(userId, username, telemetryData = {}) {
  const existing = anticheatState.userTelemetry.get(userId) || {};
  const updated = {
    ...existing,
    ...telemetryData,
    userId,
    username,
    lastSeen: Date.now(),
  };
  anticheatState.userTelemetry.set(userId, updated);

  // Auto-scan telemetry for instant critical anomalies
  if (updated.isHeadless || updated.isAutomated) {
    addViolation(userId, username, 'HEADLESS_BOT', { reason: 'WebDriver automation detected in telemetry' });
  }
  if (updated.isSoftwareGpu) {
    addViolation(userId, username, 'VIRTUAL_GPU', { gpu: updated.gpuRenderer || 'SwiftShader' });
  }
  if (updated.apiTampered) {
    addViolation(userId, username, 'API_TAMPERING', { method: updated.tamperedApi || 'native prototype hook' });
  }

  return updated;
}

function addViolation(userId, username, violationType, metadata = {}) {
  if (!anticheatState.enabled) return null;

  const vType = VIOLATION_TYPES[violationType];
  if (!vType) return null;

  // Setting verification map
  const settingMap = {
    TAB_SWITCH: 'detectTabSwitch',
    COPY: 'blockCopyPaste',
    PASTE: 'blockCopyPaste',
    FULLSCREEN_EXIT: 'forceFullscreen',
    DEVTOOLS: 'blockDevTools',
    RIGHT_CLICK: 'blockRightClick',
    MULTI_MONITOR: 'detectMultiMonitor',
    WINDOW_RESIZE: 'detectResize',
    FOCUS_LOSS: 'detectFocusLoss',
    CLIPBOARD_API: 'blockCopyPaste',
    CLIPBOARD_POLLING: 'blockCopyPaste',
    SCREENSHOT: 'detectScreenshot',
    EXTENSION_INJECT: 'detectExtensions',
    AI_ASSISTANT_OVERLAY: 'detectExtensions',
    USER_SCRIPT_ENGINE: 'detectExtensions',
    IDLE_TIMEOUT: 'detectIdle',
    HEADLESS_BOT: 'detectHeadless',
    VIRTUAL_GPU: 'detectHeadless',
    SYNTHETIC_EVENT: 'detectSynthetic',
    MACRO_AUTOTYPER: 'detectMacros',
    PICTURE_IN_PICTURE: 'detectPiP',
    SCREEN_CAPTURE_API: 'detectScreenshot',
    API_TAMPERING: 'detectApiTampering',
    DRAG_DROP_INJECTION: 'blockCopyPaste',
  };

  if (settingMap[violationType] && !anticheatState.settings[settingMap[violationType]]) {
    return null;
  }

  // Rate-limit: 1 violation of same type per user per 2.5 seconds
  const recentCutoff = Date.now() - 2500;
  const recentSame = anticheatState.violations.find(v =>
    v.userId === userId && v.type === vType.id && v.timestamp > recentCutoff
  );
  if (recentSame) return null;

  const violation = {
    id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    username,
    type: vType.id,
    name: vType.name,
    severity: vType.severity,
    weight: vType.weight,
    category: vType.category,
    timestamp: Date.now(),
    metadata,
  };

  anticheatState.violations.push(violation);
  if (anticheatState.violations.length > 1500) {
    anticheatState.violations = anticheatState.violations.slice(-750);
  }

  // Update user Vanguard score
  let userScore = anticheatState.userScores.get(userId);
  if (!userScore) {
    userScore = {
      totalWeight: 0,
      trustScore: 100,
      tier: 'SECURE',
      tierColor: '#22c55e',
      violations: [],
      flagged: false,
      username,
    };
    anticheatState.userScores.set(userId, userScore);
  }

  userScore.totalWeight += vType.weight;
  userScore.violations.push(violation);
  userScore.username = username;

  // Recalculate Vanguard Trust Factor
  const tf = calculateTrustFactor(userScore.totalWeight, anticheatState.settings.trustDecayMultiplier);
  userScore.trustScore = tf.score;
  userScore.tier = tf.tier;
  userScore.tierColor = tf.tierColor;

  if (userScore.violations.length > 250) {
    userScore.violations = userScore.violations.slice(-120);
  }

  // Auto-flag check
  if ((userScore.totalWeight >= anticheatState.settings.autoFlagThreshold || userScore.trustScore < 60) && !userScore.flagged) {
    userScore.flagged = true;
    anticheatState.flaggedUsers.add(userId);
    console.log(`[Vanguard] ⚠️ THREAT FLAGGED: ${username} (${userId}) — Weight: ${userScore.totalWeight}, Trust: ${userScore.trustScore}% [${userScore.tier}]`);
  }

  return { violation, trustFactor: tf };
}

function getUserScore(userId) {
  const score = anticheatState.userScores.get(userId);
  if (!score) return null;
  const telemetry = anticheatState.userTelemetry.get(userId) || {};
  return { ...score, telemetry };
}

function getAllUserScores() {
  const scores = [];
  for (const [userId, data] of anticheatState.userScores) {
    const telemetry = anticheatState.userTelemetry.get(userId) || {};
    scores.push({
      userId,
      username: data.username,
      totalWeight: data.totalWeight,
      trustScore: data.trustScore ?? 100,
      tier: data.tier || 'SECURE',
      tierColor: data.tierColor || '#22c55e',
      violationCount: data.violations.length,
      flagged: data.flagged,
      reachedBanThreshold: data.totalWeight >= anticheatState.settings.autoBanThreshold || data.trustScore < 30,
      lastViolation: data.violations.length > 0 ? data.violations[data.violations.length - 1] : null,
      violationsByType: countByType(data.violations),
      telemetry,
    });
  }
  scores.sort((a, b) => b.totalWeight - a.totalWeight);
  return scores;
}

function countByType(violations) {
  const counts = {};
  for (const v of violations) {
    counts[v.type] = (counts[v.type] || 0) + 1;
  }
  return counts;
}

function getRecentViolations(limit = 60) {
  return anticheatState.violations.slice(-limit).reverse();
}

function clearUserViolations(userId) {
  anticheatState.userScores.delete(userId);
  anticheatState.flaggedUsers.delete(userId);
  anticheatState.violations = anticheatState.violations.filter(v => v.userId !== userId);
}

function unflagUser(userId) {
  const score = anticheatState.userScores.get(userId);
  if (score) score.flagged = false;
  anticheatState.flaggedUsers.delete(userId);
}

function getAnticheatStatus() {
  return {
    enabled: anticheatState.enabled,
    profile: anticheatState.profile,
    settings: { ...anticheatState.settings },
    startedAt: anticheatState.startedAt,
    totalViolations: anticheatState.violations.length,
    totalUsers: anticheatState.userScores.size,
    flaggedUsers: anticheatState.flaggedUsers.size,
    violationTypes: VIOLATION_TYPES,
  };
}

function getFullReport() {
  return {
    ...getAnticheatStatus(),
    userScores: getAllUserScores(),
    recentViolations: getRecentViolations(120),
    flaggedUserIds: [...anticheatState.flaggedUsers],
  };
}

module.exports = {
  VIOLATION_TYPES,
  SENSITIVITY_PROFILES,
  enableAnticheat,
  disableAnticheat,
  resetAnticheat,
  getSettings,
  updateSettings,
  recordTelemetry,
  addViolation,
  getUserScore,
  getAllUserScores,
  getRecentViolations,
  clearUserViolations,
  unflagUser,
  getAnticheatStatus,
  getFullReport,
  anticheatState,
};
