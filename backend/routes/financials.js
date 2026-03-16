const express = require('express');
const { db } = require('../config/database');
const stellarService = require('../services/stellarService');

const router = express.Router();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getProject(projectId) {
  return db
    .prepare("SELECT id, stellar_account_id, stellar_contract_id FROM projects WHERE id = ? AND status IN ('approved', 'featured')")
    .get(projectId);
}

function isCacheValid(snapshot) {
  if (!snapshot) return false;
  return Date.now() - new Date(snapshot.snapshot_at).getTime() < CACHE_TTL_MS;
}

// GET /api/financials/:projectId/summary
router.get('/:projectId/summary', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!project.stellar_account_id) return res.status(422).json({ error: 'Project has no linked Stellar account' });

  // Check cache
  const cached = db.prepare('SELECT * FROM financial_snapshots WHERE project_id = ? ORDER BY snapshot_at DESC LIMIT 1').get(project.id);
  if (isCacheValid(cached)) {
    return res.json({ summary: JSON.parse(cached.balance_xlm || '{}'), cached: true, snapshot_at: cached.snapshot_at });
  }

  try {
    const summary = await stellarService.getFinancialSummary(project.stellar_account_id);

    // Upsert snapshot cache
    db.prepare(`
      INSERT INTO financial_snapshots (project_id, stellar_account_id, balance_xlm, balance_usdc, total_payments_received, total_payments_sent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      project.id,
      project.stellar_account_id,
      JSON.stringify(summary),
      summary.usdc_balance || '0',
      summary.total_received || '0',
      summary.total_sent || '0'
    );

    res.json({ summary, cached: false });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/financials/:projectId/transactions
router.get('/:projectId/transactions', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!project.stellar_account_id) return res.status(422).json({ error: 'Project has no linked Stellar account' });

  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const cursor = req.query.cursor || null;
    const data = await stellarService.getAccountTransactions(project.stellar_account_id, limit, cursor);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/financials/:projectId/contract-ops
router.get('/:projectId/contract-ops', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const accountId = project.stellar_contract_id || project.stellar_account_id;
  if (!accountId) return res.status(422).json({ error: 'Project has no linked Stellar contract or account' });

  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const cursor = req.query.cursor || null;
    const data = await stellarService.getContractOperations(accountId, limit, cursor);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
