/**
 * Workspace Model v6.0 — Persistent saved workspaces
 * 
 * Users can save their coding sessions as workspaces,
 * with full code, language, and metadata preservation.
 */

const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 255 },
  content: { type: String, default: '', maxlength: 500000 },
  language: { type: String, default: 'javascript' },
  order: { type: Number, default: 0 },
}, { _id: true });

const workspaceSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  description: {
    type: String,
    default: '',
    maxlength: 500,
  },
  language: {
    type: String,
    default: 'javascript',
  },
  // Main code content
  code: {
    type: String,
    default: '',
    maxlength: 500000,
  },
  // Multi-file support
  files: [fileSchema],
  // Template info
  isTemplate: {
    type: Boolean,
    default: false,
  },
  templateCategory: {
    type: String,
    enum: ['', 'algorithms', 'data-structures', 'web', 'api', 'games', 'ml', 'utilities', 'starter'],
    default: '',
  },
  // Sharing
  isPublic: {
    type: Boolean,
    default: false,
  },
  forkCount: {
    type: Number,
    default: 0,
  },
  forkedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    default: null,
  },
  // Tags
  tags: [{
    type: String,
    maxlength: 30,
  }],
  // Stats
  lastOpenedAt: {
    type: Date,
    default: Date.now,
  },
  openCount: {
    type: Number,
    default: 0,
  },
  // Collaboration
  collaborators: [{
    userId: String,
    username: String,
    permission: { type: String, enum: ['edit', 'view'], default: 'view' },
    addedAt: { type: Date, default: Date.now },
  }],
}, {
  timestamps: true,
  collection: 'workspaces',
});

workspaceSchema.index({ userId: 1, updatedAt: -1 });
workspaceSchema.index({ isPublic: 1, updatedAt: -1 });
workspaceSchema.index({ isTemplate: 1, templateCategory: 1 });
workspaceSchema.index({ tags: 1 });

// Get user's workspaces
workspaceSchema.statics.getUserWorkspaces = async function(userId, { page = 1, limit = 20, sort = '-updatedAt' } = {}) {
  const skip = (page - 1) * limit;
  const [workspaces, total] = await Promise.all([
    this.find({ userId }).sort(sort).skip(skip).limit(limit).lean(),
    this.countDocuments({ userId }),
  ]);
  return { workspaces, total, page, pages: Math.ceil(total / limit) };
};

// Get public workspaces
workspaceSchema.statics.getPublicWorkspaces = async function({ page = 1, limit = 20, language, tag } = {}) {
  const filter = { isPublic: true };
  if (language) filter.language = language;
  if (tag) filter.tags = tag;
  const skip = (page - 1) * limit;
  const [workspaces, total] = await Promise.all([
    this.find(filter).sort('-updatedAt').skip(skip).limit(limit).lean(),
    this.countDocuments(filter),
  ]);
  return { workspaces, total, page, pages: Math.ceil(total / limit) };
};

// Get templates
workspaceSchema.statics.getTemplates = async function(category) {
  const filter = { isTemplate: true };
  if (category) filter.templateCategory = category;
  return this.find(filter).sort('name').lean();
};

module.exports = mongoose.model('Workspace', workspaceSchema);
