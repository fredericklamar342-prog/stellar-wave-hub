const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/ratings — Rate a project
router.post('/', authenticate, (req, res) => {
  const { project_id, score, purpose_score, innovation_score, usability_score, review_text } = req.body;

  if (!project_id || !score || !purpose_score || !innovation_score || !usability_score) {
    return res.status(400).json({ error: 'project_id, score, purpose_score, innovation_score, and usability_score are required' });
  }

  // Validate scores
  const scores = [score, purpose_score, innovation_score, usability_score];
  if (scores.some((s) => s < 1 || s > 5 || !Number.isInteger(s))) {
    return res.status(400).json({ error: 'All scores must be integers between 1 and 5' });
  }

  // Check project exists and is approved
  const project = db.prepare("SELECT id, submitted_by FROM projects WHERE id = ? AND status IN ('approved', 'featured')").get(project_id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found or not yet approved' });
  }

  // Cannot rate your own project
  if (project.submitted_by === req.user.id) {
    return res.status(403).json({ error: 'You cannot rate your own project' });
  }

  // Upsert rating
  const existing = db.prepare('SELECT id FROM ratings WHERE project_id = ? AND user_id = ?').get(project_id, req.user.id);

  if (existing) {
    db.prepare(`
      UPDATE ratings SET score = ?, purpose_score = ?, innovation_score = ?, usability_score = ?, review_text = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(score, purpose_score, innovation_score, usability_score, review_text || null, existing.id);
  } else {
    db.prepare(`
      INSERT INTO ratings (project_id, user_id, score, purpose_score, innovation_score, usability_score, review_text)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(project_id, req.user.id, score, purpose_score, innovation_score, usability_score, review_text || null);
  }

  // Return updated project ratings
  const stats = db.prepare(`
    SELECT
      COALESCE(AVG(score), 0) as avg_rating,
      COALESCE(AVG(purpose_score), 0) as avg_purpose,
      COALESCE(AVG(innovation_score), 0) as avg_innovation,
      COALESCE(AVG(usability_score), 0) as avg_usability,
      COUNT(*) as rating_count
    FROM ratings WHERE project_id = ?
  `).get(project_id);

  res.json({
    message: existing ? 'Rating updated' : 'Rating submitted',
    stats: {
      avg_rating: Math.round(stats.avg_rating * 10) / 10,
      avg_purpose: Math.round(stats.avg_purpose * 10) / 10,
      avg_innovation: Math.round(stats.avg_innovation * 10) / 10,
      avg_usability: Math.round(stats.avg_usability * 10) / 10,
      rating_count: stats.rating_count,
    },
  });
});

// GET /api/ratings/project/:projectId — Get all ratings for a project
router.get('/project/:projectId', (req, res) => {
  const ratings = db.prepare(`
    SELECT r.*, u.display_name as reviewer_name, u.username as reviewer_username, u.avatar_url as reviewer_avatar
    FROM ratings r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.project_id = ?
    ORDER BY r.created_at DESC
  `).all(req.params.projectId);

  const stats = db.prepare(`
    SELECT
      COALESCE(AVG(score), 0) as avg_rating,
      COALESCE(AVG(purpose_score), 0) as avg_purpose,
      COALESCE(AVG(innovation_score), 0) as avg_innovation,
      COALESCE(AVG(usability_score), 0) as avg_usability,
      COUNT(*) as rating_count
    FROM ratings WHERE project_id = ?
  `).get(req.params.projectId);

  res.json({
    ratings,
    stats: {
      avg_rating: Math.round(stats.avg_rating * 10) / 10,
      avg_purpose: Math.round(stats.avg_purpose * 10) / 10,
      avg_innovation: Math.round(stats.avg_innovation * 10) / 10,
      avg_usability: Math.round(stats.avg_usability * 10) / 10,
      rating_count: stats.rating_count,
    },
  });
});

// DELETE /api/ratings/:id — Delete a rating (owner or admin)
router.delete('/:id', authenticate, (req, res) => {
  const rating = db.prepare('SELECT * FROM ratings WHERE id = ?').get(req.params.id);
  if (!rating) return res.status(404).json({ error: 'Rating not found' });

  if (req.user.id !== rating.user_id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  db.prepare('DELETE FROM ratings WHERE id = ?').run(req.params.id);
  res.json({ message: 'Rating deleted' });
});

module.exports = router;
