/**
 * Team Model v6.0 — Team permissions & collaboration
 * 
 * Supports owner/admin/editor/viewer roles with granular permissions.
 */

const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String, required: true },
  email: { type: String, default: '' },
  color: { type: String, default: '#5e9eff' },
  role: {
    type: String,
    enum: ['owner', 'admin', 'editor', 'viewer'],
    default: 'editor',
  },
  joinedAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
  invitedBy: { type: String, default: '' },
}, { _id: false });

const inviteSchema = new mongoose.Schema({
  email: { type: String, required: true },
  role: { type: String, enum: ['admin', 'editor', 'viewer'], default: 'editor' },
  invitedBy: { type: String, required: true },
  token: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  accepted: { type: Boolean, default: false },
}, { _id: true, timestamps: true });

const teamSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
  },
  description: {
    type: String,
    default: '',
    maxlength: 200,
  },
  color: {
    type: String,
    default: '#5e9eff',
  },
  icon: {
    type: String,
    default: '',
  },
  ownerId: {
    type: String,
    required: true,
    index: true,
  },
  members: [memberSchema],
  pendingInvites: [inviteSchema],
  // Room access settings
  defaultPermission: {
    type: String,
    enum: ['editor', 'viewer'],
    default: 'editor',
  },
  // Rooms owned by this team
  rooms: [{
    roomId: String,
    name: String,
    createdAt: { type: Date, default: Date.now },
    createdBy: String,
  }],
  maxMembers: {
    type: Number,
    default: 25,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
  collection: 'teams',
});

teamSchema.index({ 'members.userId': 1 });
teamSchema.index({ ownerId: 1, isActive: 1 });

// Permission hierarchy
const PERMISSION_LEVELS = { owner: 4, admin: 3, editor: 2, viewer: 1 };

teamSchema.methods.getMemberRole = function(userId) {
  if (this.ownerId === userId) return 'owner';
  const member = this.members.find(m => m.userId === userId);
  return member ? member.role : null;
};

teamSchema.methods.hasPermission = function(userId, requiredRole) {
  const userRole = this.getMemberRole(userId);
  if (!userRole) return false;
  return PERMISSION_LEVELS[userRole] >= PERMISSION_LEVELS[requiredRole];
};

teamSchema.methods.canEdit = function(userId) {
  return this.hasPermission(userId, 'editor');
};

teamSchema.methods.canAdmin = function(userId) {
  return this.hasPermission(userId, 'admin');
};

teamSchema.methods.isOwner = function(userId) {
  return this.ownerId === userId;
};

teamSchema.methods.toPublic = function() {
  return {
    id: this._id.toString(),
    name: this.name,
    description: this.description,
    color: this.color,
    icon: this.icon,
    ownerId: this.ownerId,
    memberCount: this.members.length,
    members: this.members.map(m => ({
      userId: m.userId,
      username: m.username,
      color: m.color,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
    defaultPermission: this.defaultPermission,
    rooms: this.rooms,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('Team', teamSchema);
module.exports.PERMISSION_LEVELS = PERMISSION_LEVELS;
