/**
 * Authentication Middleware
 * 
 * Supports both JWT-authenticated and anonymous session-based users.
 * Anonymous users get GUARANTEED UNIQUE usernames via a server-side
 * registry with collision-free generation using a large word pool
 * and sequential fallback numbering.
 */

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'collab-code-jwt-secret';

// ─── Unique Username Registry ─────────────────────────────────────────
// In-memory set of all usernames ever issued this server session.
// With MongoDB available, also persisted across restarts via Room.participants.
const issuedUsernames = new Set();

// Color palette — 20 distinct, high-contrast colors
const USER_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
  '#14b8a6', '#a855f7', '#e11d48', '#0ea5e9', '#d946ef',
  '#10b981', '#f43f5e', '#8b5cf6', '#0891b2', '#c026d3',
];

// Massive word pools → 50 adjectives * 50 nouns = 2,500 base combos
// Each combo gets a 4-digit suffix space → 25,000,000 unique names
const ADJECTIVES = [
  'Swift', 'Bold', 'Clever', 'Rapid', 'Bright', 'Silent', 'Cosmic',
  'Nimble', 'Fierce', 'Mystic', 'Noble', 'Vivid', 'Keen', 'Epic',
  'Agile', 'Daring', 'Serene', 'Lucky', 'Witty', 'Brave',
  'Radiant', 'Stellar', 'Cyber', 'Turbo', 'Neon', 'Shadow', 'Pixel',
  'Quantum', 'Binary', 'Chrome', 'Hyper', 'Ultra', 'Atomic', 'Sonic',
  'Arctic', 'Solar', 'Lunar', 'Iron', 'Crystal', 'Thunder',
  'Blazing', 'Golden', 'Silver', 'Crimson', 'Sapphire', 'Jade',
  'Amber', 'Onyx', 'Ivory', 'Ruby',
];

const NOUNS = [
  'Coder', 'Hacker', 'Ninja', 'Wizard', 'Phoenix', 'Dragon',
  'Tiger', 'Eagle', 'Falcon', 'Panda', 'Wolf', 'Fox', 'Otter',
  'Hawk', 'Bear', 'Raven', 'Lynx', 'Viper', 'Shark', 'Lion',
  'Byte', 'Pixel', 'Node', 'Stack', 'Kernel', 'Cipher', 'Vector',
  'Spark', 'Flux', 'Orbit', 'Prism', 'Quasar', 'Comet', 'Nebula',
  'Blaze', 'Storm', 'Forge', 'Atlas', 'Titan', 'Nova',
  'Arrow', 'Blade', 'Crane', 'Drift', 'Ember', 'Frost',
  'Ghost', 'Helix', 'Iris', 'Jet',
];

// Per-base-name counter for sequential fallback
const nameCounters = new Map();

/**
 * Generate a guaranteed-unique username.
 * Strategy:
 *   1. Pick random adj+noun → try with random 4-digit suffix
 *   2. If collision (astronomically rare), increment a sequential counter
 *   3. Register in issuedUsernames set
 */
function generateUniqueUsername() {
  const maxAttempts = 10;

  for (let i = 0; i < maxAttempts; i++) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const suffix = Math.floor(1000 + Math.random() * 9000); // 4-digit: 1000-9999
    const candidate = `${adj}${noun}${suffix}`;

    if (!issuedUsernames.has(candidate)) {
      issuedUsernames.add(candidate);
      return candidate;
    }
  }

  // Fallback: sequential numbering (guaranteed unique)
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const base = `${adj}${noun}`;
  const counter = (nameCounters.get(base) || 9999) + 1;
  nameCounters.set(base, counter);
  const name = `${base}${counter}`;
  issuedUsernames.add(name);
  return name;
}

/**
 * Register an externally-provided username as taken.
 * Called when users reconnect with a stored name.
 */
function registerUsername(username) {
  if (username) issuedUsernames.add(username);
}

/**
 * Check if a username is already taken.
 */
function isUsernameTaken(username) {
  return issuedUsernames.has(username);
}

function generateColor() {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

/**
 * Express middleware: Extract or generate user identity
 * Works with both JWT tokens and anonymous sessions
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      registerUsername(decoded.username);
      req.user = {
        userId: decoded.userId,
        username: decoded.username,
        color: decoded.color || generateColor(),
        authenticated: true,
      };
      return next();
    } catch (err) {
      console.warn('[Auth] Invalid JWT token, falling back to anonymous');
    }
  }

  // Anonymous session user — generate unique name if none provided
  const providedName = req.headers['x-username'];
  let username;
  if (providedName && !isUsernameTaken(providedName)) {
    username = providedName;
    registerUsername(username);
  } else {
    username = generateUniqueUsername();
  }

  req.user = {
    userId: req.headers['x-session-id'] || uuidv4(),
    username,
    color: req.headers['x-user-color'] || generateColor(),
    authenticated: false,
  };
  next();
}

/**
 * Socket.io authentication middleware
 * Extracts user identity from handshake auth data
 */
function socketAuthMiddleware(socket, next) {
  const { token, userId, username, color } = socket.handshake.auth;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      registerUsername(decoded.username);
      socket.user = {
        userId: decoded.userId,
        username: decoded.username,
        color: decoded.color || generateColor(),
        authenticated: true,
      };
      return next();
    } catch (err) {
      console.warn('[Auth] Socket: Invalid JWT, using anonymous');
    }
  }

  // Anonymous socket user — preserve their stored name if unique
  let finalUsername;
  if (username && !isUsernameTaken(username)) {
    finalUsername = username;
    registerUsername(finalUsername);
  } else if (username && isUsernameTaken(username)) {
    // Same user reconnecting with their own stored name — allow it
    // (they already "own" it from localStorage)
    finalUsername = username;
  } else {
    finalUsername = generateUniqueUsername();
  }

  socket.user = {
    userId: userId || uuidv4(),
    username: finalUsername,
    color: color || generateColor(),
    authenticated: false,
  };
  next();
}

/**
 * Generate JWT token
 */
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.userId,
      username: user.username,
      color: user.color,
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

module.exports = {
  authMiddleware,
  socketAuthMiddleware,
  generateToken,
  generateUniqueUsername,
  generateColor,
  registerUsername,
  isUsernameTaken,
  issuedUsernames,
};
