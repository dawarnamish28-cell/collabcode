/**
 * Socket.io Client Initialization
 * 
 * Manages the WebSocket connection to the backend server.
 * Singleton pattern ensures one connection per client.
 * Handles reconnection and authentication.
 */

import { io } from 'socket.io-client';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

let socket = null;

/**
 * Initialize or get existing socket connection
 */
export function getSocket(auth = {}) {
  if (socket && socket.connected) {
    return socket;
  }

  if (socket) {
    socket.disconnect();
  }

  socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    auth: {
      userId: auth.userId || '',
      username: auth.username || '',
      color: auth.color || '',
      token: auth.token || '',
    },
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log('[Socket] Reconnected after', attemptNumber, 'attempts');
  });

  socket.on('reconnect_attempt', (attemptNumber) => {
    console.log('[Socket] Reconnection attempt', attemptNumber);
  });

  return socket;
}

/**
 * Disconnect and cleanup socket
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Get current socket instance (may be null)
 */
export function getCurrentSocket() {
  return socket;
}

export default getSocket;
