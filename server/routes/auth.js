/**
 * Authentication Routes
 * 
 * POST /api/auth/anonymous   - Create anonymous session
 * POST /api/auth/register    - Register with credentials (optional)
 * POST /api/auth/login       - Login with credentials (optional)
 * GET  /api/auth/me          - Get current user info
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware, generateToken, generateUsername, generateColor } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Create anonymous session
 * Returns a session ID and generated username
 */
router.post('/anonymous', asyncHandler(async (req, res) => {
  const userId = uuidv4();
  const username = req.body.username || generateUsername();
  const color = generateColor();

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
