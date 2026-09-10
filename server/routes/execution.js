/**
 * Execution Routes v7.0
 * 
 * POST /api/execute     - Execute code with security sandboxing + caching
 * GET  /api/languages   - Get supported languages
 * GET  /api/exec-stats  - Execution metrics & stats (v7 NEW)
 */

const express = require('express');
const router = express.Router();
const { executeCode, getSupportedLanguages, getExecutionStats } = require('../controllers/executionController');
const { executionLimiter } = require('../middleware/rateLimiter');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { sandboxMiddleware } = require('../middleware/sandbox');

// Execute code - rate limited, authenticated, and security-scanned
router.post('/execute', authMiddleware, executionLimiter, sandboxMiddleware, asyncHandler(executeCode));

// Get supported languages
router.get('/languages', asyncHandler(getSupportedLanguages));

// v7: Execution stats & metrics
router.get('/exec-stats', asyncHandler(getExecutionStats));

module.exports = router;
