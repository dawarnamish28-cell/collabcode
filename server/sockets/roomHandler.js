/**
 * Room Socket Handler v13.0 — Phase 4: Language Fix + Admin Features
 * 
 * v9.0 hardening:
 *  - Race-safe room cleanup with mutex-like guard (cleanupInProgress flag)
 *  - Cleanup timeout tracking — all setTimeout refs stored and cleared on shutdown
 *  - Graceful shutdown: persist all dirty rooms, clear all timers, refuse new joins
 *  - Persist retry with exponential backoff (3 attempts)
 *  - Socket rate limiter periodic GC (cleans up disconnected socket entries)
 *  - Max room cap to prevent memory exhaustion
 *  - Max users per room cap
 *  - Multi-tab safety: voice/video user sets track socketId, not just userId
 *  - Awareness state size cap to prevent memory bloat
 *  - Health stats with memory usage reporting
 *  - All interval/timeout references tracked for clean teardown
 *
 * v11.0 features:
 *  - Competition mode: global room lock/unlock via admin
 *  - Fullscreen violation detection relay (client → server → admin)
 *  - Custom room naming support
 *  - Competition state injected from admin routes
 *
 * v8.0 features retained:
 *  - Throttled awareness updates per room (batched, 50ms debounce)
 *  - Staggered room cleanup with jitter
 *  - Per-room rate limiters
 *  - Efficient Map-based user tracking
 *  - Awareness auto-expire after 30s
 *  - Room stats caching
 *
 * made with <3 by Namish
 */

const Y = require('yjs');
const Room = require('../models/Room');
const Message = require('../models/Message');
const { getConnectionStatus } = require('../config/db');
const { createSocketRateLimiter } = require('../middleware/rateLimiter');

// ─── Constants ─────────────────────────────────────────────────────────
const PERSIST_INTERVAL = (parseInt(process.env.CRDT_PERSIST_INTERVAL) || 30) * 1000;
const AWARENESS_EXPIRE_MS = 30000;
const CLEANUP_DELAY_BASE = 30000;
const CLEANUP_JITTER = 10000;
const MAX_ROOMS = parseInt(process.env.MAX_ROOMS) || 500;
const MAX_USERS_PER_ROOM = parseInt(process.env.MAX_USERS_PER_ROOM) || 50;
const MAX_AWARENESS_STATES = 100; // cap per room
const PERSIST_RETRY_ATTEMPTS = 3;
const PERSIST_RETRY_BASE_MS = 1000;
const RATE_LIMITER_GC_INTERVAL = 60000; // clean disconnected socket entries every 60s
const STATS_CACHE_TTL = 500; // v12: reduced from 2s to 500ms for faster admin refresh

// ─── State ─────────────────────────────────────────────────────────────
const rooms = new Map();
const roomRateLimiters = new Map();
const pendingCleanupTimers = new Map(); // roomId -> timeoutId (track all cleanup timers)
let roomStatsCache = null;
let roomStatsCacheTime = 0;
let isShuttingDown = false;

// Track all global intervals for shutdown
const globalIntervals = [];

function getRoomLimiters(roomId) {
  if (!roomRateLimiters.has(roomId)) {
    roomRateLimiters.set(roomId, {
      chat: createSocketRateLimiter(20, 10000),
      update: createSocketRateLimiter(120, 1000),
      awareness: createSocketRateLimiter(40, 1000),
    });
  }
  return roomRateLimiters.get(roomId);
}

// ─── Room Management ───────────────────────────────────────────────────
function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      users: new Map(),          // socketId -> userInfo
      ydoc: new Y.Doc(),
      awarenessStates: new Map(),
      awarenessTimestamps: new Map(),
      persistTimer: null,
      lastPersist: Date.now(),
      dirty: false,
      voiceUsers: new Map(),     // v9: socketId -> userId (was Set of userId — multi-tab safe)
      videoUsers: new Map(),     // v9: socketId -> userId
      screenShareUser: null,
      screenShareSocketId: null, // v9: track socket too
      isPublic: false,
      language: 'javascript',
      createdBy: null,
      _awarenessBatchTimer: null,
      _pendingAwareness: new Map(),
      _cleanupInProgress: false, // v9: race guard
    });
  }
  return rooms.get(roomId);
}

function roomExists(roomId) {
  return rooms.has(roomId) && rooms.get(roomId).users.size > 0;
}

// ─── Persist with Retry + Backoff ──────────────────────────────────────
async function persistRoomState(roomId) {
  if (!getConnectionStatus()) return;
  const room = rooms.get(roomId);
  if (!room || !room.dirty) return;

  for (let attempt = 0; attempt < PERSIST_RETRY_ATTEMPTS; attempt++) {
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
            isPublic: room.isPublic,
          },
        },
        { upsert: true }
      );
      room.dirty = false;
      room.lastPersist = Date.now();
      return; // success
    } catch (err) {
      const delay = PERSIST_RETRY_BASE_MS * Math.pow(2, attempt);
      console.error(`[Room:${roomId}] Persist attempt ${attempt + 1}/${PERSIST_RETRY_ATTEMPTS} failed: ${err.message}. Retry in ${delay}ms`);
      if (attempt < PERSIST_RETRY_ATTEMPTS - 1) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  console.error(`[Room:${roomId}] Persist failed after ${PERSIST_RETRY_ATTEMPTS} attempts — data may be lost`);
}

async function loadRoomState(roomId, ydoc) {
  if (!getConnectionStatus()) return false;
  try {
    const roomData = await Room.findOne({ roomId }).lean();
    if (roomData?.crdtState) {
      Y.applyUpdate(ydoc, new Uint8Array(roomData.crdtState));
      return true;
    }
  } catch (err) {
    console.error(`[Room:${roomId}] Load error:`, err.message);
  }
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
  if (room.persistTimer) {
    clearInterval(room.persistTimer);
    room.persistTimer = null;
  }
  await persistRoomState(roomId);
}

// ─── Race-Safe Room Cleanup ────────────────────────────────────────────
async function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  // v9: Race guard — if users rejoined during cleanup delay, abort
  if (room.users.size > 0) return;
  // v9: Prevent concurrent cleanup
  if (room._cleanupInProgress) return;
  room._cleanupInProgress = true;

  try {
    await stopPersistTimer(roomId);
    // Clear awareness batch timer
    if (room._awarenessBatchTimer) {
      clearTimeout(room._awarenessBatchTimer);
      room._awarenessBatchTimer = null;
    }
    // Double-check nobody rejoined during persist
    if (room.users.size > 0) {
      room._cleanupInProgress = false;
      return;
    }
    room.ydoc.destroy();
    rooms.delete(roomId);
    roomRateLimiters.delete(roomId);
    // v9: Clear tracked cleanup timer
    if (pendingCleanupTimers.has(roomId)) {
      pendingCleanupTimers.delete(roomId);
    }
    roomStatsCache = null;
    console.log(`[Room:${roomId}] Cleaned up (rooms active: ${rooms.size})`);
  } catch (err) {
    console.error(`[Room:${roomId}] Cleanup error:`, err.message);
    room._cleanupInProgress = false;
  }
}

// ─── Batched Awareness Broadcast ───────────────────────────────────────
function scheduleAwarenessBroadcast(room, roomId, io) {
  if (room._awarenessBatchTimer) return;
  room._awarenessBatchTimer = setTimeout(() => {
    room._awarenessBatchTimer = null;
    if (room._pendingAwareness.size === 0) return;
    const batch = Object.fromEntries(room._pendingAwareness);
    room._pendingAwareness.clear();
    io.to(roomId).emit('awareness:batch', batch);
  }, 50);
}

function cleanExpiredAwareness(room) {
  const now = Date.now();
  for (const [userId, ts] of room.awarenessTimestamps) {
    if (now - ts > AWARENESS_EXPIRE_MS) {
      room.awarenessStates.delete(userId);
      room.awarenessTimestamps.delete(userId);
    }
  }
}

// ─── Schedule Cleanup with Timer Tracking ──────────────────────────────
function scheduleCleanup(roomId) {
  // v9: Cancel any existing cleanup timer for this room
  if (pendingCleanupTimers.has(roomId)) {
    clearTimeout(pendingCleanupTimers.get(roomId));
    pendingCleanupTimers.delete(roomId);
  }
  const delay = CLEANUP_DELAY_BASE + Math.floor(Math.random() * CLEANUP_JITTER);
  const timerId = setTimeout(() => {
    pendingCleanupTimers.delete(roomId);
    cleanupRoom(roomId);
  }, delay);
  pendingCleanupTimers.set(roomId, timerId);
}

// ─── Competition State (injected from admin routes) ──────────────────
let competitionCtx = null; // { competitionState, addViolation, anticheat }

// ─── Custom Room Names ───────────────────────────────────────────────
const roomNames = new Map(); // roomId -> custom name

function renameRoom(roomId, name) {
  const room = rooms.get(roomId);
  if (!room) return false;
  room.roomName = name;
  roomNames.set(roomId, name);
  roomStatsCache = null;
  return true;
}

// ─── v12: Kick User by socketId ───────────────────────────────────────
function kickUser(socketId, io) {
  const targetSocket = io?.sockets?.sockets?.get(socketId);
  if (!targetSocket) return { success: false, reason: 'Socket not found' };
  
  const username = targetSocket.user?.username || 'Unknown';
  
  // Notify the kicked user before disconnecting
  targetSocket.emit('competition:kicked', {
    message: 'You have been removed from the room by the admin.',
    timestamp: Date.now(),
  });
  
  // v14: Give the client time for graceful exit (toast + redirect) before force-disconnect
  setTimeout(() => {
    try { targetSocket.disconnect(true); } catch (e) {}
  }, 3000);
  
  roomStatsCache = null;
  console.log(`[Admin] Kicked user: ${username} (socket: ${socketId})`);
  return { success: true, username };
}

// ─── Main Handler ──────────────────────────────────────────────────────
function initRoomHandler(io, ctx) {
  if (ctx) competitionCtx = ctx;
  io.on('connection', (socket) => {
    // v9: Reject connections during shutdown
    if (isShuttingDown) {
      socket.emit('server:shutting-down', { message: 'Server is restarting. Please reconnect shortly.' });
      socket.disconnect(true);
      return;
    }

    console.log(`[Socket] Connected: ${socket.id} (${socket.user.username})`);
    let currentRoomId = null;

    // ─── Room Join ──────────────────────────────────────────────
    socket.on('room:join', async (data) => {
      if (isShuttingDown) return;
      const { roomId, language, isPublic } = data;
      if (!roomId || typeof roomId !== 'string' || roomId.length > 100) return;

      // v9: Leave previous room first
      if (currentRoomId) await handleLeave(socket, currentRoomId, io);

      // v9: Room cap check
      if (!rooms.has(roomId) && rooms.size >= MAX_ROOMS) {
        socket.emit('room:error', { message: 'Server has reached maximum room capacity. Try again later.' });
        return;
      }

      // v9: Cancel any pending cleanup for this room (user is joining)
      if (pendingCleanupTimers.has(roomId)) {
        clearTimeout(pendingCleanupTimers.get(roomId));
        pendingCleanupTimers.delete(roomId);
      }

      currentRoomId = roomId;
      const room = getRoom(roomId);

      // v9: User cap check
      if (room.users.size >= MAX_USERS_PER_ROOM) {
        socket.emit('room:error', { message: `Room is full (max ${MAX_USERS_PER_ROOM} users).` });
        currentRoomId = null;
        return;
      }

      // v9: Clear cleanup-in-progress flag since someone is joining
      room._cleanupInProgress = false;

      // v13: Only set language/public on room creation (first user), not on subsequent joins
      if (room.users.size === 0) {
        await loadRoomState(roomId, room.ydoc);
        if (isPublic !== undefined) room.isPublic = !!isPublic;
        room.createdBy = socket.user.userId;
        // Only the creator sets the room language
        if (language) room.language = language;
      }
      // Subsequent joiners do NOT overwrite the room's language

      // v11: Custom room name support
      if (data.roomName && typeof data.roomName === 'string' && room.users.size === 0) {
        room.roomName = data.roomName.slice(0, 50);
        roomNames.set(roomId, room.roomName);
      }

      const userInfo = {
        userId: socket.user.userId,
        username: socket.user.username,
        color: socket.user.color,
        socketId: socket.id,
        joinedAt: Date.now(),
      };
      room.users.set(socket.id, userInfo);
      socket.join(roomId);
      startPersistTimer(roomId);
      roomStatsCache = null;

      if (getConnectionStatus()) {
        try {
          await Room.findOneAndUpdate(
            { roomId },
            {
              $set: { activeCount: room.users.size, isActive: true, language: language || room.language, isPublic: room.isPublic },
              $setOnInsert: { name: `Room ${roomId}`, createdBy: socket.user.userId },
            },
            { upsert: true }
          );
        } catch (err) {
          // Non-critical — continue without DB update
        }
      }

      const stateUpdate = Y.encodeStateAsUpdate(room.ydoc);
      // v11: Include competition state and room name in room:state
      const compState = competitionCtx ? competitionCtx.competitionState : null;
      socket.emit('room:state', {
        update: Array.from(stateUpdate),
        users: Array.from(room.users.values()),
        awareness: Object.fromEntries(room.awarenessStates),
        isPublic: room.isPublic,
        language: room.language,
        roomName: room.roomName || null,
        competition: compState ? {
          mode: compState.mode,
          roomsLocked: compState.roomsLocked,
        } : null,
      });

      if (getConnectionStatus()) {
        try {
          const messages = await Message.getRecentMessages(roomId, 50);
          socket.emit('chat:history', messages);
        } catch (err) { /* Non-critical */ }
      }

      socket.to(roomId).emit('room:user-joined', userInfo);
      const joinMsg = {
        roomId, userId: 'system', username: 'System',
        content: `${socket.user.username} joined`, type: 'system', color: '#6b7280',
      };
      io.to(roomId).emit('chat:message', joinMsg);
      if (getConnectionStatus()) Message.create(joinMsg).catch(() => {});
      console.log(`[Room:${roomId}] ${socket.user.username} joined (${room.users.size} users) [${room.isPublic ? 'public' : 'private'}] [rooms: ${rooms.size}]`);
    });

    // ─── Room Visibility ────────────────────────────────────────
    socket.on('room:set-visibility', (data) => {
      if (!currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      room.isPublic = !!data.isPublic;
      room.dirty = true;
      roomStatsCache = null;
      io.to(currentRoomId).emit('room:visibility-changed', { isPublic: room.isPublic });
    });

    // ─── CRDT Sync ──────────────────────────────────────────────
    socket.on('crdt:update', (data) => {
      if (!currentRoomId || !data || !data.update) return;
      const limiters = getRoomLimiters(currentRoomId);
      if (!limiters.update(socket.id)) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      try {
        const update = new Uint8Array(data.update);
        Y.applyUpdate(room.ydoc, update);
        room.dirty = true;
        socket.to(currentRoomId).emit('crdt:update', { update: data.update, origin: socket.user.userId });
      } catch (err) {
        // Silently ignore malformed CRDT updates
      }
    });

    // ─── Awareness (throttled per-room batching) ────────────────
    socket.on('awareness:update', (state) => {
      if (!currentRoomId || !state) return;
      const limiters = getRoomLimiters(currentRoomId);
      if (!limiters.awareness(socket.id)) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;

      // v9: Cap awareness states to prevent memory bloat
      if (room.awarenessStates.size >= MAX_AWARENESS_STATES && !room.awarenessStates.has(socket.user.userId)) {
        return; // drop if at cap and this is a new user
      }

      const awarenessData = {
        ...state,
        userId: socket.user.userId,
        username: socket.user.username,
        color: socket.user.color,
      };
      room.awarenessStates.set(socket.user.userId, awarenessData);
      room.awarenessTimestamps.set(socket.user.userId, Date.now());
      // Emit individually for low-latency cursor
      socket.to(currentRoomId).emit('awareness:update', {
        userId: socket.user.userId,
        username: socket.user.username,
        color: socket.user.color,
        ...state,
      });
    });

    // ─── Chat ───────────────────────────────────────────────────
    socket.on('chat:send', async (data) => {
      if (!currentRoomId || !data) return;
      const limiters = getRoomLimiters(currentRoomId);
      if (!limiters.chat(socket.id)) {
        socket.emit('chat:error', { message: 'Slow down!' });
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
      io.to(currentRoomId).emit('chat:message', message);
      if (getConnectionStatus()) Message.create(message).catch(() => {});
    });

    socket.on('room:language-change', (data) => {
      if (!currentRoomId || !data || !data.language) return;
      const room = rooms.get(currentRoomId);
      if (room) {
        room.language = data.language;
        roomStatsCache = null;
      }
      socket.to(currentRoomId).emit('room:language-change', {
        language: data.language,
        changedBy: socket.user.username,
      });
    });

    socket.on('chat:typing', (data) => {
      if (!currentRoomId) return;
      socket.to(currentRoomId).emit('chat:typing', {
        userId: socket.user.userId,
        username: socket.user.username,
        isTyping: !!data?.isTyping,
      });
    });

    socket.on('chat:reaction', (data) => {
      if (!currentRoomId || !data) return;
      const { msgIndex, emoji, action } = data;
      if (typeof msgIndex !== 'number' || !emoji || !['add', 'remove'].includes(action)) return;
      io.to(currentRoomId).emit('chat:reaction', {
        msgIndex, emoji, userId: socket.user.userId, action,
      });
    });

    // ─── Voice Chat Signaling ───────────────────────────────────
    socket.on('voice:join', () => {
      if (!currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      // v9: Track by socketId for multi-tab safety
      room.voiceUsers.set(socket.id, socket.user.userId);
      socket.to(currentRoomId).emit('voice:user-joined', {
        userId: socket.user.userId,
        username: socket.user.username,
        socketId: socket.id,
      });
      const voiceList = [];
      room.users.forEach((u) => {
        if (room.voiceUsers.has(u.socketId) && u.socketId !== socket.id) {
          voiceList.push({ userId: u.userId, username: u.username, socketId: u.socketId });
        }
      });
      socket.emit('voice:peers', voiceList);
    });

    socket.on('voice:leave', () => {
      if (!currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (room) room.voiceUsers.delete(socket.id);
      socket.to(currentRoomId).emit('voice:user-left', { userId: socket.user.userId });
    });

    socket.on('voice:offer', (data) => {
      if (!data?.to) return;
      io.to(data.to).emit('voice:offer', {
        from: socket.id, offer: data.offer,
        userId: socket.user.userId, username: socket.user.username,
      });
    });
    socket.on('voice:answer', (data) => {
      if (!data?.to) return;
      io.to(data.to).emit('voice:answer', { from: socket.id, answer: data.answer });
    });
    socket.on('voice:ice-candidate', (data) => {
      if (!data?.to) return;
      io.to(data.to).emit('voice:ice-candidate', { from: socket.id, candidate: data.candidate });
    });

    // ─── Video Chat Signaling ───────────────────────────────────
    socket.on('video:join', () => {
      if (!currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      // v9: Track by socketId
      room.videoUsers.set(socket.id, socket.user.userId);
      console.log(`[Video:${currentRoomId}] ${socket.user.username} joined video (${room.videoUsers.size} in video)`);
      socket.to(currentRoomId).emit('video:user-joined', {
        userId: socket.user.userId, username: socket.user.username,
        socketId: socket.id, color: socket.user.color,
      });
      const videoList = [];
      room.users.forEach((u) => {
        if (room.videoUsers.has(u.socketId) && u.socketId !== socket.id) {
          videoList.push({ userId: u.userId, username: u.username, socketId: u.socketId, color: u.color });
        }
      });
      socket.emit('video:peers', videoList);
      if (room.screenShareUser && room.screenShareSocketId) {
        const sharer = room.users.get(room.screenShareSocketId);
        if (sharer) {
          socket.emit('video:screen-share-started', {
            userId: sharer.userId, username: sharer.username, socketId: sharer.socketId,
          });
        }
      }
    });

    socket.on('video:leave', () => {
      if (!currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      room.videoUsers.delete(socket.id);
      if (room.screenShareSocketId === socket.id) {
        room.screenShareUser = null;
        room.screenShareSocketId = null;
        io.to(currentRoomId).emit('video:screen-share-stopped', { userId: socket.user.userId });
      }
      console.log(`[Video:${currentRoomId}] ${socket.user.username} left video (${room.videoUsers.size} in video)`);
      socket.to(currentRoomId).emit('video:user-left', { userId: socket.user.userId });
    });

    socket.on('video:offer', (data) => {
      if (!data?.to) return;
      io.to(data.to).emit('video:offer', {
        from: socket.id, offer: data.offer,
        userId: socket.user.userId, username: socket.user.username,
      });
    });
    socket.on('video:answer', (data) => {
      if (!data?.to) return;
      io.to(data.to).emit('video:answer', { from: socket.id, answer: data.answer });
    });
    socket.on('video:ice-candidate', (data) => {
      if (!data?.to) return;
      io.to(data.to).emit('video:ice-candidate', { from: socket.id, candidate: data.candidate });
    });

    socket.on('video:screen-share-start', () => {
      if (!currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      if (room.screenShareUser && room.screenShareUser !== socket.user.userId) {
        socket.emit('video:screen-share-error', { message: 'Someone else is already sharing their screen' });
        return;
      }
      room.screenShareUser = socket.user.userId;
      room.screenShareSocketId = socket.id;
      console.log(`[Video:${currentRoomId}] ${socket.user.username} started screen share`);
      io.to(currentRoomId).emit('video:screen-share-started', {
        userId: socket.user.userId, username: socket.user.username, socketId: socket.id,
      });
    });

    socket.on('video:screen-share-stop', () => {
      if (!currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      if (room.screenShareSocketId === socket.id) {
        room.screenShareUser = null;
        room.screenShareSocketId = null;
        console.log(`[Video:${currentRoomId}] ${socket.user.username} stopped screen share`);
        io.to(currentRoomId).emit('video:screen-share-stopped', { userId: socket.user.userId });
      }
    });

    // ─── User Profile Updates ───────────────────────────────────
    socket.on('user:update-profile', (data) => {
      if (!currentRoomId || !data) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;
      const userInfo = room.users.get(socket.id);
      if (userInfo) {
        if (data.username && typeof data.username === 'string') userInfo.username = data.username.slice(0, 50);
        if (data.color && typeof data.color === 'string') userInfo.color = data.color.slice(0, 20);
        room.users.set(socket.id, userInfo);
        socket.to(currentRoomId).emit('room:user-updated', {
          userId: socket.user.userId,
          username: data.username || userInfo.username,
          color: data.color || userInfo.color,
        });
      }
    });

    // ─── v11: Fullscreen Violation Report ────────────────────────
    socket.on('competition:fullscreen-violation', () => {
      if (!competitionCtx) return;
      const room = currentRoomId ? rooms.get(currentRoomId) : null;
      const violation = {
        userId: socket.user.userId,
        username: socket.user.username,
        roomId: currentRoomId || 'unknown',
        roomName: room?.roomName || currentRoomId || 'unknown',
      };
      competitionCtx.addViolation(violation);
      // Also log to anticheat engine if enabled
      if (competitionCtx.anticheat) {
        const acViolation = competitionCtx.anticheat.addViolation(
          socket.user.userId, socket.user.username, 'FULLSCREEN_EXIT',
          { roomId: currentRoomId, source: 'legacy' }
        );
        if (acViolation) {
          io.emit('anticheat:violation-logged', acViolation);
        }
      }
      console.log(`[Competition] Fullscreen violation: ${socket.user.username} in room ${currentRoomId}`);
    });

    // ─── v17: AntiCheat Violation Report (all 13 types) ────────
    socket.on('anticheat:violation', (data) => {
      if (!competitionCtx?.anticheat) return;
      const { type, metadata } = data || {};
      if (!type || typeof type !== 'string') return;

      const violation = competitionCtx.anticheat.addViolation(
        socket.user.userId,
        socket.user.username,
        type.toUpperCase(),
        {
          ...metadata,
          roomId: currentRoomId || 'unknown',
          socketId: socket.id,
          ip: socket.handshake.headers['x-forwarded-for'] || socket.handshake.address,
        }
      );

      if (violation) {
        // Broadcast to all connected clients (admin dashboard picks this up)
        io.emit('anticheat:violation-logged', violation);

        // Check if user should be auto-flagged warning
        const score = competitionCtx.anticheat.getUserScore(socket.user.userId);
        if (score && score.flagged) {
          io.emit('anticheat:user-flagged', {
            userId: socket.user.userId,
            username: socket.user.username,
            totalWeight: score.totalWeight,
            violationCount: score.violations.length,
            timestamp: Date.now(),
          });
        }

        // Notify the violating user that violation was recorded
        socket.emit('anticheat:violation-ack', {
          type: violation.type,
          severity: violation.severity,
          weight: violation.weight,
          totalWeight: score?.totalWeight || violation.weight,
          flagged: score?.flagged || false,
        });
      }
    });

    // AntiCheat heartbeat — client sends periodic heartbeat to prove presence
    socket.on('anticheat:heartbeat', () => {
      // Just acknowledge — used by client to detect if socket is alive
      socket.emit('anticheat:heartbeat-ack', { timestamp: Date.now() });
    });

    // ─── Ping/Pong ──────────────────────────────────────────────
    socket.on('ping', () => {
      socket.emit('pong');
    });

    // ─── Disconnect ─────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      console.log(`[Socket] Disconnected: ${socket.id} (${reason})`);
      if (currentRoomId) {
        const room = rooms.get(currentRoomId);
        if (room) {
          room.voiceUsers.delete(socket.id);
          room.videoUsers.delete(socket.id);
          if (room.screenShareSocketId === socket.id) {
            room.screenShareUser = null;
            room.screenShareSocketId = null;
            io.to(currentRoomId).emit('video:screen-share-stopped', { userId: socket.user.userId });
          }
        }
        await handleLeave(socket, currentRoomId, io);
        currentRoomId = null;
      }
    });
  });

  // ─── Handle Leave ───────────────────────────────────────────────
  async function handleLeave(socket, roomId, io) {
    const room = rooms.get(roomId);
    if (!room) return;
    room.users.delete(socket.id);
    room.awarenessStates.delete(socket.user.userId);
    room.awarenessTimestamps.delete(socket.user.userId);
    socket.leave(roomId);
    socket.to(roomId).emit('room:user-left', { userId: socket.user.userId, username: socket.user.username });
    socket.to(roomId).emit('voice:user-left', { userId: socket.user.userId });
    socket.to(roomId).emit('video:user-left', { userId: socket.user.userId });
    const leaveMsg = {
      roomId, userId: 'system', username: 'System',
      content: `${socket.user.username} left`, type: 'system', color: '#6b7280',
    };
    io.to(roomId).emit('chat:message', leaveMsg);
    if (getConnectionStatus()) Message.create(leaveMsg).catch(() => {});
    roomStatsCache = null;

    if (room.users.size === 0) {
      scheduleCleanup(roomId);
    }
  }

  // ─── Periodic Maintenance ───────────────────────────────────────
  // Stale room cleanup + awareness expiration
  const maintenanceInterval = setInterval(() => {
    for (const [roomId, room] of rooms.entries()) {
      if (room.users.size === 0 && !pendingCleanupTimers.has(roomId)) {
        // Orphaned empty room with no pending cleanup — force cleanup
        cleanupRoom(roomId);
        continue;
      }
      cleanExpiredAwareness(room);
    }
  }, 60000);
  globalIntervals.push(maintenanceInterval);

  // Room stats logging
  const statsInterval = setInterval(() => {
    if (rooms.size > 0) {
      let totalUsers = 0;
      for (const room of rooms.values()) totalUsers += room.users.size;
      const memUsage = process.memoryUsage();
      console.log(`[Rooms] Active: ${rooms.size} rooms, ${totalUsers} users, RSS: ${Math.round(memUsage.rss / 1048576)}MB, Heap: ${Math.round(memUsage.heapUsed / 1048576)}MB`);
    }
  }, 120000);
  globalIntervals.push(statsInterval);

  // v9: Rate limiter GC — clean entries for disconnected sockets
  const rateLimiterGcInterval = setInterval(() => {
    for (const [roomId, limiters] of roomRateLimiters.entries()) {
      const room = rooms.get(roomId);
      if (!room) {
        roomRateLimiters.delete(roomId);
        continue;
      }
      // Clean limiter entries for sockets no longer in the room
      for (const limiterFn of Object.values(limiters)) {
        if (limiterFn.clients) {
          for (const socketId of limiterFn.clients.keys()) {
            if (!room.users.has(socketId)) {
              limiterFn.clients.delete(socketId);
            }
          }
        }
      }
    }
  }, RATE_LIMITER_GC_INTERVAL);
  globalIntervals.push(rateLimiterGcInterval);
}

// ─── Cached Active Rooms ───────────────────────────────────────────────
function getActiveRooms() {
  const now = Date.now();
  if (roomStatsCache && (now - roomStatsCacheTime) < STATS_CACHE_TTL) {
    return roomStatsCache;
  }
  const info = [];
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.size > 0) {
      info.push({
        roomId,
        roomName: room.roomName || null,
        userCount: room.users.size,
        users: Array.from(room.users.values()).map(u => u.username),
        // v12: Include detailed user list with socketIds for kick feature
        userDetails: Array.from(room.users.values()).map(u => ({
          socketId: u.socketId,
          username: u.username,
          userId: u.userId,
          joinedAt: u.joinedAt,
        })),
        isPublic: room.isPublic,
        language: room.language,
        videoUsers: room.videoUsers.size,
        screenSharing: !!room.screenShareUser,
      });
    }
  }
  roomStatsCache = info;
  roomStatsCacheTime = now;
  return info;
}

// ─── v9: Graceful Shutdown ─────────────────────────────────────────────
async function gracefulShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('[Rooms] Graceful shutdown initiated — persisting all rooms...');

  // Clear all global intervals
  for (const interval of globalIntervals) {
    clearInterval(interval);
  }
  globalIntervals.length = 0;

  // Clear all pending cleanup timers
  for (const [, timerId] of pendingCleanupTimers) {
    clearTimeout(timerId);
  }
  pendingCleanupTimers.clear();

  // Persist all dirty rooms
  const persistPromises = [];
  for (const [roomId, room] of rooms.entries()) {
    if (room.persistTimer) {
      clearInterval(room.persistTimer);
      room.persistTimer = null;
    }
    if (room._awarenessBatchTimer) {
      clearTimeout(room._awarenessBatchTimer);
      room._awarenessBatchTimer = null;
    }
    if (room.dirty) {
      persistPromises.push(
        persistRoomState(roomId).catch(err => {
          console.error(`[Room:${roomId}] Shutdown persist failed:`, err.message);
        })
      );
    }
    room.ydoc.destroy();
  }

  if (persistPromises.length > 0) {
    await Promise.allSettled(persistPromises);
    console.log(`[Rooms] Persisted ${persistPromises.length} dirty rooms`);
  }

  rooms.clear();
  roomRateLimiters.clear();
  roomStatsCache = null;
  console.log('[Rooms] Shutdown complete');
}

// ─── v9: Health Stats ──────────────────────────────────────────────────
function getHealthStats() {
  let totalUsers = 0;
  let totalVoice = 0;
  let totalVideo = 0;
  for (const room of rooms.values()) {
    totalUsers += room.users.size;
    totalVoice += room.voiceUsers.size;
    totalVideo += room.videoUsers.size;
  }
  const mem = process.memoryUsage();
  return {
    rooms: rooms.size,
    maxRooms: MAX_ROOMS,
    totalUsers,
    totalVoice,
    totalVideo,
    pendingCleanups: pendingCleanupTimers.size,
    rateLimiters: roomRateLimiters.size,
    memoryRss: Math.round(mem.rss / 1048576),
    memoryHeap: Math.round(mem.heapUsed / 1048576),
    isShuttingDown,
  };
}

module.exports = { initRoomHandler, getActiveRooms, roomExists, gracefulShutdown, getHealthStats, renameRoom, kickUser };
