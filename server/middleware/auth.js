/**
 * Authentication Middleware
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

// ─── In-memory stores (replace with DB in production) ─────────────────
const issuedUsernames = new Set();
const registeredUsers = new Map(); // email -> { userId, email, passwordHash, username, color }
const tabSessions = new Map();    // tabId -> { userId, username, color }

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
    return tabSessions.get(tabId);
  }
  const userId = uuidv4();
  const username = generateUniqueUsername();
  const color = generateColor();
  const session = { userId, username, color, tabId: tabId || uuidv4(), authenticated: false };
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
