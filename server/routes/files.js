/**
 * File Save / Open Routes v5.0 — 15 languages
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const EXT_MAP = {
  javascript: '.js', typescript: '.ts', python: '.py',
  java: '.java', c: '.c', cpp: '.cpp',
  go: '.go', rust: '.rs', ruby: '.rb', php: '.php',
  perl: '.pl', r: '.R', bash: '.sh', shell: '.sh', awk: '.awk',
};

const MIME_MAP = {
  javascript: 'application/javascript', typescript: 'application/typescript',
  python: 'text/x-python', java: 'text/x-java', c: 'text/x-c',
  cpp: 'text/x-c++src', go: 'text/x-go', rust: 'text/x-rust',
  ruby: 'text/x-ruby', php: 'application/x-php',
  perl: 'text/x-perl', r: 'text/x-r', bash: 'text/x-sh',
  shell: 'text/x-sh', awk: 'text/x-awk',
};

router.post('/save', authMiddleware, asyncHandler(async (req, res) => {
  const { code, language, filename } = req.body;
  if (!code) return res.status(400).json({ error: true, message: 'Code is required' });
  const ext = EXT_MAP[language] || '.txt';
  const name = filename || `main${ext}`;
  const mime = MIME_MAP[language] || 'text/plain';
  const content = Buffer.from(code, 'utf-8').toString('base64');
  res.json({ filename: name, extension: ext, mimeType: mime, content, size: code.length });
}));

router.post('/parse', authMiddleware, asyncHandler(async (req, res) => {
  const { content, filename } = req.body;
  if (!content) return res.status(400).json({ error: true, message: 'File content is required' });
  const ext = filename ? '.' + filename.split('.').pop().toLowerCase() : '';
  let language = 'javascript';
  for (const [lang, e] of Object.entries(EXT_MAP)) {
    if (e === ext) { language = lang; break; }
  }
  res.json({ language, filename, content, size: content.length });
}));

module.exports = router;
