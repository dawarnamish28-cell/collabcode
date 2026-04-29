/**
 * User Model v6.0 — Persistent accounts with profiles
 * 
 * Supports email/password auth, avatar customization, workspace saving,
 * and team membership tracking.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 2,
    maxlength: 30,
    index: true,
  },
  displayName: {
    type: String,
    default: '',
    maxlength: 50,
  },
  color: {
    type: String,
    default: '#5e9eff',
  },
  avatarEmoji: {
    type: String,
    default: '',
  },
  bio: {
    type: String,
    default: '',
    maxlength: 200,
  },
  role: {
    type: String,
    enum: ['user', 'pro', 'admin'],
    default: 'user',
  },
  // Team memberships
  teams: [{
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    role: { type: String, enum: ['owner', 'admin', 'editor', 'viewer'], default: 'editor' },
    joinedAt: { type: Date, default: Date.now },
  }],
  // Activity tracking
  lastActive: { type: Date, default: Date.now },
  totalSessions: { type: Number, default: 0 },
  totalCodeRuns: { type: Number, default: 0 },
  favoriteLanguages: [{ type: String }],
  // Settings
  settings: {
    theme: { type: String, default: 'vs-dark' },
    fontSize: { type: Number, default: 14 },
    tabSize: { type: Number, default: 2 },
    minimap: { type: Boolean, default: true },
    wordWrap: { type: Boolean, default: true },
    cursorStyle: { type: String, default: 'line' },
    bracketColors: { type: Boolean, default: true },
    lineNumbers: { type: Boolean, default: true },
    autoSave: { type: Boolean, default: true },
    notifications: { type: Boolean, default: true },
  },
}, {
  timestamps: true,
  collection: 'users',
});

// Password hashing
userSchema.pre('save', async function(next) {
  if (!this.isModified('passwordHash')) return next();
  // passwordHash is already hashed before being set
  next();
});

userSchema.methods.comparePassword = async function(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.toPublic = function() {
  return {
    userId: this._id.toString(),
    email: this.email,
    username: this.username,
    displayName: this.displayName || this.username,
    color: this.color,
    avatarEmoji: this.avatarEmoji,
    bio: this.bio,
    role: this.role,
    settings: this.settings,
    totalSessions: this.totalSessions,
    totalCodeRuns: this.totalCodeRuns,
    favoriteLanguages: this.favoriteLanguages,
    createdAt: this.createdAt,
    lastActive: this.lastActive,
  };
};

userSchema.index({ lastActive: -1 });
userSchema.index({ 'teams.teamId': 1 });

module.exports = mongoose.model('User', userSchema);
