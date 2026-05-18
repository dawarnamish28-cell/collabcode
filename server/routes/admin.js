/**
 * Admin Routes v3.0 — Phase 4: Enhanced Admin Features
 * 
 * Features:
 *  - Admin login with JWT-protected endpoints
 *  - Global room lock/unlock (start/stop coding)
 *  - Competition mode toggle (normal/competition)
 *  - Fullscreen violation alerts via Socket.IO
 *  - Room listing with detailed stats
 *  - Custom room naming support
 *  - Admin dashboard served as HTML
 * 
 * made with <3 by Namish
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'collabcode-admin-secret-key-2024';
const ADMIN_TOKEN_EXPIRY = '12h';

// ─── Admin credentials (configurable via env) ──────────────────────────
// Default: admin / collabcode-admin
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH_PROMISE = bcrypt.hash(process.env.ADMIN_PASSWORD || 'collabcode-admin', 10);

// ─── Competition State (global singleton) ───────────────────────────────
const competitionState = {
  mode: 'normal',           // 'normal' | 'competition'
  roomsLocked: false,       // true = coding disabled globally
  lockedAt: null,
  unlockedAt: null,
  modeChangedAt: null,
  fullscreenViolations: [], // { userId, username, roomId, roomName, timestamp }
};

function getCompetitionState() {
  return { ...competitionState, fullscreenViolations: [...competitionState.fullscreenViolations] };
}

function clearViolations() {
  competitionState.fullscreenViolations = [];
}

function addViolation(violation) {
  competitionState.fullscreenViolations.push({
    ...violation,
    timestamp: Date.now(),
  });
  // Cap at 500 violations
  if (competitionState.fullscreenViolations.length > 500) {
    competitionState.fullscreenViolations = competitionState.fullscreenViolations.slice(-500);
  }
}

// ─── Admin JWT middleware ────────────────────────────────────────────────
function adminAuthMiddleware(req, res, next) {
  const token = req.cookies?.admin_token || req.headers['x-admin-token'];
  if (!token) {
    return res.status(401).json({ error: true, message: 'Admin authentication required' });
  }
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.role !== 'admin') throw new Error('Not admin');
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: true, message: 'Invalid or expired admin token' });
  }
}

// ─── Admin Login ────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: true, message: 'Username and password required' });
  }

  const adminHash = await ADMIN_PASSWORD_HASH_PROMISE;
  const usernameMatch = username === ADMIN_USERNAME;
  const passwordMatch = await bcrypt.compare(password, adminHash);

  if (!usernameMatch || !passwordMatch) {
    return res.status(401).json({ error: true, message: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { role: 'admin', username: ADMIN_USERNAME },
    ADMIN_JWT_SECRET,
    { expiresIn: ADMIN_TOKEN_EXPIRY }
  );

  // Set as httpOnly cookie for dashboard, also return in body for API use
  res.cookie('admin_token', token, {
    httpOnly: true,
    maxAge: 12 * 60 * 60 * 1000, // 12h
    sameSite: 'lax',
    path: '/',
  });

  res.json({ success: true, token, username: ADMIN_USERNAME });
});

// ─── Admin Logout ───────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('admin_token', { path: '/' });
  res.json({ success: true });
});

// ─── Verify Admin Session ───────────────────────────────────────────────
router.get('/verify', adminAuthMiddleware, (req, res) => {
  res.json({ valid: true, username: req.admin.username });
});

// ─── Get Competition State ──────────────────────────────────────────────
router.get('/competition', adminAuthMiddleware, (req, res) => {
  res.json(getCompetitionState());
});

// ─── Toggle Room Lock (start/stop coding) ───────────────────────────────
router.post('/competition/lock', adminAuthMiddleware, (req, res) => {
  const { locked } = req.body;
  const io = req.app.get('io');

  competitionState.roomsLocked = !!locked;
  if (locked) {
    competitionState.lockedAt = Date.now();
    competitionState.unlockedAt = null;
  } else {
    competitionState.unlockedAt = Date.now();
  }

  // Broadcast to ALL connected clients
  if (io) {
    io.emit('competition:lock-change', {
      locked: competitionState.roomsLocked,
      timestamp: Date.now(),
    });
  }

  console.log(`[Admin] Rooms ${locked ? 'LOCKED' : 'UNLOCKED'} globally`);
  res.json({ success: true, roomsLocked: competitionState.roomsLocked });
});

// ─── Toggle Competition Mode ────────────────────────────────────────────
router.post('/competition/mode', adminAuthMiddleware, (req, res) => {
  const { mode } = req.body;
  if (!['normal', 'competition'].includes(mode)) {
    return res.status(400).json({ error: true, message: 'Mode must be "normal" or "competition"' });
  }

  const io = req.app.get('io');
  competitionState.mode = mode;
  competitionState.modeChangedAt = Date.now();

  // If switching to normal, clear violations
  if (mode === 'normal') {
    clearViolations();
  }

  // Broadcast to ALL connected clients
  if (io) {
    io.emit('competition:mode-change', {
      mode: competitionState.mode,
      timestamp: Date.now(),
    });
  }

  console.log(`[Admin] Competition mode: ${mode}`);
  res.json({ success: true, mode: competitionState.mode });
});

// ─── Clear Fullscreen Violations ────────────────────────────────────────
router.post('/competition/clear-violations', adminAuthMiddleware, (req, res) => {
  clearViolations();
  res.json({ success: true });
});

// ─── Get Rooms with Detailed Stats ──────────────────────────────────────
router.get('/rooms', adminAuthMiddleware, (req, res) => {
  const getActiveRooms = req.app.get('getActiveRooms');
  if (!getActiveRooms) {
    return res.json({ rooms: [] });
  }
  const rooms = getActiveRooms();
  res.json({ rooms, total: rooms.length });
});

// ─── Get Health Stats ───────────────────────────────────────────────────
router.get('/health', adminAuthMiddleware, (req, res) => {
  const getHealthStats = req.app.get('getHealthStats');
  const mem = process.memoryUsage();
  res.json({
    ...( getHealthStats ? getHealthStats() : {}),
    competition: getCompetitionState(),
    uptime: process.uptime(),
    memory: {
      rss: Math.round(mem.rss / 1048576),
      heapUsed: Math.round(mem.heapUsed / 1048576),
      heapTotal: Math.round(mem.heapTotal / 1048576),
    },
  });
});

// ─── Rename Room ────────────────────────────────────────────────────────
router.post('/rooms/:roomId/rename', adminAuthMiddleware, (req, res) => {
  const { roomId } = req.params;
  const { name } = req.body;
  const renameRoom = req.app.get('renameRoom');
  if (!renameRoom) {
    return res.status(500).json({ error: true, message: 'Room rename not available' });
  }
  if (!name || typeof name !== 'string' || name.length > 50) {
    return res.status(400).json({ error: true, message: 'Name must be 1-50 characters' });
  }
  const success = renameRoom(roomId, name.trim());
  if (!success) {
    return res.status(404).json({ error: true, message: 'Room not found' });
  }
  res.json({ success: true, roomId, name: name.trim() });
});

// ─── Kick User from Room ───────────────────────────────────────────────
router.post('/rooms/:roomId/kick/:socketId', adminAuthMiddleware, (req, res) => {
  const { roomId, socketId } = req.params;
  const kickUser = req.app.get('kickUser');
  const io = req.app.get('io');
  
  if (!kickUser || !io) {
    return res.status(500).json({ error: true, message: 'Kick functionality not available' });
  }

  const result = kickUser(socketId, io);
  if (!result.success) {
    return res.status(404).json({ error: true, message: result.reason || 'User not found' });
  }

  console.log(`[Admin] Kicked ${result.username} from room ${roomId}`);
  res.json({ success: true, username: result.username, roomId });
});

// ─── v3: Broadcast Message to All Users ─────────────────────────────────
router.post('/broadcast', adminAuthMiddleware, (req, res) => {
  const { message, type } = req.body;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: true, message: 'Message is required' });
  }
  if (message.length > 500) {
    return res.status(400).json({ error: true, message: 'Message must be under 500 characters' });
  }
  const io = req.app.get('io');
  if (!io) {
    return res.status(500).json({ error: true, message: 'Socket.IO not available' });
  }
  io.emit('admin:broadcast', {
    message: message.trim(),
    type: type || 'info', // info | warning | success
    timestamp: Date.now(),
    from: 'Admin',
  });
  console.log(`[Admin] Broadcast: "${message.trim()}" (type: ${type || 'info'})`);
  res.json({ success: true, message: message.trim() });
});

// ─── v3: Force Disconnect All Users ─────────────────────────────────────
router.post('/force-disconnect', adminAuthMiddleware, (req, res) => {
  const io = req.app.get('io');
  if (!io) {
    return res.status(500).json({ error: true, message: 'Socket.IO not available' });
  }
  const { reason } = req.body;
  const msg = reason || 'Admin has disconnected all users.';
  
  // Notify all users before disconnecting
  io.emit('admin:force-disconnect', {
    message: msg,
    timestamp: Date.now(),
  });
  
  // Disconnect all sockets after a brief delay
  setTimeout(() => {
    io.sockets.sockets.forEach((s) => {
      try { s.disconnect(true); } catch (e) {}
    });
  }, 500);
  
  console.log(`[Admin] Force disconnected all users: ${msg}`);
  res.json({ success: true, message: msg });
});

// ─── v3: Export Rooms Data as JSON ──────────────────────────────────────
router.get('/export/rooms', adminAuthMiddleware, (req, res) => {
  const getActiveRooms = req.app.get('getActiveRooms');
  if (!getActiveRooms) {
    return res.json({ rooms: [], exportedAt: Date.now() });
  }
  const rooms = getActiveRooms();
  const exportData = {
    exportedAt: new Date().toISOString(),
    serverUptime: process.uptime(),
    totalRooms: rooms.length,
    totalUsers: rooms.reduce((sum, r) => sum + r.userCount, 0),
    rooms: rooms.map(r => ({
      ...r,
      userDetails: r.userDetails.map(u => ({
        ...u,
        joinedAtFormatted: new Date(u.joinedAt).toISOString(),
        durationSec: Math.floor((Date.now() - u.joinedAt) / 1000),
      })),
    })),
  };
  res.json(exportData);
});

// ─── v3: Get Execution Stats ────────────────────────────────────────────
router.get('/stats/executions', adminAuthMiddleware, (req, res) => {
  const getExecStats = req.app.get('getExecStats');
  if (!getExecStats) {
    return res.json({ totalExecutions: 0, byLanguage: {}, recentErrors: 0 });
  }
  res.json(getExecStats());
});

// ─── v3: Ban User (temporary session ban) ───────────────────────────────
const bannedUsers = new Map(); // userId -> { reason, bannedAt, bannedBy }

router.post('/ban/:userId', adminAuthMiddleware, (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body;
  const io = req.app.get('io');
  
  bannedUsers.set(userId, {
    reason: reason || 'Banned by admin',
    bannedAt: Date.now(),
    bannedBy: req.admin.username,
  });
  
  // Disconnect all sockets for this user
  if (io) {
    io.sockets.sockets.forEach((s) => {
      if (s.user?.userId === userId) {
        s.emit('admin:banned', {
          message: reason || 'You have been banned by the admin.',
          timestamp: Date.now(),
        });
        setTimeout(() => { try { s.disconnect(true); } catch (e) {} }, 300);
      }
    });
  }
  
  console.log(`[Admin] Banned user: ${userId} (reason: ${reason || 'none'})`);
  res.json({ success: true, userId });
});

router.post('/unban/:userId', adminAuthMiddleware, (req, res) => {
  const { userId } = req.params;
  const deleted = bannedUsers.delete(userId);
  if (!deleted) {
    return res.status(404).json({ error: true, message: 'User not in ban list' });
  }
  console.log(`[Admin] Unbanned user: ${userId}`);
  res.json({ success: true, userId });
});

router.get('/bans', adminAuthMiddleware, (req, res) => {
  const bans = [];
  for (const [userId, info] of bannedUsers) {
    bans.push({ userId, ...info });
  }
  res.json({ bans, total: bans.length });
});

function isBanned(userId) {
  return bannedUsers.has(userId);
}

module.exports = {
  router,
  competitionState,
  getCompetitionState,
  addViolation,
  clearViolations,
  adminAuthMiddleware,
  isBanned,
};
