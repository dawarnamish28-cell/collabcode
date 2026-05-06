/**
 * Yjs Provider Setup v3.0 — Hardened for Continuous Heavy Use
 * 
 * v3.0 hardening:
 *  - Double-destroy guard (prevents crash on rapid unmount/remount)
 *  - Awareness state cap (max 100 entries to prevent memory bloat)
 *  - Safe event emission (catches errors in listener callbacks)
 *  - CRDT update size validation (rejects excessively large updates)
 *  - Reconnection-safe: handles re-receiving room:state after reconnect
 *  - Debounced local update emission (coalesces rapid edits into fewer socket events)
 *  - Error boundary on all incoming data processing
 *
 * made with <3 by Namish
 */

import * as Y from 'yjs';

const MAX_AWARENESS_STATES = 100;
const MAX_UPDATE_SIZE = 1048576; // 1MB max CRDT update
const LOCAL_UPDATE_DEBOUNCE_MS = 16; // ~1 frame, coalesces fast typing

/**
 * Create a new Yjs document
 */
export function createYjsDoc() {
  return new Y.Doc();
}

/**
 * Custom Socket.io-based Yjs provider — hardened
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
    this._pendingUpdate = null;
    this._updateTimer = null;

    this._setupListeners();
  }

  _setupListeners() {
    // Listen for incoming CRDT updates from server (remote edits)
    this._onRemoteUpdate = (data) => {
      if (this._destroyed) return;
      try {
        if (!data || !data.update) return;
        const update = new Uint8Array(data.update);
        // v3: Reject excessively large updates
        if (update.byteLength > MAX_UPDATE_SIZE) {
          console.warn('[YjsProvider] Rejected oversized update:', update.byteLength, 'bytes');
          return;
        }
        Y.applyUpdate(this.ydoc, update, 'remote');
      } catch (err) {
        console.error('[YjsProvider] Error applying remote update:', err);
      }
    };
    this.socket.on('crdt:update', this._onRemoteUpdate);

    // Listen for initial room state (also handles reconnection)
    this._onRoomState = (data) => {
      if (this._destroyed) return;
      try {
        if (data && data.update && data.update.length > 0) {
          const update = new Uint8Array(data.update);
          if (update.byteLength <= MAX_UPDATE_SIZE) {
            Y.applyUpdate(this.ydoc, update, 'server');
            console.log('[YjsProvider] Applied state (' + (this.synced ? 're-sync' : 'initial') + ')');
          }
        }
        this.synced = true;
      } catch (err) {
        console.error('[YjsProvider] Error applying state:', err);
      }
    };
    this.socket.on('room:state', this._onRoomState);

    // Listen for local document changes and send to server
    // v3: Debounced to coalesce rapid edits
    this._onLocalUpdate = (update, origin) => {
      if (this._destroyed) return;
      if (origin === 'remote' || origin === 'server') return;

      // v3: Debounce — accumulate updates, send merged
      if (this._pendingUpdate) {
        this._pendingUpdate = Y.mergeUpdates([this._pendingUpdate, update]);
      } else {
        this._pendingUpdate = update;
      }

      if (this._updateTimer) return; // already scheduled

      this._updateTimer = setTimeout(() => {
        this._updateTimer = null;
        if (this._destroyed || !this._pendingUpdate) return;
        const merged = this._pendingUpdate;
        this._pendingUpdate = null;

        this.socket.emit('crdt:update', {
          update: Array.from(merged),
          roomId: this.roomId,
        });
      }, LOCAL_UPDATE_DEBOUNCE_MS);
    };
    this.ydoc.on('update', this._onLocalUpdate);

    // Listen for remote awareness updates
    this._onRemoteAwareness = (state) => {
      if (this._destroyed || !state || !state.userId) return;
      // v3: Cap awareness states to prevent memory bloat
      if (this.awareness.size >= MAX_AWARENESS_STATES && !this.awareness.has(state.userId)) {
        return;
      }
      this.awareness.set(state.userId, state);
      this._emitEvent('awareness-change', this.getAwarenessStates());
    };
    this.socket.on('awareness:update', this._onRemoteAwareness);

    // v3: Handle batched awareness updates
    this._onAwarenessBatch = (batch) => {
      if (this._destroyed || !batch) return;
      let changed = false;
      for (const [userId, state] of Object.entries(batch)) {
        if (this.awareness.size >= MAX_AWARENESS_STATES && !this.awareness.has(userId)) {
          continue;
        }
        this.awareness.set(userId, state);
        changed = true;
      }
      if (changed) {
        this._emitEvent('awareness-change', this.getAwarenessStates());
      }
    };
    this.socket.on('awareness:batch', this._onAwarenessBatch);

    // Handle user left (remove awareness)
    this._onUserLeft = (data) => {
      if (this._destroyed || !data) return;
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

  // v3: Safe event emission — catches errors in listeners
  _emitEvent(event, data) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[YjsProvider] Listener error for '${event}':`, err);
        }
      });
    }
  }

  destroy() {
    // v3: Double-destroy guard
    if (this._destroyed) return;
    this._destroyed = true;

    // Clear debounce timer
    if (this._updateTimer) {
      clearTimeout(this._updateTimer);
      this._updateTimer = null;
    }

    // Flush any pending update before destroying
    if (this._pendingUpdate && this.socket) {
      try {
        this.socket.emit('crdt:update', {
          update: Array.from(this._pendingUpdate),
          roomId: this.roomId,
        });
      } catch (e) {}
      this._pendingUpdate = null;
    }

    this.ydoc.off('update', this._onLocalUpdate);
    this.socket.off('crdt:update', this._onRemoteUpdate);
    this.socket.off('room:state', this._onRoomState);
    this.socket.off('awareness:update', this._onRemoteAwareness);
    this.socket.off('awareness:batch', this._onAwarenessBatch);
    this.socket.off('room:user-left', this._onUserLeft);
    this.awareness.clear();
    this._listeners.clear();
  }
}

export default { createYjsDoc, SocketIOProvider };
