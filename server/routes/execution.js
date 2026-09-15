/**
 * Execution Routes v7.0
 * 
 * POST /api/execute        - Execute code with security sandboxing + caching
 * POST /api/execute/cloud  - Cloud-only proxy (for legacy browser clients)
 * GET  /api/languages      - Get supported languages
 * GET  /api/exec-stats     - Execution metrics & stats (v7 NEW)
 */

const express = require('express');
const router = express.Router();
const { executeCode, executeCloudProxy, getSupportedLanguages, getExecutionStats } = require('../controllers/executionController');
const { executionLimiter } = require('../middleware/rateLimiter');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { sandboxMiddleware } = require('../middleware/sandbox');

// Execute code - rate limited, authenticated, and security-scanned
router.post('/execute', authMiddleware, executionLimiter, sandboxMiddleware, asyncHandler(executeCode));

// Cloud-only proxy — old client bundles call this instead of hitting Judge0 directly
// No sandbox middleware needed (no local execution), but still rate limited
router.post('/execute/cloud', authMiddleware, executionLimiter, asyncHandler(executeCloudProxy));

// Get supported languages
router.get('/languages', asyncHandler(getSupportedLanguages));

// v7: Execution stats & metrics
router.get('/exec-stats', asyncHandler(getExecutionStats));

module.exports = router;
