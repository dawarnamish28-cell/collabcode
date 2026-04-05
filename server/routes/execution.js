/**
 * Execution Routes
 * 
 * POST /api/execute     - Execute code in specified language
 * GET  /api/languages   - Get supported languages
 */

const express = require('express');
const router = express.Router();
const { executeCode, getSupportedLanguages } = require('../controllers/executionController');
const { executionLimiter } = require('../middleware/rateLimiter');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// Execute code - rate limited and authenticated
router.post('/execute', authMiddleware, executionLimiter, asyncHandler(executeCode));

// Get supported languages
router.get('/languages', asyncHandler(getSupportedLanguages));

module.exports = router;
