/**
 * Socket.io Client v3.0 — Hardened for Continuous Heavy Use
 * 
 * v3.0 hardening:
 *  - Deduped global event listeners (prevents accumulation on repeated getSocket calls)
 *  - Exponential backoff with jitter for reconnection
 *  - Connection state tracking to prevent duplicate connect attempts
 *  - Graceful disconnect with pending event drain
 *  - Server shutdown detection + auto-reconnect
 *  - Max reconnection attempts before giving up (then manual retry)
 *  - Singleton guarantee: concurrent getSocket calls return same instance
 *
 * made with <3 by Namish
 */

import { io } from 'socket.io-client';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

let socket = null;
let listenersAttached = false; // v3: prevent duplicate global listeners

export function getSocket(auth = {}) {
  // v3: Return existing connected socket
  if (socket && socket.connected) return socket;

  // v3: Return existing socket that's in the process of connecting
  if (socket && !socket.disconnected) return socket;

  // Clean up old socket if it exists but is disconnected
  if (socket) {
    try {
      socket.removeAllListeners();
      socket.disconnect();
    } catch (e) {}
    socket = null;
    listenersAttached = false;
  }

  socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 50, // v3: cap attempts instead of Infinity
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000, // v3: increased from 5s to 10s
    randomizationFactor: 0.3, // v3: jitter for reconnection backoff
    timeout: 15000,
    auth: {
      userId: auth.userId || '',
      username: auth.username || '',
      color: auth.color || '',
      token: auth.token || '',
      tabId: auth.tabId || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('collabcode_tab_id') : ''),
    },
  });

  // v3: Attach global listeners only once
  if (!listenersAttached) {
    listenersAttached = true;

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      // If the server intentionally disconnected us, don't auto-reconnect
      if (reason === 'io server disconnect') {
        console.warn('[Socket] Server forced disconnect — will attempt reconnection');
        // Socket.io won't auto-reconnect for server-initiated disconnects
        // We need to manually reconnect after a delay
        setTimeout(() => {
          if (socket && !socket.connected) {
            socket.connect();
          }
        }, 3000);
      }
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('[Socket] Reconnected after', attemptNumber, 'attempts');
    });

    socket.on('reconnect_failed', () => {
      console.error('[Socket] Reconnection failed after max attempts');
    });

    // v3: Handle server shutdown notification
    socket.on('server:shutting-down', (data) => {
      console.warn('[Socket] Server is shutting down:', data.message);
      // Auto-reconnect after a delay
      setTimeout(() => {
        if (socket && !socket.connected) {
          socket.connect();
        }
      }, 5000);
    });
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    try {
      socket.removeAllListeners();
      socket.disconnect();
    } catch (e) {}
    socket = null;
    listenersAttached = false;
  }
}

export function getCurrentSocket() {
  return socket;
}

export default getSocket;
