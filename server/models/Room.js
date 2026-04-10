/**
 * Room Model v5.0
 * 
 * Supports public/private rooms, 15 languages, CRDT state persistence.
 */

const mongoose = require('mongoose');

const ALL_LANGUAGES = [
  'javascript', 'typescript', 'python', 'java', 'cpp', 'c',
  'go', 'rust', 'ruby', 'php', 'perl', 'r', 'bash', 'shell', 'awk',
];

const participantSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String, required: true },
  color: { type: String, default: '#3b82f6' },
  joinedAt: { type: Date, default: Date.now },
}, { _id: false });

const roomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true, index: true },
  name: { type: String, default: 'Untitled Room', maxlength: 100 },
  language: { type: String, default: 'javascript', enum: ALL_LANGUAGES },
  participants: [participantSchema],
  activeCount: { type: Number, default: 0 },
  isPublic: { type: Boolean, default: false },
  crdtState: { type: Buffer, default: null },
  lastCodeSnapshot: { type: String, default: '', maxlength: 500000 },
  createdBy: { type: String, default: 'anonymous' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, collection: 'rooms' });

roomSchema.index({ isActive: 1, updatedAt: -1 });
roomSchema.index({ isPublic: 1, isActive: 1 });

roomSchema.statics.cleanupStale = async function() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.updateMany(
    { updatedAt: { $lt: cutoff }, activeCount: 0 },
    { $set: { isActive: false } }
  );
};

module.exports = mongoose.model('Room', roomSchema);
