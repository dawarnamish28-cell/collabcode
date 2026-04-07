/**
 * Room Socket Handler v2.0
 * 
 * Real-time room management:
 *  - Room join/leave with presence tracking
 *  - CRDT binary update relay (Yjs)
 *  - Awareness (cursors, selections)
 *  - Chat with persistence
 *  - Voice chat WebRTC signaling
 *  - Simple 6-char room codes
 */

const Y = require('yjs');
const Room = require('../models/Room');
const Message = require('../models/Message');
const { getConnectionStatus } = require('../config/db');
const { createSocketRateLimiter } = require('../middleware/rateLimiter');

const rooms = new Map();
const chatRateCheck = createSocketRateLimiter(20, 10000);
const updateRateCheck = createSocketRateLimiter(100, 1000);
const awarenessRateCheck = createSocketRateLimiter(30, 1000);
const PERSIST_INTERVAL = (parseInt(process.env.CRDT_PERSIST_INTERVAL) || 30) * 1000;

// Simple room code generator (6 alphanumeric chars)
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0, I/1
function generateSimpleCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      users: new Map(),
      ydoc: new Y.Doc(),
      awarenessStates: new Map(),
      persistTimer: null,
      lastPersist: Date.now(),
      dirty: false,
      voiceUsers: new Set(), // track users in voice chat
    });
  }
  return rooms.get(roomId);
}

async function persistRoomState(roomId) {
  if (!getConnectionStatus()) return;
  const room = rooms.get(roomId);
  if (!room || !room.dirty) return;
  try {
    const stateVector = Y.encodeStateAsUpdate(room.ydoc);
    const textContent = room.ydoc.getText('monaco').toString();
    await Room.findOneAndUpdate(
      { roomId },
      { $set: { crdtState: Buffer.from(stateVector), lastCodeSnapshot: textContent.substring(0, 500000), activeCount: room.users.size } },
      { upsert: true }
    );
    room.dirty = false;
    room.lastPersist = Date.now();
  } catch (err) {
    console.error(`[Room:${roomId}] Persist error:`, err.message);
  }
}

async function loadRoomState(roomId, ydoc) {
  if (!getConnectionStatus()) return false;
  try {
    const roomData = await Room.findOne({ roomId }).lean();
    if (roomData?.crdtState) {
      Y.applyUpdate(ydoc, new Uint8Array(roomData.crdtState));
      return true;
    }
  } catch (err) { console.error(`[Room:${roomId}] Load error:`, err.message); }
  return false;
}

function startPersistTimer(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.persistTimer) return;
  room.persistTimer = setInterval(() => persistRoomState(roomId), PERSIST_INTERVAL);
}

async function stopPersistTimer(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.persistTimer) { clearInterval(room.persistTimer); room.persistTimer = null; }
  await persistRoomState(roomId);
}

async function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.users.size > 0) return;
  await stopPersistTimer(roomId);
  room.ydoc.destroy();
  rooms.delete(roomId);
  console.log(`[Room:${roomId}] Cleaned up`);
}

function initRoomHandler(io) {
  // REST-accessible room code generator
  io._generateRoomCode = () => {
    let code;
    do { code = generateSimpleCode(); } while (rooms.has(code));
    return code;
  };

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id} (${socket.user.username})`);
    let currentRoomId = null;

    // ─── JOIN ROOM ──────────────────────────────────────────────
    socket.on('room:join', async (data) => {
      const { roomId, language } = data;
      if (!roomId || typeof roomId !== 'string') return;
      if (currentRoomId) await handleLeave(socket, currentRoomId, io);

      currentRoomId = roomId;
      const room = getRoom(roomId);
      if (room.users.size === 0) await loadRoomState(roomId, room.ydoc);

      const userInfo = {
        userId: socket.user.userId, username: socket.user.username,
        color: socket.user.color, socketId: socket.id, joinedAt: Date.now(),
      };
      room.users.set(socket.id, userInfo);
      socket.join(roomId);
      startPersistTimer(roomId);

      if (getConnectionStatus()) {
        try {
          await Room.findOneAndUpdate({ roomId }, {
            $set: { activeCount: room.users.size, isActive: true, language: language || 'javascript' },
            $setOnInsert: { name: `Room ${roomId}`, createdBy: socket.user.userId },
          }, { upsert: true });
        } catch (err) {}
      }

      const stateUpdate = Y.encodeStateAsUpdate(room.ydoc);
      socket.emit('room:state', {
        update: Array.from(stateUpdate),
        users: Array.from(room.users.values()),
        awareness: Object.fromEntries(room.awarenessStates),
      });

      if (getConnectionStatus()) {
        try {
          const messages = await Message.getRecentMessages(roomId, 50);
          socket.emit('chat:history', messages);
        } catch (err) {}
      }

      socket.to(roomId).emit('room:user-joined', userInfo);
      const joinMsg = { roomId, userId: 'system', username: 'System', content: `${socket.user.username} joined`, type: 'system', color: '#6b7280' };
      io.to(roomId).emit('chat:message', joinMsg);
      if (getConnectionStatus()) Message.create(joinMsg).catch(() => {});
      console.log(`[Room:${roomId}] ${socket.user.username} joined (${room.users.size} users)`);
    });

    // ─── CRDT UPDATE RELAY ──────────────────────────────────────
    socket.on('crdt:update', (data) => {
      if (!currentRoomId || !updateRateCheck(socket.id)) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      try {
        const update = new Uint8Array(data.update);
        Y.applyUpdate(room.ydoc, update);
        room.dirty = true;
        socket.to(currentRoomId).emit('crdt:update', { update: data.update, origin: socket.user.userId });
      } catch (err) {}
    });

    // ─── AWARENESS ──────────────────────────────────────────────
    socket.on('awareness:update', (state) => {
      if (!currentRoomId || !awarenessRateCheck(socket.id)) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      room.awarenessStates.set(socket.user.userId, {
        ...state, userId: socket.user.userId, username: socket.user.username, color: socket.user.color,
      });
      socket.to(currentRoomId).emit('awareness:update', {
        userId: socket.user.userId, username: socket.user.username, color: socket.user.color, ...state,
      });
    });

    // ─── CHAT ───────────────────────────────────────────────────
    socket.on('chat:send', async (data) => {
      if (!currentRoomId) return;
      if (!chatRateCheck(socket.id)) { socket.emit('chat:error', { message: 'Slow down!' }); return; }
      const content = (data.content || '').trim();
      if (!content || content.length > 2000) return;
      const message = {
        roomId: currentRoomId, userId: socket.user.userId, username: socket.user.username,
        content, type: data.type || 'chat', color: socket.user.color, createdAt: new Date(),
      };
      io.to(currentRoomId).emit('chat:message', message);
      if (getConnectionStatus()) Message.create(message).catch(() => {});
    });

    socket.on('room:language-change', (data) => {
      if (!currentRoomId) return;
      socket.to(currentRoomId).emit('room:language-change', { language: data.language, changedBy: socket.user.username });
    });

    socket.on('chat:typing', (data) => {
      if (!currentRoomId) return;
      socket.to(currentRoomId).emit('chat:typing', { userId: socket.user.userId, username: socket.user.username, isTyping: data.isTyping });
    });

    // ─── VOICE CHAT WebRTC Signaling ────────────────────────────
    socket.on('voice:join', () => {
      if (!currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      room.voiceUsers.add(socket.user.userId);
      socket.to(currentRoomId).emit('voice:user-joined', {
        userId: socket.user.userId, username: socket.user.username, socketId: socket.id,
      });
      // Send list of already-in-voice users to the newcomer
      const voiceList = [];
      room.users.forEach((u) => {
        if (room.voiceUsers.has(u.userId) && u.userId !== socket.user.userId) {
          voiceList.push({ userId: u.userId, username: u.username, socketId: u.socketId });
        }
      });
      socket.emit('voice:peers', voiceList);
    });

    socket.on('voice:leave', () => {
      if (!currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      room.voiceUsers.delete(socket.user.userId);
      socket.to(currentRoomId).emit('voice:user-left', { userId: socket.user.userId });
    });

    // WebRTC signaling relay
    socket.on('voice:offer', (data) => {
      io.to(data.to).emit('voice:offer', { from: socket.id, offer: data.offer, userId: socket.user.userId, username: socket.user.username });
    });
    socket.on('voice:answer', (data) => {
      io.to(data.to).emit('voice:answer', { from: socket.id, answer: data.answer });
    });
    socket.on('voice:ice-candidate', (data) => {
      io.to(data.to).emit('voice:ice-candidate', { from: socket.id, candidate: data.candidate });
    });

    // ─── DISCONNECT ─────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      console.log(`[Socket] Disconnected: ${socket.id} (${reason})`);
      if (currentRoomId) {
        const room = rooms.get(currentRoomId);
        if (room) room.voiceUsers.delete(socket.user.userId);
        await handleLeave(socket, currentRoomId, io);
        currentRoomId = null;
      }
    });
  });

  async function handleLeave(socket, roomId, io) {
    const room = rooms.get(roomId);
    if (!room) return;
    room.users.delete(socket.id);
    room.awarenessStates.delete(socket.user.userId);
    socket.leave(roomId);
    socket.to(roomId).emit('room:user-left', { userId: socket.user.userId, username: socket.user.username });
    socket.to(roomId).emit('voice:user-left', { userId: socket.user.userId });
    const leaveMsg = { roomId, userId: 'system', username: 'System', content: `${socket.user.username} left`, type: 'system', color: '#6b7280' };
    io.to(roomId).emit('chat:message', leaveMsg);
    if (getConnectionStatus()) Message.create(leaveMsg).catch(() => {});
    if (room.users.size === 0) setTimeout(() => cleanupRoom(roomId), 30000);
  }

  setInterval(() => {
    for (const [roomId, room] of rooms.entries()) {
      if (room.users.size === 0) cleanupRoom(roomId);
    }
  }, 60000);
}

function getActiveRooms() {
  const info = [];
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.size > 0) {
      info.push({ roomId, userCount: room.users.size, users: Array.from(room.users.values()).map(u => u.username) });
    }
  }
  return info;
}

module.exports = { initRoomHandler, getActiveRooms };
