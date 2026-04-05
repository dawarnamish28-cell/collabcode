/**
 * Message Model
 * 
 * Stores chat messages associated with rooms.
 * Messages are persisted for history when users rejoin.
 */

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    index: true,
  },
  userId: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
    maxlength: 2000,
    trim: true,
  },
  type: {
    type: String,
    enum: ['chat', 'system', 'code-share'],
    default: 'chat',
  },
  color: {
    type: String,
    default: '#3b82f6',
  },
}, {
  timestamps: true,
  collection: 'messages',
});

// Compound index for efficient room message queries
messageSchema.index({ roomId: 1, createdAt: -1 });

// TTL index: auto-delete messages older than 7 days
messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });

// Get recent messages for a room
messageSchema.statics.getRecentMessages = async function(roomId, limit = 50) {
  return this.find({ roomId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .then(msgs => msgs.reverse());
};

module.exports = mongoose.model('Message', messageSchema);
