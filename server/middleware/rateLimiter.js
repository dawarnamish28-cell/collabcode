/**
 * Rate Limiting Middleware v15.0
 * 
 * Provides multiple rate limiters for different endpoints:
 * - General API rate limit (configurable via env)
 * - Execution endpoint (configurable via EXECUTION_RATE_LIMIT_MAX, default 60)
 * - Chat message sending
 * - Socket.io event rate limiting (in-memory per socket)
 * 
 * v15 changes:
 *  - Execution default raised 10 → 60
 *  - Retry-After header included in all limit responses
 *  - keyGenerator uses session or IP for execution limiter
 *  - Better error messages with countdown hint
 * 
 * made with <3 by Namish
 */

const rateLimit = require('express-rate-limit');

const EXEC_WINDOW_MS = parseInt(process.env.EXECUTION_RATE_LIMIT_WINDOW_MS) || 60000;
const EXEC_MAX = parseInt(process.env.EXECUTION_RATE_LIMIT_MAX) || 60;

// General API rate limiter
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000) / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for'] || req.ip || 'unknown';
  },
});

// Strict rate limiter for code execution — default 60/min
const executionLimiter = rateLimit({
  windowMs: EXEC_WINDOW_MS,
  max: EXEC_MAX,
  handler: (req, res) => {
    const retryAfter = Math.ceil(EXEC_WINDOW_MS / 1000);
    res.set('Retry-After', String(retryAfter));
    res.status(429).json({
      error: 'Execution rate limit exceeded',
      message: `Too many code execution requests. Wait ${retryAfter}s before running again.`,
      retryAfter,
      limit: EXEC_MAX,
      windowMs: EXEC_WINDOW_MS,
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use session ID or tab ID for per-user limiting, fallback to IP
    return req.headers['x-session-id'] || req.headers['x-tab-id'] || req.headers['x-forwarded-for'] || req.ip || 'unknown';
  },
});

// Chat message rate limiter
const chatLimiter = rateLimit({
  windowMs: 10000,
  max: 20,
  message: {
    error: 'Chat rate limit exceeded',
    message: 'Slow down! Too many messages.',
    retryAfter: 10,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Socket.io rate limiting (applied in-memory per socket)
function createSocketRateLimiter(maxEvents, windowMs) {
  const clients = new Map();

  return function checkRate(socketId) {
    const now = Date.now();
    let record = clients.get(socketId);

    if (!record) {
      record = { count: 0, resetAt: now + windowMs };
      clients.set(socketId, record);
    }

    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
    }

    record.count++;

    if (record.count > maxEvents) {
      return false; // Rate limited
    }
    return true;
  };
}

// Cleanup socket rate limiter entries
function cleanupSocketLimiter(socketId, limiters) {
  limiters.forEach(limiter => {
    if (limiter.clients) {
      limiter.clients.delete(socketId);
    }
  });
}

module.exports = {
  generalLimiter,
  executionLimiter,
  chatLimiter,
  createSocketRateLimiter,
  cleanupSocketLimiter,
};
