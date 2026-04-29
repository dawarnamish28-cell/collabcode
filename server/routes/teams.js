/**
 * Team Routes v6.0 — Team permissions & collaboration
 * 
 * Owner/Admin/Editor/Viewer role-based access control.
 * Team creation, member management, invites.
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { getConnectionStatus } = require('../config/db');

let Team;
try { Team = require('../models/Team'); } catch (e) {}

// In-memory fallback
const memTeams = new Map();

const PERMISSION_LEVELS = { owner: 4, admin: 3, editor: 2, viewer: 1 };

function hasPermission(team, userId, requiredRole) {
  if (team.ownerId === userId) return true;
  const member = (team.members || []).find(m => m.userId === userId);
  if (!member) return false;
  return PERMISSION_LEVELS[member.role] >= PERMISSION_LEVELS[requiredRole];
}

// Create team
router.post('/', authMiddleware, asyncHandler(async (req, res) => {
  const { name, description, color, icon } = req.body;
  if (!name || name.length > 50) return res.status(400).json({ error: true, message: 'Name required (max 50 chars)' });

  const userId = req.user.userId;

  if (getConnectionStatus() && Team) {
    const count = await Team.countDocuments({ ownerId: userId });
    if (count >= 10) return res.status(400).json({ error: true, message: 'Max 10 teams per user' });
    const team = await Team.create({
      name: name.trim(), description: (description || '').trim(),
      color: color || '#5e9eff', icon: icon || '',
      ownerId: userId,
      members: [{ userId, username: req.user.username, color: req.user.color, role: 'owner' }],
    });
    return res.json({ success: true, team: team.toPublic() });
  }

  // In-memory
  const team = {
    id: uuidv4().slice(0, 8),
    name: name.trim(), description: (description || '').trim(),
    color: color || '#5e9eff', icon: icon || '',
    ownerId: userId,
    members: [{ userId, username: req.user.username, color: req.user.color, role: 'owner', joinedAt: new Date() }],
    pendingInvites: [], rooms: [], defaultPermission: 'editor',
    maxMembers: 25, isActive: true, createdAt: new Date(),
  };
  memTeams.set(team.id, team);
  res.json({ success: true, team });
}));

// List user's teams
router.get('/', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  if (getConnectionStatus() && Team) {
    const teams = await Team.find({
      $or: [{ ownerId: userId }, { 'members.userId': userId }],
      isActive: true,
    }).lean();
    return res.json({ teams: teams.map(t => ({ ...t, id: t._id.toString() })) });
  }

  const teams = [];
  for (const [, team] of memTeams) {
    if (team.ownerId === userId || team.members.some(m => m.userId === userId)) {
      teams.push(team);
    }
  }
  res.json({ teams });
}));

// Get team details
router.get('/:id', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  if (getConnectionStatus() && Team) {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ error: true, message: 'Team not found' });
    if (!team.getMemberRole(userId)) return res.status(403).json({ error: true, message: 'Not a member' });
    return res.json({ team: team.toPublic() });
  }

  const team = memTeams.get(req.params.id);
  if (!team) return res.status(404).json({ error: true, message: 'Team not found' });
  if (!hasPermission(team, userId, 'viewer')) return res.status(403).json({ error: true, message: 'Not a member' });
  res.json({ team });
}));

// Update team (admin+)
router.put('/:id', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { name, description, color, icon, defaultPermission } = req.body;

  if (getConnectionStatus() && Team) {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ error: true, message: 'Team not found' });
    if (!team.canAdmin(userId)) return res.status(403).json({ error: true, message: 'Admin permission required' });
    if (name) team.name = name.trim();
    if (description !== undefined) team.description = description.trim();
    if (color) team.color = color;
    if (icon !== undefined) team.icon = icon;
    if (defaultPermission) team.defaultPermission = defaultPermission;
    await team.save();
    return res.json({ success: true, team: team.toPublic() });
  }

  const team = memTeams.get(req.params.id);
  if (!team) return res.status(404).json({ error: true, message: 'Team not found' });
  if (!hasPermission(team, userId, 'admin')) return res.status(403).json({ error: true, message: 'Admin permission required' });
  if (name) team.name = name.trim();
  if (description !== undefined) team.description = description.trim();
  if (color) team.color = color;
  if (icon !== undefined) team.icon = icon;
  if (defaultPermission) team.defaultPermission = defaultPermission;
  res.json({ success: true, team });
}));

// Add member (admin+)
router.post('/:id/members', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { targetUserId, targetUsername, targetColor, role } = req.body;
  if (!targetUserId || !targetUsername) return res.status(400).json({ error: true, message: 'User info required' });
  const memberRole = role || 'editor';
  if (!['admin', 'editor', 'viewer'].includes(memberRole)) return res.status(400).json({ error: true, message: 'Invalid role' });

  if (getConnectionStatus() && Team) {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ error: true, message: 'Team not found' });
    if (!team.canAdmin(userId)) return res.status(403).json({ error: true, message: 'Admin permission required' });
    if (team.members.length >= team.maxMembers) return res.status(400).json({ error: true, message: 'Team is full' });
    if (team.members.some(m => m.userId === targetUserId)) return res.status(400).json({ error: true, message: 'Already a member' });
    team.members.push({ userId: targetUserId, username: targetUsername, color: targetColor || '#5e9eff', role: memberRole, invitedBy: userId });
    await team.save();
    return res.json({ success: true, team: team.toPublic() });
  }

  const team = memTeams.get(req.params.id);
  if (!team) return res.status(404).json({ error: true, message: 'Team not found' });
  if (!hasPermission(team, userId, 'admin')) return res.status(403).json({ error: true, message: 'Admin permission required' });
  if (team.members.length >= 25) return res.status(400).json({ error: true, message: 'Team is full' });
  if (team.members.some(m => m.userId === targetUserId)) return res.status(400).json({ error: true, message: 'Already a member' });
  team.members.push({ userId: targetUserId, username: targetUsername, color: targetColor || '#5e9eff', role: memberRole, joinedAt: new Date(), invitedBy: userId });
  res.json({ success: true, team });
}));

// Update member role (admin+)
router.put('/:id/members/:memberId', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { role } = req.body;
  if (!role || !['admin', 'editor', 'viewer'].includes(role)) return res.status(400).json({ error: true, message: 'Valid role required' });

  if (getConnectionStatus() && Team) {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ error: true, message: 'Team not found' });
    if (!team.canAdmin(userId)) return res.status(403).json({ error: true, message: 'Admin permission required' });
    const member = team.members.find(m => m.userId === req.params.memberId);
    if (!member) return res.status(404).json({ error: true, message: 'Member not found' });
    if (member.userId === team.ownerId) return res.status(400).json({ error: true, message: 'Cannot change owner role' });
    member.role = role;
    await team.save();
    return res.json({ success: true, team: team.toPublic() });
  }

  const team = memTeams.get(req.params.id);
  if (!team) return res.status(404).json({ error: true, message: 'Team not found' });
  if (!hasPermission(team, userId, 'admin')) return res.status(403).json({ error: true, message: 'Admin permission required' });
  const member = team.members.find(m => m.userId === req.params.memberId);
  if (!member) return res.status(404).json({ error: true, message: 'Member not found' });
  if (member.userId === team.ownerId) return res.status(400).json({ error: true, message: 'Cannot change owner role' });
  member.role = role;
  res.json({ success: true, team });
}));

// Remove member (admin+)
router.delete('/:id/members/:memberId', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  if (getConnectionStatus() && Team) {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ error: true, message: 'Team not found' });
    if (!team.canAdmin(userId) && req.params.memberId !== userId) return res.status(403).json({ error: true, message: 'Permission denied' });
    if (req.params.memberId === team.ownerId) return res.status(400).json({ error: true, message: 'Cannot remove owner' });
    team.members = team.members.filter(m => m.userId !== req.params.memberId);
    await team.save();
    return res.json({ success: true, team: team.toPublic() });
  }

  const team = memTeams.get(req.params.id);
  if (!team) return res.status(404).json({ error: true, message: 'Team not found' });
  if (!hasPermission(team, userId, 'admin') && req.params.memberId !== userId) return res.status(403).json({ error: true, message: 'Permission denied' });
  if (req.params.memberId === team.ownerId) return res.status(400).json({ error: true, message: 'Cannot remove owner' });
  team.members = team.members.filter(m => m.userId !== req.params.memberId);
  res.json({ success: true, team });
}));

// Delete team (owner only)
router.delete('/:id', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  if (getConnectionStatus() && Team) {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ error: true, message: 'Team not found' });
    if (!team.isOwner(userId)) return res.status(403).json({ error: true, message: 'Only owner can delete' });
    await team.deleteOne();
    return res.json({ success: true });
  }

  const team = memTeams.get(req.params.id);
  if (!team) return res.status(404).json({ error: true, message: 'Team not found' });
  if (team.ownerId !== userId) return res.status(403).json({ error: true, message: 'Only owner can delete' });
  memTeams.delete(req.params.id);
  res.json({ success: true });
}));

// Check room permission for a user
router.get('/:id/room-permission/:roomId', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  if (getConnectionStatus() && Team) {
    const team = await Team.findById(req.params.id);
    if (!team) return res.json({ permission: null });
    const role = team.getMemberRole(userId);
    return res.json({ permission: role, canEdit: team.canEdit(userId), canAdmin: team.canAdmin(userId) });
  }

  const team = memTeams.get(req.params.id);
  if (!team) return res.json({ permission: null });
  const member = team.members.find(m => m.userId === userId);
  const role = team.ownerId === userId ? 'owner' : member?.role || null;
  res.json({
    permission: role,
    canEdit: hasPermission(team, userId, 'editor'),
    canAdmin: hasPermission(team, userId, 'admin'),
  });
}));

module.exports = router;
