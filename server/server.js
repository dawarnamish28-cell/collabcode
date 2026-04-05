/**
 * CollabCode Server
 * 
 * Express + Socket.io server for the collaborative coding platform.
 * Handles: REST API endpoints, WebSocket connections, CRDT relay,
 * chat persistence, and code execution proxying.
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { connectDB } = require('./config/db');
const { socketAuthMiddleware } = require('./middleware/auth');
const { generalLimiter } = require('./middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { initRoomHandler, getActiveRooms } = require('./sockets/roomHandler');

const executionRoutes = require('./routes/execution');
const authRoutes = require('./routes/auth');

const PORT = parseInt(process.env.PORT) || 4000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// ─── Express App Setup ───────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // Disable for dev
}));

// CORS configuration - permissive for sandbox/development
app.use(cors({
  origin: function(origin, callback) { callback(null, true); },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id', 'x-username', 'x-user-color'],
}));

// Parsing and logging
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Rate limiting
app.use('/api/', generalLimiter);

// ─── REST API Routes ─────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api', executionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    rooms: getActiveRooms().length,
  });
});

// Active rooms endpoint (for room listing)
app.get('/api/rooms', (req, res) => {
  res.json({ rooms: getActiveRooms() });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Socket.io Setup ─────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: function(origin, callback) { callback(null, true); },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  maxHttpBufferSize: 1e6, // 1MB max message size
  transports: ['websocket', 'polling'],
});

// Socket authentication middleware
io.use(socketAuthMiddleware);

// Initialize room handler
initRoomHandler(io);

// ─── Start Server ────────────────────────────────────────────────────
async function start() {
  // Connect to MongoDB (non-blocking - works without it)
  await connectDB();

  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║         CollabCode Server v1.0           ║');
    console.log('  ╠══════════════════════════════════════════╣');
    console.log(`  ║  HTTP:   http://0.0.0.0:${PORT}            ║`);
    console.log(`  ║  WS:     ws://0.0.0.0:${PORT}              ║`);
    console.log(`  ║  Client: ${CLIENT_URL}       ║`);
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
  });
}

start().catch(err => {
  console.error('[Server] Fatal error:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received. Shutting down...');
  io.close();
  server.close();
  const { disconnectDB } = require('./config/db');
  await disconnectDB();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received. Shutting down...');
  io.close();
  server.close();
  const { disconnectDB } = require('./config/db');
  await disconnectDB();
  process.exit(0);
});

module.exports = { app, server, io };
