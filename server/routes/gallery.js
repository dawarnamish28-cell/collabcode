/**
 * Gallery Routes — Public code snippet sharing
 * 
 * POST /api/gallery         - Submit a code snippet
 * GET  /api/gallery         - List recent snippets
 * GET  /api/gallery/:id     - Get a specific snippet
 * POST /api/gallery/:id/run - Run a snippet
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// In-memory gallery store (would be DB in production)
const gallerySnippets = [];

router.post('/', authMiddleware, asyncHandler(async (req, res) => {
  const { title, description, code, language } = req.body;
  if (!title || !code || !language) {
    return res.status(400).json({ error: true, message: 'Title, code, and language are required' });
  }
  if (title.length > 100) return res.status(400).json({ error: true, message: 'Title too long (max 100 chars)' });
  if (code.length > 50000) return res.status(400).json({ error: true, message: 'Code too large (max 50KB)' });

  const snippet = {
    id: uuidv4().substring(0, 8),
    title: title.trim(),
    description: (description || '').trim().substring(0, 500),
    code, language,
    author: req.user.username,
    authorColor: req.user.color,
    createdAt: new Date().toISOString(),
    views: 0,
    likes: 0,
  };
  gallerySnippets.unshift(snippet);
  // Keep max 200 snippets in memory
  if (gallerySnippets.length > 200) gallerySnippets.pop();
  res.json({ success: true, snippet });
}));

router.get('/', asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const lang = req.query.language;
  let filtered = gallerySnippets;
  if (lang) filtered = filtered.filter(s => s.language === lang);
  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit).map(s => ({
    ...s, code: s.code.substring(0, 300) + (s.code.length > 300 ? '...' : ''),
  }));
  res.json({ snippets: items, total: filtered.length, page, pages: Math.ceil(filtered.length / limit) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const snippet = gallerySnippets.find(s => s.id === req.params.id);
  if (!snippet) return res.status(404).json({ error: true, message: 'Snippet not found' });
  snippet.views++;
  res.json({ snippet });
}));

module.exports = router;
