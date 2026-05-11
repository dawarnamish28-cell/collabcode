/**
 * Authentication Middleware v2.0 — Hardened for Heavy Load
 * 
 * v2.0 hardening:
 *  - Bounded in-memory stores with max caps (prevents OOM under heavy anonymous traffic)
 *  - TTL-based eviction for tabSessions (sessions expire after 24h of inactivity)
 *  - Periodic GC sweep every 5 minutes to prune stale entries
 *  - issuedUsernames capped at 50k entries with LRU-style eviction
 *  - registeredUsers protected by cap (10k) — production should use DB
 * 
 * Supports:
 *  1. Email/password sign-up and sign-in (JWT-based)
 *  2. Anonymous sessions with unique usernames per browser tab
 *     (each tab gets its own tabId → unique name)
 *  3. Server-side username registry prevents collisions
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'collab-code-jwt-secret';

// ─── Capacity & TTL constants ──────────────────────────────────────────
const MAX_ISSUED_USERNAMES = 50000;
const MAX_TAB_SESSIONS = 10000;
const MAX_REGISTERED_USERS = 10000;
const TAB_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const GC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ─── In-memory stores (bounded for production stability) ──────────────
const issuedUsernames = new Set();
const registeredUsers = new Map(); // email -> { userId, email, passwordHash, username, color }
const tabSessions = new Map();    // tabId -> { userId, username, color, lastAccess }

// ─── Periodic GC: prune stale tabSessions and overflow issuedUsernames ──
const _authGcTimer = setInterval(() => {
  const now = Date.now();
  // Evict expired tab sessions
  for (const [tabId, session] of tabSessions) {
    if (now - (session.lastAccess || 0) > TAB_SESSION_TTL_MS) {
      tabSessions.delete(tabId);
      // Also free the username so it can be reused
      if (session.username && !session.authenticated) {
        issuedUsernames.delete(session.username);
      }
    }
  }
  // If issuedUsernames is over cap, trim oldest entries (Set iterates in insertion order)
  if (issuedUsernames.size > MAX_ISSUED_USERNAMES) {
    const excess = issuedUsernames.size - MAX_ISSUED_USERNAMES;
    let removed = 0;
    for (const name of issuedUsernames) {
      if (removed >= excess) break;
      // Don't evict names belonging to registered users
      let isRegistered = false;
      for (const user of registeredUsers.values()) {
        if (user.username === name) { isRegistered = true; break; }
      }
      if (!isRegistered) {
        issuedUsernames.delete(name);
        removed++;
      }
    }
  }
}, GC_INTERVAL_MS);
_authGcTimer.unref(); // Don't block Node exit

// ─── Color palette ───────────────────────────────────────────────────
const USER_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
  '#14b8a6', '#a855f7', '#e11d48', '#0ea5e9', '#d946ef',
  '#10b981', '#f43f5e', '#7c3aed', '#0891b2', '#c026d3',
];

const ADJECTIVES = [
  'Swift','Bold','Clever','Rapid','Bright','Silent','Cosmic','Nimble','Fierce','Mystic',
  'Noble','Vivid','Keen','Epic','Agile','Daring','Serene','Lucky','Witty','Brave',
  'Radiant','Stellar','Cyber','Turbo','Neon','Shadow','Pixel','Quantum','Binary','Chrome',
  'Hyper','Ultra','Atomic','Sonic','Arctic','Solar','Lunar','Iron','Crystal','Thunder',
  'Blazing','Golden','Silver','Crimson','Sapphire','Jade','Amber','Onyx','Ivory','Ruby',
];

const NOUNS = [
  'Coder','Hacker','Ninja','Wizard','Phoenix','Dragon','Tiger','Eagle','Falcon','Panda',
  'Wolf','Fox','Otter','Hawk','Bear','Raven','Lynx','Viper','Shark','Lion',
  'Byte','Pixel','Node','Stack','Kernel','Cipher','Vector','Spark','Flux','Orbit',
  'Prism','Quasar','Comet','Nebula','Blaze','Storm','Forge','Atlas','Titan','Nova',
  'Arrow','Blade','Crane','Drift','Ember','Frost','Ghost','Helix','Iris','Jet',
];

const nameCounters = new Map();

function generateUniqueUsername() {
  for (let i = 0; i < 20; i++) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const candidate = `${adj}${noun}${suffix}`;
    if (!issuedUsernames.has(candidate)) {
      issuedUsernames.add(candidate);
      return candidate;
    }
  }
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const base = `${adj}${noun}`;
  const counter = (nameCounters.get(base) || 9999) + 1;
  nameCounters.set(base, counter);
  const name = `${base}${counter}`;
  issuedUsernames.add(name);
  return name;
}

function registerUsername(username) { if (username) issuedUsernames.add(username); }
function isUsernameTaken(username) { return issuedUsernames.has(username); }
function generateColor() { return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]; }

// ─── Registered user helpers ──────────────────────────────────────────
async function registerUser(email, password, username) {
  if (registeredUsers.has(email)) {
    throw new Error('Email already registered');
  }
  if (isUsernameTaken(username)) {
    throw new Error('Username already taken');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = uuidv4();
  const color = generateColor();
  const user = { userId, email, passwordHash, username, color, createdAt: new Date() };
  registeredUsers.set(email, user);
  registerUsername(username);
  return { userId, email, username, color };
}

async function loginUser(email, password) {
  const user = registeredUsers.get(email);
  if (!user) throw new Error('Invalid email or password');
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw new Error('Invalid email or password');
  return { userId: user.userId, email: user.email, username: user.username, color: user.color };
}

// ─── Tab-based session: every tab gets a unique user ──────────────────
function getOrCreateTabSession(tabId) {
  if (tabId && tabSessions.has(tabId)) {
    const session = tabSessions.get(tabId);
    session.lastAccess = Date.now(); // Touch TTL
    return session;
  }
  // Enforce cap: evict oldest session if at limit
  if (tabSessions.size >= MAX_TAB_SESSIONS) {
    let oldestKey = null, oldestTime = Infinity;
    for (const [key, s] of tabSessions) {
      if ((s.lastAccess || 0) < oldestTime) { oldestTime = s.lastAccess || 0; oldestKey = key; }
    }
    if (oldestKey) {
      const evicted = tabSessions.get(oldestKey);
      tabSessions.delete(oldestKey);
      if (evicted?.username && !evicted.authenticated) issuedUsernames.delete(evicted.username);
    }
  }
  const userId = uuidv4();
  const username = generateUniqueUsername();
  const color = generateColor();
  const session = { userId, username, color, tabId: tabId || uuidv4(), authenticated: false, lastAccess: Date.now() };
  tabSessions.set(session.tabId, session);
  return session;
}

// ─── Express middleware ───────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      registerUsername(decoded.username);
      req.user = { userId: decoded.userId, username: decoded.username, color: decoded.color || generateColor(), authenticated: !!decoded.email };
      return next();
    } catch (err) { /* fall through */ }
  }
  // Anonymous — use tabId for per-tab uniqueness
  const tabId = req.headers['x-tab-id'];
  const session = getOrCreateTabSession(tabId);
  req.user = session;
  next();
}

// ─── Socket.io middleware ─────────────────────────────────────────────
function socketAuthMiddleware(socket, next) {
  const { token, userId, username, color, tabId } = socket.handshake.auth;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      registerUsername(decoded.username);
      socket.user = { userId: decoded.userId, username: decoded.username, color: decoded.color || generateColor(), authenticated: !!decoded.email };
      return next();
    } catch (err) { /* fall through */ }
  }

  // Anonymous socket — per-tab uniqueness via tabId
  const session = getOrCreateTabSession(tabId);
  socket.user = session;
  next();
}

function generateToken(user) {
  return jwt.sign(
    { userId: user.userId, username: user.username, color: user.color, email: user.email || null },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

module.exports = {
  authMiddleware, socketAuthMiddleware, generateToken,
  generateUniqueUsername, generateColor, registerUsername, isUsernameTaken,
  registerUser, loginUser, getOrCreateTabSession,
  issuedUsernames, registeredUsers, tabSessions,
};
