/**
 * Room Socket Handler
 * 
 * Manages real-time room interactions via Socket.io:
 * - Room join/leave with user presence tracking
 * - CRDT binary update relay (Yjs document sync)
 * - Awareness state broadcasting (cursors, selections)
 * - Chat message relay and persistence
 * - Periodic CRDT state persistence to MongoDB
 * 
 * Architecture: All CRDT state management happens on the client.
 * The server acts as a relay + persistence layer only.
 */

const Y = require('yjs');
const { encoding, decoding } = require('lib0');
const Room = require('../models/Room');
const Message = require('../models/Message');
const { getConnectionStatus } = require('../config/db');
const { createSocketRateLimiter } = require('../middleware/rateLimiter');

// In-memory room state
const rooms = new Map();

// Rate limiters for socket events
const chatRateCheck = createSocketRateLimiter(20, 10000);     // 20 msgs / 10s
const updateRateCheck = createSocketRateLimiter(100, 1000);   // 100 updates / 1s
const awarenessRateCheck = createSocketRateLimiter(30, 1000); // 30 awareness / 1s

// CRDT persistence interval (ms)
const PERSIST_INTERVAL = (parseInt(process.env.CRDT_PERSIST_INTERVAL) || 30) * 1000;

/**
 * Get or create in-memory room state
 */
function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      users: new Map(),         // socketId -> user info
      ydoc: new Y.Doc(),        // Server-side Yjs doc for persistence
      awarenessStates: new Map(), // userId -> awareness state
      persistTimer: null,
      lastPersist: Date.now(),
      dirty: false,             // Track if state changed since last persist
    });
  }
  return rooms.get(roomId);
}

/**
 * Persist CRDT state to MongoDB
 */
async function persistRoomState(roomId) {
  if (!getConnectionStatus()) return;

  const room = rooms.get(roomId);
  if (!room || !room.dirty) return;

  try {
    const stateVector = Y.encodeStateAsUpdate(room.ydoc);
    const textContent = room.ydoc.getText('monaco').toString();

    await Room.findOneAndUpdate(
      { roomId },
      {
        $set: {
          crdtState: Buffer.from(stateVector),
          lastCodeSnapshot: textContent.substring(0, 500000),
          activeCount: room.users.size,
        }
      },
      { upsert: true }
    );

    room.dirty = false;
    room.lastPersist = Date.now();
    console.log(`[Room:${roomId}] CRDT state persisted (${stateVector.byteLength} bytes)`);
  } catch (err) {
    console.error(`[Room:${roomId}] Persist error:`, err.message);
  }
}

/**
 * Load CRDT state from MongoDB
 */
async function loadRoomState(roomId, ydoc) {
  if (!getConnectionStatus()) return false;

  try {
    const roomData = await Room.findOne({ roomId }).lean();
    if (roomData?.crdtState) {
      const update = new Uint8Array(roomData.crdtState);
      Y.applyUpdate(ydoc, update);
      console.log(`[Room:${roomId}] CRDT state loaded (${update.byteLength} bytes)`);
      return true;
    }
  } catch (err) {
    console.error(`[Room:${roomId}] Load error:`, err.message);
  }
  return false;
}

/**
 * Start periodic persistence for a room
 */
function startPersistTimer(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.persistTimer) return;

  room.persistTimer = setInterval(() => {
    persistRoomState(roomId);
  }, PERSIST_INTERVAL);
}

/**
 * Stop persistence timer and do final persist
 */
async function stopPersistTimer(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.persistTimer) {
    clearInterval(room.persistTimer);
    room.persistTimer = null;
  }

  // Final persist
  await persistRoomState(roomId);
}

/**
 * Clean up empty room
 */
async function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.users.size > 0) return;

  await stopPersistTimer(roomId);
  room.ydoc.destroy();
  rooms.delete(roomId);
  console.log(`[Room:${roomId}] Cleaned up (empty)`);
}

/**
 * Initialize Socket.io room handler
 */
function initRoomHandler(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id} (${socket.user.username})`);

    let currentRoomId = null;

    /**
     * JOIN ROOM
     */
    socket.on('room:join', async (data) => {
      const { roomId, language } = data;
      if (!roomId || typeof roomId !== 'string') return;

      // Leave previous room if any
      if (currentRoomId) {
        await handleLeave(socket, currentRoomId, io);
      }

      currentRoomId = roomId;
      const room = getRoom(roomId);

      // Load persisted state if this is a fresh room
      if (room.users.size === 0) {
        await loadRoomState(roomId, room.ydoc);
      }

      // Register user in room
      const userInfo = {
        userId: socket.user.userId,
        username: socket.user.username,
        color: socket.user.color,
        socketId: socket.id,
        joinedAt: Date.now(),
      };
      room.users.set(socket.id, userInfo);

      // Join Socket.io room
      socket.join(roomId);

      // Start persistence timer
      startPersistTimer(roomId);

      // Update MongoDB room record
      if (getConnectionStatus()) {
        try {
          await Room.findOneAndUpdate(
            { roomId },
            {
              $set: {
                activeCount: room.users.size,
                isActive: true,
                language: language || 'javascript',
              },
              $setOnInsert: {
                name: `Room ${roomId.substring(0, 8)}`,
                createdBy: socket.user.userId,
              },
            },
            { upsert: true }
          );
        } catch (err) {
          console.error(`[Room:${roomId}] DB update error:`, err.message);
        }
      }

      // Send current state to joining user
      const stateUpdate = Y.encodeStateAsUpdate(room.ydoc);
      socket.emit('room:state', {
        update: Array.from(stateUpdate), // Send as array for JSON compat
        users: Array.from(room.users.values()),
        awareness: Object.fromEntries(room.awarenessStates),
      });

      // Load and send chat history
      if (getConnectionStatus()) {
        try {
          const messages = await Message.getRecentMessages(roomId, 50);
          socket.emit('chat:history', messages);
        } catch (err) {
          console.error(`[Room:${roomId}] Chat history error:`, err.message);
        }
      }

      // Broadcast user joined to room
      socket.to(roomId).emit('room:user-joined', userInfo);

      // Send system message
      const joinMsg = {
        roomId,
        userId: 'system',
        username: 'System',
        content: `${socket.user.username} joined the room`,
        type: 'system',
        color: '#6b7280',
      };
      io.to(roomId).emit('chat:message', joinMsg);
      if (getConnectionStatus()) {
        Message.create(joinMsg).catch(() => {});
      }

      console.log(`[Room:${roomId}] ${socket.user.username} joined (${room.users.size} users)`);
    });

    /**
     * CRDT UPDATE RELAY
     * Receives binary Yjs updates and broadcasts to room
     */
    socket.on('crdt:update', (data) => {
      if (!currentRoomId) return;
      if (!updateRateCheck(socket.id)) return;

      const room = rooms.get(currentRoomId);
      if (!room) return;

      try {
        const update = new Uint8Array(data.update);

        // Apply to server-side doc for persistence
        Y.applyUpdate(room.ydoc, update);
        room.dirty = true;

        // Broadcast to other clients in the room (binary relay)
        socket.to(currentRoomId).emit('crdt:update', {
          update: data.update, // Forward as-is
          origin: socket.user.userId,
        });
      } catch (err) {
        console.error(`[Room:${currentRoomId}] CRDT update error:`, err.message);
      }
    });

    /**
     * AWARENESS STATE UPDATE
     * Cursor positions, selections, username/color
     */
    socket.on('awareness:update', (state) => {
      if (!currentRoomId) return;
      if (!awarenessRateCheck(socket.id)) return;

      const room = rooms.get(currentRoomId);
      if (!room) return;

      room.awarenessStates.set(socket.user.userId, {
        ...state,
        userId: socket.user.userId,
        username: socket.user.username,
        color: socket.user.color,
      });

      socket.to(currentRoomId).emit('awareness:update', {
        userId: socket.user.userId,
        username: socket.user.username,
        color: socket.user.color,
        ...state,
      });
    });

    /**
     * CHAT MESSAGE
     */
    socket.on('chat:send', async (data) => {
      if (!currentRoomId) return;
      if (!chatRateCheck(socket.id)) {
        socket.emit('chat:error', { message: 'Too many messages. Slow down!' });
        return;
      }

      const content = (data.content || '').trim();
      if (!content || content.length > 2000) return;

      const message = {
        roomId: currentRoomId,
        userId: socket.user.userId,
        username: socket.user.username,
        content,
        type: data.type || 'chat',
        color: socket.user.color,
        createdAt: new Date(),
      };

      // Broadcast to room
      io.to(currentRoomId).emit('chat:message', message);

      // Persist message
      if (getConnectionStatus()) {
        Message.create(message).catch(err =>
          console.error(`[Chat] Persist error:`, err.message)
        );
      }
    });

    /**
     * LANGUAGE CHANGE
     */
    socket.on('room:language-change', (data) => {
      if (!currentRoomId) return;
      socket.to(currentRoomId).emit('room:language-change', {
        language: data.language,
        changedBy: socket.user.username,
      });
    });

    /**
     * TYPING INDICATOR
     */
    socket.on('chat:typing', (data) => {
      if (!currentRoomId) return;
      socket.to(currentRoomId).emit('chat:typing', {
        userId: socket.user.userId,
        username: socket.user.username,
        isTyping: data.isTyping,
      });
    });

    /**
     * DISCONNECT
     */
    socket.on('disconnect', async (reason) => {
      console.log(`[Socket] Disconnected: ${socket.id} (${reason})`);
      if (currentRoomId) {
        await handleLeave(socket, currentRoomId, io);
        currentRoomId = null;
      }
    });
  });

  /**
   * Handle user leaving a room
   */
  async function handleLeave(socket, roomId, io) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.users.delete(socket.id);
    room.awarenessStates.delete(socket.user.userId);
    socket.leave(roomId);

    // Notify others
    socket.to(roomId).emit('room:user-left', {
      userId: socket.user.userId,
      username: socket.user.username,
    });

    // System message
    const leaveMsg = {
      roomId,
      userId: 'system',
      username: 'System',
      content: `${socket.user.username} left the room`,
      type: 'system',
      color: '#6b7280',
    };
    io.to(roomId).emit('chat:message', leaveMsg);
    if (getConnectionStatus()) {
      Message.create(leaveMsg).catch(() => {});
    }

    console.log(`[Room:${roomId}] ${socket.user.username} left (${room.users.size} remaining)`);

    // Cleanup if empty
    if (room.users.size === 0) {
      // Delay cleanup to allow for reconnection
      setTimeout(() => cleanupRoom(roomId), 30000);
    }
  }

  // Periodic cleanup of stale rooms
  setInterval(() => {
    for (const [roomId, room] of rooms.entries()) {
      if (room.users.size === 0) {
        cleanupRoom(roomId);
      }
    }
  }, 60000); // Every minute
}

/**
 * Get active rooms info (for admin/debug)
 */
function getActiveRooms() {
  const info = [];
  for (const [roomId, room] of rooms.entries()) {
    info.push({
      roomId,
      userCount: room.users.size,
      users: Array.from(room.users.values()).map(u => u.username),
      dirty: room.dirty,
      lastPersist: room.lastPersist,
    });
  }
  return info;
}

module.exports = { initRoomHandler, getActiveRooms };
