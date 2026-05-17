/**
 * CollabCode Server v10.0 — Hardened for Continuous Heavy Use
 * 
 * v9.0 hardening:
 *  - Graceful shutdown with connection draining (waits for active requests)
 *  - uncaughtException / unhandledRejection handlers (log + controlled exit)
 *  - Periodic memory monitoring with heap pressure detection
 *  - Socket.io connection limits (max connections per IP)
 *  - Health endpoint with detailed server diagnostics
 *  - Request timeout protection
 *  - Coordinated shutdown: rooms → execution → sockets → HTTP → DB
 *  - Startup readiness check
 *
 * Express + Socket.io backend — 20 languages, persistent accounts,
 * saved workspaces, team permissions, video collaboration,
 * security sandboxing, templates.
 * 
 * made with <3 by Namish
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { connectDB, disconnectDB, getConnectionStatus } = require('./config/db');
const { socketAuthMiddleware } = require('./middleware/auth');
const { generalLimiter } = require('./middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { initRoomHandler, getActiveRooms, roomExists, gracefulShutdown: shutdownRooms, getHealthStats, renameRoom, kickUser } = require('./sockets/roomHandler');
const { cleanup: cleanupExecution } = require('./controllers/executionController');

const executionRoutes = require('./routes/execution');
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const galleryRoutes = require('./routes/gallery');
const workspaceRoutes = require('./routes/workspaces');
const teamRoutes = require('./routes/teams');
const { router: adminRoutes, competitionState, addViolation } = require('./routes/admin');
const cookieParser = require('cookie-parser');
const path = require('path');

const PORT = parseInt(process.env.PORT) || 4000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const SHUTDOWN_TIMEOUT = parseInt(process.env.SHUTDOWN_TIMEOUT_MS) || 15000;
const MAX_CONNECTIONS_PER_IP = parseInt(process.env.MAX_CONNECTIONS_PER_IP) || 20;
const MEMORY_CHECK_INTERVAL = parseInt(process.env.MEMORY_CHECK_INTERVAL_MS) || 60000;
const HEAP_PRESSURE_THRESHOLD = 0.9; // 90% of max heap

let isReady = false;
let isShuttingDown = false;
let activeRequests = 0;

const app = express();
const server = http.createServer(app);

// ─── v9: Request timeout + tracking ───────────────────────────────────
server.timeout = 30000; // 30s request timeout
server.keepAliveTimeout = 65000; // slightly > typical LB timeout (60s)
server.headersTimeout = 70000;

// v9: Track active requests for graceful shutdown
// v10 fix: 'finish' and 'close' both fire on every response — use a flag to decrement only once
app.use((req, res, next) => {
  if (isShuttingDown) {
    return res.status(503).json({ error: true, message: 'Server is shutting down' });
  }
  activeRequests++;
  let decremented = false;
  const onDone = () => {
    if (!decremented) {
      decremented = true;
      activeRequests--;
    }
  };
  res.on('finish', onDone);
  res.on('close', onDone);
  next();
});

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin: function(origin, callback) { callback(null, true); },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id', 'x-username', 'x-user-color', 'x-tab-id'],
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use('/api/', generalLimiter);

// ─── Admin Dashboard (served from /admin) ───────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.use('/admin/api', adminRoutes);

// ─── REST Routes ──────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api', executionRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/teams', teamRoutes);

// v9: Enhanced health endpoint with diagnostics
app.get('/api/health', (req, res) => {
  const mem = process.memoryUsage();
  const roomStats = getHealthStats();
  res.json({
    status: isReady ? 'ok' : 'starting',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '11.0',
    database: getConnectionStatus() ? 'connected' : 'disconnected',
    rooms: roomStats.rooms,
    totalUsers: roomStats.totalUsers,
    activeRequests,
    memory: {
      rss: Math.round(mem.rss / 1048576),
      heapUsed: Math.round(mem.heapUsed / 1048576),
      heapTotal: Math.round(mem.heapTotal / 1048576),
      external: Math.round(mem.external / 1048576),
    },
    roomHealth: roomStats,
  });
});

// Room list — includes public/private info and language
app.get('/api/rooms', (req, res) => {
  const showPublic = req.query.public === 'true';
  const allRooms = getActiveRooms();
  const filtered = showPublic ? allRooms.filter(r => r.isPublic) : allRooms;
  res.json({ rooms: filtered });
});

// Room validation
app.get('/api/rooms/:roomId/check', (req, res) => {
  const { roomId } = req.params;
  const exists = roomExists(roomId);
  res.json({ roomId, exists });
});

app.use(notFoundHandler);
app.use(errorHandler);

// ─── Socket.io ────────────────────────────────────────────────────────
const ipConnectionCount = new Map(); // v9: track connections per IP

const io = new Server(server, {
  cors: {
    origin: function(o, cb) { cb(null, true); },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  maxHttpBufferSize: 2e6,
  transports: ['websocket', 'polling'],
  // v9: Connection state recovery for brief disconnects
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true,
  },
});

// v9: Connection rate limiting per IP
io.use((socket, next) => {
  const ip = socket.handshake.headers['x-forwarded-for'] ||
             socket.handshake.address ||
             'unknown';
  const count = ipConnectionCount.get(ip) || 0;
  if (count >= MAX_CONNECTIONS_PER_IP) {
    return next(new Error('Too many connections from this IP'));
  }
  ipConnectionCount.set(ip, count + 1);

  socket.on('disconnect', () => {
    const current = ipConnectionCount.get(ip) || 1;
    if (current <= 1) ipConnectionCount.delete(ip);
    else ipConnectionCount.set(ip, current - 1);
  });

  next();
});

io.use(socketAuthMiddleware);

// ─── Store io and room functions on app for admin routes ─────────────
app.set('io', io);
app.set('getActiveRooms', getActiveRooms);
app.set('getHealthStats', getHealthStats);
app.set('renameRoom', renameRoom);
app.set('kickUser', kickUser);

initRoomHandler(io, { competitionState, addViolation });

// ─── v9: Memory Monitoring ────────────────────────────────────────────
const memoryMonitorInterval = setInterval(() => {
  const mem = process.memoryUsage();
  const heapPressure = mem.heapUsed / mem.heapTotal;

  if (heapPressure > HEAP_PRESSURE_THRESHOLD) {
    console.warn(`[Memory] HIGH HEAP PRESSURE: ${(heapPressure * 100).toFixed(1)}% (${Math.round(mem.heapUsed / 1048576)}MB / ${Math.round(mem.heapTotal / 1048576)}MB)`);
    // Force garbage collection if available
    if (global.gc) {
      console.warn('[Memory] Forcing garbage collection...');
      global.gc();
    }
  }
}, MEMORY_CHECK_INTERVAL);

// ─── Start Server ─────────────────────────────────────────────────────
async function start() {
  await connectDB();

  server.listen(PORT, '0.0.0.0', () => {
    isReady = true;
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║      CollabCode Server v11.0             ║');
    console.log('  ║      Competition Mode + Admin Panel      ║');
    console.log('  ║      made with <3 by Namish              ║');
    console.log('  ╠══════════════════════════════════════════╣');
    console.log(`  ║  HTTP:   http://0.0.0.0:${PORT}            ║`);
    console.log(`  ║  WS:     ws://0.0.0.0:${PORT}              ║`);
    console.log(`  ║  Client: ${CLIENT_URL}       ║`);
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
  });
}

start().catch(err => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});

// ─── v9: Graceful Shutdown (coordinated) ──────────────────────────────
let shutdownInProgress = false;

async function shutdown(signal) {
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  isShuttingDown = true;
  console.log(`\n[Server] ${signal} received — initiating graceful shutdown...`);

  // Stop accepting new connections
  server.close(() => {
    console.log('[Server] HTTP server closed');
  });

  // Phase 1: Persist all room state
  console.log('[Server] Phase 1: Persisting room state...');
  try {
    await shutdownRooms();
  } catch (err) {
    console.error('[Server] Room shutdown error:', err.message);
  }

  // Phase 2: Clean up execution engine
  console.log('[Server] Phase 2: Cleaning up execution engine...');
  try {
    cleanupExecution();
  } catch (err) {
    console.error('[Server] Execution cleanup error:', err.message);
  }

  // Phase 3: Close socket connections
  console.log('[Server] Phase 3: Closing socket connections...');
  io.close();

  // Phase 4: Wait for active requests to drain (with timeout)
  console.log(`[Server] Phase 4: Draining ${activeRequests} active requests...`);
  const drainStart = Date.now();
  while (activeRequests > 0 && (Date.now() - drainStart) < SHUTDOWN_TIMEOUT) {
    await new Promise(r => setTimeout(r, 100));
  }
  if (activeRequests > 0) {
    console.warn(`[Server] Drain timeout — ${activeRequests} requests still active`);
  }

  // Phase 5: Close database
  console.log('[Server] Phase 5: Closing database connection...');
  try {
    await disconnectDB();
  } catch (err) {
    console.error('[Server] DB disconnect error:', err.message);
  }

  // Phase 6: Clean up intervals
  clearInterval(memoryMonitorInterval);

  console.log('[Server] Graceful shutdown complete');
  process.exit(0);
}

// Forceful shutdown after timeout
function forceShutdown() {
  console.error(`[Server] Forced shutdown after ${SHUTDOWN_TIMEOUT}ms timeout`);
  process.exit(1);
}

process.on('SIGTERM', () => {
  const forceTimer = setTimeout(forceShutdown, SHUTDOWN_TIMEOUT);
  forceTimer.unref(); // Don't prevent exit
  shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  const forceTimer = setTimeout(forceShutdown, SHUTDOWN_TIMEOUT);
  forceTimer.unref();
  shutdown('SIGINT');
});

// ─── v9: Uncaught Exception / Rejection Handlers ──────────────────────
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message);
  console.error(err.stack);
  // Log but don't crash for operational errors
  if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ECONNREFUSED') {
    console.warn('[FATAL] Network error — continuing...');
    return;
  }
  // For truly unexpected errors, shut down gracefully
  console.error('[FATAL] Initiating emergency shutdown...');
  shutdown('uncaughtException').then(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Promise Rejection:', reason);
  // Don't crash — log and continue
  // Most unhandled rejections in this app are non-critical (DB timeouts, etc.)
});

// v9: Warning handler for deprecation notices, memory warnings, etc.
process.on('warning', (warning) => {
  console.warn(`[Warning] ${warning.name}: ${warning.message}`);
});

module.exports = { app, server, io };
