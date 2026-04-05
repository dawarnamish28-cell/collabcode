/**
 * Rate Limiting Middleware
 * 
 * Provides multiple rate limiters for different endpoints:
 * - General API rate limit
 * - Execution endpoint (stricter)
 * - Chat message sending
 */

const rateLimit = require('express-rate-limit');

// General API rate limiter
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for'] || req.ip || 'unknown';
  },
});

// Strict rate limiter for code execution
const executionLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: parseInt(process.env.EXECUTION_RATE_LIMIT_MAX) || 10,
  message: {
    error: 'Execution rate limit exceeded',
    message: 'Too many code execution requests. Please wait before running again.',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Chat message rate limiter
const chatLimiter = rateLimit({
  windowMs: 10000, // 10 seconds
  max: 20, // 20 messages per 10 seconds
  message: {
    error: 'Chat rate limit exceeded',
    message: 'Slow down! Too many messages.',
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
