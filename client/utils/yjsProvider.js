/**
 * Yjs Provider Setup
 * 
 * Configures Yjs document and custom Socket.io-based provider
 * for CRDT synchronization. Uses binary updates for efficiency.
 * 
 * Architecture:
 * - Yjs Doc holds the shared document state (CRDT)
 * - Socket.io transports binary updates between clients
 * - Server relays updates and persists periodic snapshots
 * - Awareness tracks cursor positions and user presence
 */

import * as Y from 'yjs';

/**
 * Create a new Yjs document and awareness instance
 */
export function createYjsDoc() {
  const ydoc = new Y.Doc();
  return ydoc;
}

/**
 * Custom Socket.io-based Yjs provider
 * Replaces y-websocket with Socket.io transport for better
 * integration with our existing connection management
 */
export class SocketIOProvider {
  constructor(ydoc, socket, roomId) {
    this.ydoc = ydoc;
    this.socket = socket;
    this.roomId = roomId;
    this.synced = false;
    this.awareness = new Map();
    this._listeners = new Map();
    this._destroyed = false;

    // Buffer for batching updates
    this._updateBuffer = [];
    this._flushTimer = null;

    this._setupListeners();
  }

  _setupListeners() {
    // Listen for incoming CRDT updates from server
    this._onRemoteUpdate = (data) => {
      if (this._destroyed) return;
      try {
        const update = new Uint8Array(data.update);
        Y.applyUpdate(this.ydoc, update, 'remote');
      } catch (err) {
        console.error('[YjsProvider] Error applying remote update:', err);
      }
    };
    this.socket.on('crdt:update', this._onRemoteUpdate);

    // Listen for initial room state
    this._onRoomState = (data) => {
      if (this._destroyed) return;
      try {
        if (data.update && data.update.length > 0) {
          const update = new Uint8Array(data.update);
          Y.applyUpdate(this.ydoc, update, 'server');
          console.log('[YjsProvider] Applied initial state');
        }
        this.synced = true;
      } catch (err) {
        console.error('[YjsProvider] Error applying initial state:', err);
      }
    };
    this.socket.on('room:state', this._onRoomState);

    // Listen for local document changes
    this._onLocalUpdate = (update, origin) => {
      if (this._destroyed) return;
      if (origin === 'remote' || origin === 'server') return;

      // Send update to server as array (JSON-compatible)
      this.socket.emit('crdt:update', {
        update: Array.from(update),
        roomId: this.roomId,
      });
    };
    this.ydoc.on('update', this._onLocalUpdate);

    // Listen for remote awareness updates
    this._onRemoteAwareness = (state) => {
      if (this._destroyed) return;
      this.awareness.set(state.userId, state);
      this._emitEvent('awareness-change', this.getAwarenessStates());
    };
    this.socket.on('awareness:update', this._onRemoteAwareness);

    // Handle user left (remove awareness)
    this._onUserLeft = (data) => {
      if (this._destroyed) return;
      this.awareness.delete(data.userId);
      this._emitEvent('awareness-change', this.getAwarenessStates());
    };
    this.socket.on('room:user-left', this._onUserLeft);
  }

  /**
   * Set local awareness state (cursor position, selection, etc.)
   */
  setAwarenessState(state) {
    if (this._destroyed) return;
    this.socket.emit('awareness:update', state);
  }

  /**
   * Get all awareness states
   */
  getAwarenessStates() {
    return new Map(this.awareness);
  }

  /**
   * Event emitter
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
  }

  off(event, callback) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).delete(callback);
    }
  }

  _emitEvent(event, data) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).forEach(cb => cb(data));
    }
  }

  /**
   * Destroy provider and cleanup
   */
  destroy() {
    this._destroyed = true;

    this.ydoc.off('update', this._onLocalUpdate);
    this.socket.off('crdt:update', this._onRemoteUpdate);
    this.socket.off('room:state', this._onRoomState);
    this.socket.off('awareness:update', this._onRemoteAwareness);
    this.socket.off('room:user-left', this._onUserLeft);

    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
    }

    this.awareness.clear();
    this._listeners.clear();
  }
}

export default { createYjsDoc, SocketIOProvider };
