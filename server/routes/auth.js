/**
 * Authentication Routes
 * 
 * POST /api/auth/signup    - Register with email/password/username
 * POST /api/auth/signin    - Login with email/password
 * POST /api/auth/anonymous - Create anonymous session (per-tab unique)
 * GET  /api/auth/validate  - Validate session token
 * POST /api/auth/check-name - Check username availability
 */

const express = require('express');
const router = express.Router();
const {
  authMiddleware, generateToken,
  generateUniqueUsername, generateColor,
  registerUsername, isUsernameTaken,
  registerUser, loginUser, getOrCreateTabSession,
} = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Sign Up with email + password + username
 */
router.post('/signup', asyncHandler(async (req, res) => {
  const { email, password, username } = req.body;
  if (!email || !password || !username) {
    return res.status(400).json({ error: true, message: 'Email, password, and username are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: true, message: 'Password must be at least 6 characters' });
  }
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: true, message: 'Username must be 3-20 characters' });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: true, message: 'Username can only contain letters, numbers, and underscores' });
  }

  try {
    const user = await registerUser(email, password, username);
    const token = generateToken({ ...user, email });
    res.json({ ...user, token, authenticated: true, type: 'registered' });
  } catch (err) {
    res.status(409).json({ error: true, message: err.message });
  }
}));

/**
 * Sign In with email + password
 */
router.post('/signin', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: true, message: 'Email and password are required' });
  }

  try {
    const user = await loginUser(email, password);
    const token = generateToken({ ...user, email });
    res.json({ ...user, token, authenticated: true, type: 'registered' });
  } catch (err) {
    res.status(401).json({ error: true, message: err.message });
  }
}));

/**
 * Anonymous session — each tab gets a UNIQUE username via tabId
 */
router.post('/anonymous', asyncHandler(async (req, res) => {
  const tabId = req.body.tabId || req.headers['x-tab-id'];
  const session = getOrCreateTabSession(tabId);
  const token = generateToken(session);

  res.json({
    ...session,
    token,
    authenticated: false,
    type: 'anonymous',
  });
}));

/**
 * Check username availability
 */
router.post('/check-name', asyncHandler(async (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ available: false, message: 'Username required' });
  }
  res.json({ username, available: !isUsernameTaken(username) });
}));

/**
 * Validate session
 */
router.get('/validate', authMiddleware, asyncHandler(async (req, res) => {
  res.json({ valid: true, user: req.user });
}));

module.exports = router;
