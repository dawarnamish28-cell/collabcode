/**
 * Room Model
 * 
 * Stores room metadata and the latest CRDT state snapshot.
 * The crdtState field holds the binary-encoded Yjs document
 * for reconstruction when a room is reopened.
 */

const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String, required: true },
  color: { type: String, default: '#3b82f6' },
  joinedAt: { type: Date, default: Date.now },
}, { _id: false });

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  name: {
    type: String,
    default: 'Untitled Room',
    maxlength: 100,
  },
  language: {
    type: String,
    default: 'javascript',
    enum: ['javascript', 'typescript', 'python', 'java', 'cpp', 'c', 'go', 'rust', 'ruby', 'php'],
  },
  participants: [participantSchema],
  activeCount: {
    type: Number,
    default: 0,
  },
  crdtState: {
    type: Buffer,
    default: null,
  },
  lastCodeSnapshot: {
    type: String,
    default: '',
    maxlength: 500000, // 500KB max
  },
  createdBy: {
    type: String,
    default: 'anonymous',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
  collection: 'rooms',
});

// Index for querying active rooms
roomSchema.index({ isActive: 1, updatedAt: -1 });

// Clean up stale rooms (inactive for 24+ hours)
roomSchema.statics.cleanupStale = async function() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.updateMany(
    { updatedAt: { $lt: cutoff }, activeCount: 0 },
    { $set: { isActive: false } }
  );
};

module.exports = mongoose.model('Room', roomSchema);
