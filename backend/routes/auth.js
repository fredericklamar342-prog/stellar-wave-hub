const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../config/database');
const { generateToken, authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { username, email, password, display_name, stellar_address, github_url, bio } = req.body;

  if (!username || !email || !password || !display_name) {
    return res.status(400).json({ error: 'username, email, password, and display_name are required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    return res.status(409).json({ error: 'Username or email already exists' });
  }

  const password_hash = bcrypt.hashSync(password, 12);

  const result = db.prepare(`
    INSERT INTO users (username, email, password_hash, display_name, stellar_address, github_url, bio)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(username, email, password_hash, display_name, stellar_address || null, github_url || null, bio || null);

  const user = db.prepare('SELECT id, username, email, display_name, role, stellar_address FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = generateToken(user);

  res.status(201).json({ user, token });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = generateToken(user);
  const { password_hash, ...safeUser } = user;

  res.json({ user: safeUser, token });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare(`
    SELECT id, username, email, display_name, role, stellar_address, github_url, bio, avatar_url, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);

  res.json({ user });
});

// PUT /api/auth/me
router.put('/me', authenticate, (req, res) => {
  const { display_name, stellar_address, github_url, bio, avatar_url } = req.body;

  db.prepare(`
    UPDATE users SET
      display_name = COALESCE(?, display_name),
      stellar_address = COALESCE(?, stellar_address),
      github_url = COALESCE(?, github_url),
      bio = COALESCE(?, bio),
      avatar_url = COALESCE(?, avatar_url),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(display_name, stellar_address, github_url, bio, avatar_url, req.user.id);

  const user = db.prepare('SELECT id, username, email, display_name, role, stellar_address, github_url, bio, avatar_url FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

module.exports = router;
