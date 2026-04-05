/**
 * Authentication Middleware
 * 
 * Supports both JWT-authenticated and anonymous session-based users.
 * Anonymous users get generated usernames and temporary session IDs.
 */

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'collab-code-jwt-secret';

// Color palette for user avatars
const USER_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
  '#14b8a6', '#a855f7', '#e11d48', '#0ea5e9', '#d946ef',
];

// Adjective-noun username generator
const ADJECTIVES = [
  'Swift', 'Bold', 'Clever', 'Rapid', 'Bright', 'Silent', 'Cosmic',
  'Nimble', 'Fierce', 'Mystic', 'Noble', 'Vivid', 'Keen', 'Epic',
  'Agile', 'Daring', 'Serene', 'Lucky', 'Witty', 'Brave',
];

const NOUNS = [
  'Coder', 'Hacker', 'Ninja', 'Wizard', 'Phoenix', 'Dragon',
  'Tiger', 'Eagle', 'Falcon', 'Panda', 'Wolf', 'Fox', 'Otter',
  'Hawk', 'Bear', 'Raven', 'Lynx', 'Viper', 'Shark', 'Lion',
];

function generateUsername() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
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
      req.user = {
        userId: decoded.userId,
        username: decoded.username,
        color: decoded.color || generateColor(),
        authenticated: true,
      };
      return next();
    } catch (err) {
      // Token invalid/expired - fall through to anonymous
      console.warn('[Auth] Invalid JWT token, falling back to anonymous');
    }
  }

  // Anonymous session user
  req.user = {
    userId: req.headers['x-session-id'] || uuidv4(),
    username: req.headers['x-username'] || generateUsername(),
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

  // Anonymous socket user
  socket.user = {
    userId: userId || uuidv4(),
    username: username || generateUsername(),
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
  generateUsername,
  generateColor,
};
