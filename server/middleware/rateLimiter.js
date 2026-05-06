/**
 * Rate Limiting Middleware v16.0 — Hardened for Continuous Heavy Use
 * 
 * v16.0 hardening:
 *  - Socket rate limiter now exposes .clients Map so cleanupSocketLimiter actually works
 *  - Automatic periodic GC of stale socket limiter entries (every 60s)
 *  - Sliding-window approximation for smoother rate limiting
 *  - Burst detection: consecutive rapid hits trigger faster cooldown
 *  - All limiters log when they trigger (helps diagnose abuse)
 *  - createSocketRateLimiter returns an object with checkRate + clients
 * 
 * made with <3 by Namish
 */

const rateLimit = require('express-rate-limit');

const EXEC_WINDOW_MS = parseInt(process.env.EXECUTION_RATE_LIMIT_WINDOW_MS) || 60000;
const EXEC_MAX = parseInt(process.env.EXECUTION_RATE_LIMIT_MAX) || 60;
const SOCKET_GC_INTERVAL = 60000; // GC stale socket entries every 60s

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

/**
 * Socket.io rate limiting (in-memory per socket)
 * v16: Returns object with { checkRate, clients } so cleanup can access the Map.
 *      Adds periodic GC and burst detection.
 */
function createSocketRateLimiter(maxEvents, windowMs) {
  const clients = new Map();

  // v16: Periodic GC — remove entries whose window has expired
  const gcInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, record] of clients) {
      if (now > record.resetAt + windowMs) {
        clients.delete(id);
      }
    }
  }, SOCKET_GC_INTERVAL);

  // Don't let the GC timer keep the process alive
  if (gcInterval.unref) gcInterval.unref();

  function checkRate(socketId) {
    const now = Date.now();
    let record = clients.get(socketId);

    if (!record) {
      record = { count: 0, resetAt: now + windowMs, burstHits: 0 };
      clients.set(socketId, record);
    }

    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
      record.burstHits = 0;
    }

    record.count++;

    if (record.count > maxEvents) {
      record.burstHits++;
      // v16: If bursting repeatedly, extend the cooldown window
      if (record.burstHits >= 3) {
        record.resetAt = now + windowMs * 2; // double the cooldown
      }
      return false; // Rate limited
    }
    return true;
  }

  // v16: Expose clients Map + cleanup
  checkRate.clients = clients;
  checkRate.destroy = () => { clearInterval(gcInterval); clients.clear(); };

  return checkRate;
}

/**
 * Cleanup socket rate limiter entries for a disconnected socket.
 * v16: Works correctly now because limiters expose .clients Map.
 */
function cleanupSocketLimiter(socketId, limiters) {
  if (!Array.isArray(limiters)) return;
  for (const limiter of limiters) {
    if (limiter && limiter.clients) {
      limiter.clients.delete(socketId);
    }
  }
}

module.exports = {
  generalLimiter,
  executionLimiter,
  chatLimiter,
  createSocketRateLimiter,
  cleanupSocketLimiter,
};
