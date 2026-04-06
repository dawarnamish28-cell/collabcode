/**
 * Authentication Routes
 * 
 * POST /api/auth/anonymous   - Create anonymous session with UNIQUE username
 * GET  /api/auth/me          - Get current user info
 * GET  /api/auth/validate    - Validate session token
 * POST /api/auth/check-name  - Check if a username is available
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const {
  authMiddleware,
  generateToken,
  generateUniqueUsername,
  generateColor,
  registerUsername,
  isUsernameTaken,
} = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Create anonymous session with guaranteed unique username
 */
router.post('/anonymous', asyncHandler(async (req, res) => {
  const userId = uuidv4();
  const color = generateColor();

  // If client requests a specific name, check uniqueness
  let username;
  const requestedName = (req.body.username || '').trim();

  if (requestedName && !isUsernameTaken(requestedName)) {
    username = requestedName;
    registerUsername(username);
  } else {
    // Generate a guaranteed-unique one
    username = generateUniqueUsername();
  }

  const token = generateToken({ userId, username, color });

  res.json({
    userId,
    username,
    color,
    token,
    authenticated: false,
    type: 'anonymous',
  });
}));

/**
 * Check if a username is available
 */
router.post('/check-name', asyncHandler(async (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ available: false, message: 'Username required' });
  }
  res.json({
    username,
    available: !isUsernameTaken(username),
  });
}));

/**
 * Get current user info (from token or anonymous)
 */
router.get('/me', authMiddleware, asyncHandler(async (req, res) => {
  res.json({
    userId: req.user.userId,
    username: req.user.username,
    color: req.user.color,
    authenticated: req.user.authenticated,
  });
}));

/**
 * Health check / session validation
 */
router.get('/validate', authMiddleware, asyncHandler(async (req, res) => {
  res.json({
    valid: true,
    user: req.user,
  });
}));

module.exports = router;
