const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './data/stellar_wave_hub.db';
const dbDir = path.dirname(DB_PATH);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initialize() {
  db.exec(`
    -- Users table (contributors and admins)
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'contributor' CHECK(role IN ('contributor', 'admin')),
      stellar_address TEXT,
      github_url TEXT,
      bio TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Projects table
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      long_description TEXT,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'featured')),
      repo_url TEXT,
      live_url TEXT,
      logo_url TEXT,
      banner_url TEXT,
      stellar_contract_id TEXT,
      stellar_account_id TEXT,
      tags TEXT, -- JSON array stored as text
      submitted_by INTEGER NOT NULL,
      approved_by INTEGER,
      approved_at DATETIME,
      rejection_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (submitted_by) REFERENCES users(id),
      FOREIGN KEY (approved_by) REFERENCES users(id)
    );

    -- Ratings table
    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      score INTEGER NOT NULL CHECK(score >= 1 AND score <= 5),
      purpose_score INTEGER NOT NULL CHECK(purpose_score >= 1 AND purpose_score <= 5),
      innovation_score INTEGER NOT NULL CHECK(innovation_score >= 1 AND innovation_score <= 5),
      usability_score INTEGER NOT NULL CHECK(usability_score >= 1 AND usability_score <= 5),
      review_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(project_id, user_id)
    );

    -- Financial snapshots (cached from Stellar Horizon)
    CREATE TABLE IF NOT EXISTS financial_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      stellar_account_id TEXT NOT NULL,
      balance_xlm TEXT,
      balance_usdc TEXT,
      total_transactions INTEGER DEFAULT 0,
      total_payments_received TEXT DEFAULT '0',
      total_payments_sent TEXT DEFAULT '0',
      last_transaction_hash TEXT,
      last_transaction_at DATETIME,
      snapshot_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- Contract invocations tracking
    CREATE TABLE IF NOT EXISTS contract_invocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      contract_id TEXT NOT NULL,
      transaction_hash TEXT UNIQUE NOT NULL,
      function_name TEXT,
      invoker TEXT,
      ledger INTEGER,
      amount TEXT,
      asset TEXT,
      created_at DATETIME,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
    CREATE INDEX IF NOT EXISTS idx_projects_submitted_by ON projects(submitted_by);
    CREATE INDEX IF NOT EXISTS idx_ratings_project_id ON ratings(project_id);
    CREATE INDEX IF NOT EXISTS idx_ratings_user_id ON ratings(user_id);
    CREATE INDEX IF NOT EXISTS idx_financial_snapshots_project ON financial_snapshots(project_id);
    CREATE INDEX IF NOT EXISTS idx_contract_invocations_project ON contract_invocations(project_id);
  `);
}

module.exports = { db, initialize };
