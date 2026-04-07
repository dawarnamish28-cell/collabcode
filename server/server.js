/**
 * CollabCode Server v2.0
 * 
 * Express + Socket.io backend for the collaborative coding platform.
 * Features: REST API, WebSocket CRDT relay, chat, voice signaling,
 * code execution (10 languages), sign-up/sign-in, file save/open.
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
const fileRoutes = require('./routes/files');

const PORT = parseInt(process.env.PORT) || 4000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// ─── Express App ──────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(cors({
  origin: function(origin, callback) { callback(null, true); },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id', 'x-username', 'x-user-color', 'x-tab-id'],
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use('/api/', generalLimiter);

// ─── REST Routes ──────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api', executionRoutes);
app.use('/api/files', fileRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString(), rooms: getActiveRooms().length });
});

app.get('/api/rooms', (req, res) => {
  res.json({ rooms: getActiveRooms() });
});

app.use(notFoundHandler);
app.use(errorHandler);

// ─── Socket.io ────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: function(o, cb) { cb(null, true); }, methods: ['GET', 'POST'], credentials: true },
  pingInterval: 10000, pingTimeout: 5000,
  maxHttpBufferSize: 2e6, // 2MB for voice data
  transports: ['websocket', 'polling'],
});

io.use(socketAuthMiddleware);
initRoomHandler(io);

// ─── Start Server ─────────────────────────────────────────────────────
async function start() {
  await connectDB();
  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║        CollabCode Server v2.0            ║');
    console.log('  ╠══════════════════════════════════════════╣');
    console.log(`  ║  HTTP:   http://0.0.0.0:${PORT}            ║`);
    console.log(`  ║  WS:     ws://0.0.0.0:${PORT}              ║`);
    console.log(`  ║  Client: ${CLIENT_URL}       ║`);
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
  });
}

start().catch(err => { console.error('[Server] Fatal:', err); process.exit(1); });

// Graceful shutdown
const shutdown = async () => {
  console.log('[Server] Shutting down...');
  io.close(); server.close();
  const { disconnectDB } = require('./config/db');
  await disconnectDB();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { app, server, io };
