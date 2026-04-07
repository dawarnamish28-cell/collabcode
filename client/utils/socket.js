/**
 * Socket.io Client — v2.0
 * 
 * Singleton socket per tab. Includes tabId for per-tab identity.
 * Handles reconnection gracefully.
 */

import { io } from 'socket.io-client';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';
let socket = null;

export function getSocket(auth = {}) {
  if (socket && socket.connected) return socket;
  if (socket) socket.disconnect();

  socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 15000,
    auth: {
      userId: auth.userId || '',
      username: auth.username || '',
      color: auth.color || '',
      token: auth.token || '',
      tabId: auth.tabId || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('collabcode_tab_id') : ''),
    },
  });

  socket.on('connect', () => console.log('[Socket] Connected:', socket.id));
  socket.on('disconnect', (reason) => console.log('[Socket] Disconnected:', reason));
  socket.on('connect_error', (err) => console.error('[Socket] Error:', err.message));
  socket.on('reconnect', (n) => console.log('[Socket] Reconnected after', n, 'attempts'));

  return socket;
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}

export function getCurrentSocket() { return socket; }
export default getSocket;
