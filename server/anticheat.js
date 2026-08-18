/**
 * AntiCheat Engine v1.0 — Server-Side Proctoring & Violation Management
 * 
 * Detections:
 *  1. Tab/window switch (visibilitychange / blur)
 *  2. Copy (Ctrl+C / context menu copy during exam)
 *  3. Paste (Ctrl+V / context menu paste during exam)
 *  4. Fullscreen exit
 *  5. DevTools open (resize heuristic + keyboard shortcut detection)
 *  6. Right-click (context menu)
 *  7. Multiple monitors detected
 *  8. Window resize (possible screen share / split screen)
 *  9. Focus loss (window.onblur)
 * 10. Clipboard API access
 * 11. Screenshot attempt (PrintScreen key)
 * 12. Browser extension injection detected
 * 13. Idle timeout (no input for extended period)
 * 
 * All toggled by admin. Each violation is logged with timestamp, severity,
 * and metadata. Auto-flag thresholds configurable.
 * 
 * made with <3 by Namish
 */

// ─── Violation Types ──────────────────────────────────────────────────
const VIOLATION_TYPES = {
  TAB_SWITCH:       { id: 'tab_switch',       name: 'Tab/Window Switch',    severity: 'high',   weight: 3 },
  COPY:             { id: 'copy',             name: 'Copy Detected',         severity: 'medium', weight: 2 },
  PASTE:            { id: 'paste',            name: 'Paste Detected',        severity: 'high',   weight: 3 },
  FULLSCREEN_EXIT:  { id: 'fullscreen_exit',  name: 'Fullscreen Exit',       severity: 'high',   weight: 3 },
  DEVTOOLS:         { id: 'devtools',         name: 'DevTools Opened',       severity: 'critical', weight: 5 },
  RIGHT_CLICK:      { id: 'right_click',      name: 'Right Click',           severity: 'low',    weight: 1 },
  MULTI_MONITOR:    { id: 'multi_monitor',    name: 'Multiple Monitors',     severity: 'medium', weight: 2 },
  WINDOW_RESIZE:    { id: 'window_resize',    name: 'Suspicious Resize',     severity: 'low',    weight: 1 },
  FOCUS_LOSS:       { id: 'focus_loss',       name: 'Window Focus Lost',     severity: 'medium', weight: 2 },
  CLIPBOARD_API:    { id: 'clipboard_api',    name: 'Clipboard API Access',  severity: 'medium', weight: 2 },
  SCREENSHOT:       { id: 'screenshot',       name: 'Screenshot Attempt',    severity: 'high',   weight: 3 },
  EXTENSION_INJECT: { id: 'extension_inject', name: 'Extension Detected',    severity: 'critical', weight: 5 },
  IDLE_TIMEOUT:     { id: 'idle_timeout',     name: 'Idle Timeout',          severity: 'low',    weight: 1 },
};

// ─── AntiCheat State ──────────────────────────────────────────────────
const anticheatState = {
  enabled: false,                // Master toggle (admin controls this)
  settings: {
    blockCopyPaste: true,        // Block copy/paste in editor
    blockRightClick: true,       // Block right-click context menu
    blockDevTools: true,         // Detect & flag DevTools
    detectTabSwitch: true,       // Detect tab/window switches
    detectFocusLoss: true,       // Detect window focus loss
    forceFullscreen: true,       // Force fullscreen + detect exits
    detectMultiMonitor: true,    // Detect multiple monitors
    detectScreenshot: true,      // Detect PrintScreen
    detectResize: true,          // Detect suspicious window resize
    detectIdle: true,            // Detect idle users
    detectExtensions: true,      // Detect browser extension injection
    idleTimeoutSec: 120,         // Seconds before idle violation
    autoFlagThreshold: 15,       // Total weight points before auto-flag
    autoBanThreshold: 30,        // Total weight points before auto-ban suggestion
  },
  violations: [],                // All violations across all users
  userScores: new Map(),         // userId -> { totalWeight, violations[], flagged, username }
  flaggedUsers: new Set(),       // userIds flagged for review
  startedAt: null,
};

// ─── Core Functions ───────────────────────────────────────────────────

function enableAnticheat(settings = {}) {
  anticheatState.enabled = true;
  anticheatState.startedAt = Date.now();
  Object.assign(anticheatState.settings, settings);
  console.log('[AntiCheat] ENABLED with settings:', JSON.stringify(anticheatState.settings));
}

function disableAnticheat() {
  anticheatState.enabled = false;
  console.log('[AntiCheat] DISABLED');
}

function resetAnticheat() {
  anticheatState.violations = [];
  anticheatState.userScores.clear();
  anticheatState.flaggedUsers.clear();
  anticheatState.startedAt = null;
  console.log('[AntiCheat] RESET — all violations cleared');
}

function getSettings() {
  return { ...anticheatState.settings };
}

function updateSettings(newSettings) {
  Object.assign(anticheatState.settings, newSettings);
  return getSettings();
}

function addViolation(userId, username, violationType, metadata = {}) {
  if (!anticheatState.enabled) return null;

  const vType = VIOLATION_TYPES[violationType];
  if (!vType) return null;

  // Check if this detection type is enabled in settings
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
    SCREENSHOT: 'detectScreenshot',
    EXTENSION_INJECT: 'detectExtensions',
    IDLE_TIMEOUT: 'detectIdle',
  };

  if (settingMap[violationType] && !anticheatState.settings[settingMap[violationType]]) {
    return null; // This detection type is disabled
  }

  // Rate-limit: max 1 violation of same type per user per 3 seconds
  const recentCutoff = Date.now() - 3000;
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
    timestamp: Date.now(),
    metadata,
  };

  anticheatState.violations.push(violation);

  // Keep last 1000 violations max
  if (anticheatState.violations.length > 1000) {
    anticheatState.violations = anticheatState.violations.slice(-500);
  }

  // Update user score
  let userScore = anticheatState.userScores.get(userId);
  if (!userScore) {
    userScore = { totalWeight: 0, violations: [], flagged: false, username };
    anticheatState.userScores.set(userId, userScore);
  }
  userScore.totalWeight += vType.weight;
  userScore.violations.push(violation);
  userScore.username = username;

  // Keep last 200 violations per user
  if (userScore.violations.length > 200) {
    userScore.violations = userScore.violations.slice(-100);
  }

  // Auto-flag check
  if (userScore.totalWeight >= anticheatState.settings.autoFlagThreshold && !userScore.flagged) {
    userScore.flagged = true;
    anticheatState.flaggedUsers.add(userId);
    console.log(`[AntiCheat] AUTO-FLAGGED: ${username} (${userId}) — weight: ${userScore.totalWeight}`);
  }

  return violation;
}

function getUserScore(userId) {
  return anticheatState.userScores.get(userId) || null;
}

function getAllUserScores() {
  const scores = [];
  for (const [userId, data] of anticheatState.userScores) {
    scores.push({
      userId,
      username: data.username,
      totalWeight: data.totalWeight,
      violationCount: data.violations.length,
      flagged: data.flagged,
      reachedBanThreshold: data.totalWeight >= anticheatState.settings.autoBanThreshold,
      lastViolation: data.violations.length > 0 ? data.violations[data.violations.length - 1] : null,
      violationsByType: countByType(data.violations),
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

function getRecentViolations(limit = 50) {
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
    recentViolations: getRecentViolations(100),
    flaggedUserIds: [...anticheatState.flaggedUsers],
  };
}

module.exports = {
  VIOLATION_TYPES,
  enableAnticheat,
  disableAnticheat,
  resetAnticheat,
  getSettings,
  updateSettings,
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
