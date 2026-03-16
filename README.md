# Stellar Wave Hub

A community-driven project directory for the [Stellar Wave Program](https://stellar.org). Discover every project built through the program, spotlight new entries, rate them across multiple dimensions, and track each project's live on-chain financial activity directly from its Stellar account or Soroban smart contract.

> Think of it as **Product Hunt meets a Stellar blockchain explorer**, scoped to the Wave ecosystem.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [Backend](#backend-setup)
  - [Frontend](#frontend-setup)
  - [Smart Contract](#smart-contract-setup)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Smart Contract](#smart-contract)
- [Data Models](#data-models)
- [Contributing](#contributing)

---

## Overview

Stellar Wave Hub solves three gaps in the current Wave ecosystem:

| Gap | Solution |
|-----|----------|
| **Discovery** | Public directory of all approved Wave projects with search, filters, and categories |
| **Quality signal** | Multi-dimensional rating system (Overall, Purpose, Innovation, Usability) |
| **Transparency** | Live on-chain financial tracker via Stellar Horizon API |

**User roles:**
- **Contributor** — Browse, submit, and rate projects
- **Admin** — Review and approve/reject submissions, mark projects as featured
- **Visitor** *(stretch)* — Read-only access without registration

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Browser / Client                │
│          React 18 + Tailwind + React Router      │
└─────────────────────┬───────────────────────────┘
                      │ REST (JSON)
┌─────────────────────▼───────────────────────────┐
│              Node.js / Express API               │
│   Auth (JWT) · Projects · Ratings · Financials  │
└──────────┬──────────────────────┬───────────────┘
           │                      │
┌──────────▼──────────┐  ┌───────▼───────────────┐
│   SQLite (better-   │  │  Stellar Horizon API   │
│   sqlite3) database │  │  (read-only, cached)   │
└─────────────────────┘  └───────────────────────┘
                                   │
                        ┌──────────▼──────────────┐
                        │  Soroban Smart Contract  │
                        │  (wave_hub_registry)     │
                        │  Rust · soroban-sdk      │
                        └─────────────────────────┘
```

**Tech stack:**

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, React Router v6 |
| Backend | Node.js, Express 4 |
| Database | SQLite via `better-sqlite3` (upgradeable to PostgreSQL) |
| Auth | JWT bearer tokens, bcrypt password hashing |
| Blockchain | `@stellar/stellar-sdk`, Stellar Horizon REST API |
| Smart Contract | Rust, `soroban-sdk` |
| Security | Helmet, CORS, express-rate-limit |

---

## Project Structure

```
stellar-wave-hub/
├── frontend/                   # React 18 application
│   ├── public/
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   │   ├── Header.jsx
│   │   │   ├── ProjectCard.jsx
│   │   │   ├── FilterBar.jsx
│   │   │   ├── RatingForm.jsx
│   │   │   └── FinancialsPanel.jsx
│   │   ├── context/
│   │   │   └── AuthContext.jsx # Global auth state
│   │   ├── hooks/              # Custom React hooks
│   │   ├── pages/              # Route-level page components
│   │   │   ├── Home.jsx        # Project directory
│   │   │   ├── ProjectDetail.jsx
│   │   │   ├── Submit.jsx      # Submit a project
│   │   │   ├── MySubmissions.jsx
│   │   │   ├── AdminPanel.jsx  # Admin approval queue
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   └── Profile.jsx
│   │   ├── services/
│   │   │   └── api.js          # Axios API client
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
│
├── backend/                    # Express API server
│   ├── config/
│   │   └── database.js         # SQLite setup + schema
│   ├── middleware/
│   │   └── auth.js             # JWT authenticate / requireAdmin
│   ├── models/                 # (reserved for ORM layer)
│   ├── routes/
│   │   ├── auth.js             # /api/auth/*
│   │   ├── projects.js         # /api/projects/*
│   │   ├── ratings.js          # /api/ratings/*
│   │   └── financials.js       # /api/financials/*
│   ├── services/
│   │   └── stellarService.js   # Horizon API wrapper
│   ├── server.js               # App entry point
│   ├── package.json
│   └── .env.example
│
└── contracts/                  # Soroban smart contracts (Rust)
    └── wave_hub_registry/
        ├── Cargo.toml
        └── src/
            └── lib.rs          # WaveHubRegistry contract
```

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 18+ | Backend + frontend tooling |
| npm / yarn | 9+ | Package manager |
| Rust | 1.74+ | Smart contract compilation |
| Stellar CLI | latest | Contract deployment |
| Git | any | Version control |

Install the Stellar CLI:
```bash
cargo install --locked stellar-cli --features opt
```

---

## Getting Started

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment file and edit values
cp .env.example .env

# Start development server (with hot reload)
npm run dev

# Or start production server
npm start
```

The API will be available at `http://localhost:4000`.

**First admin account:** Register normally, then manually update the `role` column in the SQLite database:

```sql
UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```

The frontend will be available at `http://localhost:3000`.

**Build for production:**
```bash
npm run build
# Output → frontend/dist/
```

### Smart Contract Setup

```bash
cd contracts/wave_hub_registry

# Build the contract
cargo build --target wasm32-unknown-unknown --release

# Or use the Stellar CLI build command
stellar contract build

# Run tests
cargo test

# Deploy to Stellar Testnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/wave_hub_registry.wasm \
  --source <YOUR_SECRET_KEY> \
  --network testnet
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | API server port |
| `JWT_SECRET` | — | Secret for signing JWT tokens (change in production) |
| `STELLAR_HORIZON_URL` | `https://horizon.stellar.org` | Horizon endpoint (`https://horizon-testnet.stellar.org` for testnet) |
| `STELLAR_NETWORK` | `public` | `public` or `testnet` |
| `DB_PATH` | `./data/stellar_wave_hub.db` | SQLite database file path |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed frontend origin |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API base URL (e.g., `http://localhost:4000/api`) |

---

## API Reference

All authenticated routes require the header:
```
Authorization: Bearer <jwt_token>
```

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | — | Register a new contributor |
| POST | `/api/auth/login` | — | Login and receive JWT |
| GET | `/api/auth/me` | Required | Get current user profile |
| PUT | `/api/auth/me` | Required | Update profile |

### Projects

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/projects` | Optional | List approved projects (supports `?category`, `?search`, `?sort`, `?page`, `?limit`) |
| POST | `/api/projects` | Required | Submit a new project |
| GET | `/api/projects/pending` | Admin | Pending approval queue |
| GET | `/api/projects/my` | Required | Current user's submissions |
| GET | `/api/projects/:slug` | Optional | Project detail page |
| PUT | `/api/projects/:id` | Required | Edit own project |
| PUT | `/api/projects/:id/approve` | Admin | Approve (optionally feature) |
| PUT | `/api/projects/:id/reject` | Admin | Reject with optional reason |
| DELETE | `/api/projects/:id` | Admin | Delete a project |

### Ratings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/ratings` | Required | Submit or update a rating |
| GET | `/api/ratings/project/:projectId` | — | Get all ratings for a project |
| DELETE | `/api/ratings/:id` | Required | Delete own rating |

### Financials

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/financials/:projectId/summary` | — | Account balances + payment summary |
| GET | `/api/financials/:projectId/transactions` | — | Recent transactions (last 20) |
| GET | `/api/financials/:projectId/contract-ops` | — | Soroban contract invocations |

---

## Smart Contract

The `wave_hub_registry` Soroban contract (Rust) provides an **on-chain registry** of approved Stellar Wave projects. It serves as a trustless source of truth complementing the off-chain database.

**Contract interface:**

```rust
// Register a new project (admin only)
fn register_project(env: Env, admin: Address, project_id: Symbol, account_id: Address)

// Remove a project (admin only)
fn remove_project(env: Env, admin: Address, project_id: Symbol)

// Check if a project is registered
fn is_registered(env: Env, project_id: Symbol) -> bool

// Get the Stellar account ID for a project
fn get_account(env: Env, project_id: Symbol) -> Option<Address>

// Get all registered project IDs
fn get_projects(env: Env) -> Vec<Symbol>
```

**Deployment addresses:**

| Network | Contract ID |
|---------|------------|
| Testnet | *(deploy and update here)* |
| Mainnet | *(TBD — post-MVP)* |

---

## Data Models

```
users           — id, username, email, password_hash, role, stellar_address, github_url, bio
projects        — id, name, slug, description, category, status, stellar_contract_id, stellar_account_id, tags
ratings         — id, project_id, user_id, score, purpose_score, innovation_score, usability_score, review_text
financial_snapshots — id, project_id, balances, total_received, total_sent, snapshot_at
contract_invocations — id, project_id, contract_id, transaction_hash, function_name, invoker, ledger
```

Project `status` lifecycle:
```
submitted → pending → approved / rejected
                          ↓
                       featured  (admin promotes)
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run tests: `npm test` (backend) / `cargo test` (contract)
5. Open a pull request

---

*Built for the Stellar Wave Program community.*
