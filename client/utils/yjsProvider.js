/**
 * Yjs Provider Setup v2.0
 * 
 * Configures Yjs document and custom Socket.io-based provider
 * for CRDT synchronization. Uses binary updates for efficiency.
 * 
 * v2.0 changes:
 * - All remote updates use origin 'remote' for proper transaction tracking
 * - Server state uses origin 'server'
 * - This allows Editor.js to distinguish local vs remote changes
 *   and prevent double-typing bugs.
 * 
 * made with <3 by Namish
 */

import * as Y from 'yjs';

/**
 * Create a new Yjs document
 */
export function createYjsDoc() {
  return new Y.Doc();
}

/**
 * Custom Socket.io-based Yjs provider
 * Replaces y-websocket with Socket.io transport for better
 * integration with our existing connection management.
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

    this._setupListeners();
  }

  _setupListeners() {
    // Listen for incoming CRDT updates from server (remote edits)
    this._onRemoteUpdate = (data) => {
      if (this._destroyed) return;
      try {
        const update = new Uint8Array(data.update);
        // Apply with 'remote' origin so the Editor knows not to re-emit this
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
          // Apply with 'server' origin
          Y.applyUpdate(this.ydoc, update, 'server');
          console.log('[YjsProvider] Applied initial state');
        }
        this.synced = true;
      } catch (err) {
        console.error('[YjsProvider] Error applying initial state:', err);
      }
    };
    this.socket.on('room:state', this._onRoomState);

    // Listen for local document changes and send to server
    this._onLocalUpdate = (update, origin) => {
      if (this._destroyed) return;
      // Don't re-send updates that came from the server
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

  setAwarenessState(state) {
    if (this._destroyed) return;
    this.socket.emit('awareness:update', state);
  }

  getAwarenessStates() {
    return new Map(this.awareness);
  }

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

  destroy() {
    this._destroyed = true;
    this.ydoc.off('update', this._onLocalUpdate);
    this.socket.off('crdt:update', this._onRemoteUpdate);
    this.socket.off('room:state', this._onRoomState);
    this.socket.off('awareness:update', this._onRemoteAwareness);
    this.socket.off('room:user-left', this._onUserLeft);
    this.awareness.clear();
    this._listeners.clear();
  }
}

export default { createYjsDoc, SocketIOProvider };
