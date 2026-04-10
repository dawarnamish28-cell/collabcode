/**
 * CollabCode Server v5.0
 * 
 * Express + Socket.io backend — 15 languages, public/private rooms,
 * code gallery, room validation, persistent auth.
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

const { connectDB } = require('./config/db');
const { socketAuthMiddleware } = require('./middleware/auth');
const { generalLimiter } = require('./middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { initRoomHandler, getActiveRooms, roomExists } = require('./sockets/roomHandler');

const executionRoutes = require('./routes/execution');
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const galleryRoutes = require('./routes/gallery');

const PORT = parseInt(process.env.PORT) || 4000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

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
app.use('/api/gallery', galleryRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString(), rooms: getActiveRooms().length });
});

// Room list — now includes public/private info and language
app.get('/api/rooms', (req, res) => {
  const showPublic = req.query.public === 'true';
  const allRooms = getActiveRooms();
  const filtered = showPublic ? allRooms.filter(r => r.isPublic) : allRooms;
  res.json({ rooms: filtered });
});

// Room validation — check if a room exists before joining
app.get('/api/rooms/:roomId/check', (req, res) => {
  const { roomId } = req.params;
  const exists = roomExists(roomId);
  res.json({ roomId, exists });
});

app.use(notFoundHandler);
app.use(errorHandler);

// ─── Socket.io ────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: function(o, cb) { cb(null, true); }, methods: ['GET', 'POST'], credentials: true },
  pingInterval: 10000, pingTimeout: 5000,
  maxHttpBufferSize: 2e6,
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
    console.log('  ║      CollabCode Server v5.0              ║');
    console.log('  ║      made with <3 by Namish              ║');
    console.log('  ╠══════════════════════════════════════════╣');
    console.log(`  ║  HTTP:   http://0.0.0.0:${PORT}            ║`);
    console.log(`  ║  WS:     ws://0.0.0.0:${PORT}              ║`);
    console.log(`  ║  Client: ${CLIENT_URL}       ║`);
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
  });
}

start().catch(err => { console.error('[Server] Fatal:', err); process.exit(1); });

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
