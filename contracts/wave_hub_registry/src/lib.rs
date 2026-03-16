//! WaveHubRegistry — Soroban smart contract for the Stellar Wave Hub
//!
//! This contract maintains an on-chain registry of approved Stellar Wave Program
//! projects, providing a trustless source of truth that complements the off-chain
//! database.
//!
//! # Interface
//! - `initialize(admin)` — Set the contract administrator (once).
//! - `register_project(admin, project_id, account_id)` — Add a project to the registry.
//! - `remove_project(admin, project_id)` — Remove a project from the registry.
//! - `is_registered(project_id)` — Check if a project ID exists.
//! - `get_account(project_id)` — Retrieve the Stellar account ID for a project.
//! - `get_projects()` — Return all registered project IDs.
//! - `get_admin()` — Return the current admin address.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, Symbol, Vec,
};

// ── Storage keys ─────────────────────────────────────────────────────────────

const ADMIN_KEY: Symbol = symbol_short!("ADMIN");
const PROJECTS_KEY: Symbol = symbol_short!("PROJECTS");

#[contracttype]
#[derive(Clone)]
pub struct ProjectEntry {
    pub account_id: Address,
    pub registered_at: u64, // ledger timestamp
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct WaveHubRegistry;

#[contractimpl]
impl WaveHubRegistry {
    /// Initialize the registry with an admin address.
    /// Can only be called once; subsequent calls panic.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&ADMIN_KEY) {
            panic!("already initialized");
        }
        env.storage().instance().set(&ADMIN_KEY, &admin);
        let projects: Vec<Symbol> = Vec::new(&env);
        env.storage().instance().set(&PROJECTS_KEY, &projects);
    }

    /// Register a new project.
    /// Only callable by the admin.
    pub fn register_project(env: Env, admin: Address, project_id: Symbol, account_id: Address) {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        if env.storage().persistent().has(&project_id) {
            panic!("project already registered");
        }

        let entry = ProjectEntry {
            account_id,
            registered_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&project_id, &entry);

        // Append to project list
        let mut projects: Vec<Symbol> = env
            .storage()
            .instance()
            .get(&PROJECTS_KEY)
            .unwrap_or_else(|| Vec::new(&env));
        projects.push_back(project_id);
        env.storage().instance().set(&PROJECTS_KEY, &projects);
    }

    /// Remove a project from the registry.
    /// Only callable by the admin.
    pub fn remove_project(env: Env, admin: Address, project_id: Symbol) {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        if !env.storage().persistent().has(&project_id) {
            panic!("project not found");
        }
        env.storage().persistent().remove(&project_id);

        // Remove from project list
        let projects: Vec<Symbol> = env
            .storage()
            .instance()
            .get(&PROJECTS_KEY)
            .unwrap_or_else(|| Vec::new(&env));
        let mut updated: Vec<Symbol> = Vec::new(&env);
        for pid in projects.iter() {
            if pid != project_id {
                updated.push_back(pid);
            }
        }
        env.storage().instance().set(&PROJECTS_KEY, &updated);
    }

    /// Returns true if the given project ID is registered.
    pub fn is_registered(env: Env, project_id: Symbol) -> bool {
        env.storage().persistent().has(&project_id)
    }

    /// Returns the Stellar account address for a registered project.
    /// Panics if the project is not found.
    pub fn get_account(env: Env, project_id: Symbol) -> Address {
        let entry: ProjectEntry = env
            .storage()
            .persistent()
            .get(&project_id)
            .expect("project not found");
        entry.account_id
    }

    /// Returns all registered project IDs.
    pub fn get_projects(env: Env) -> Vec<Symbol> {
        env.storage()
            .instance()
            .get(&PROJECTS_KEY)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Returns the admin address.
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&ADMIN_KEY)
            .expect("not initialized")
    }

    // ── Internal helpers ─────────────────────────────────────────────────

    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&ADMIN_KEY)
            .expect("not initialized");
        if *caller != admin {
            panic!("unauthorized: admin only");
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{symbol_short, testutils::Address as _, Env};

    #[test]
    fn test_register_and_query() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, WaveHubRegistry);
        let client = WaveHubRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let project_account = Address::generate(&env);
        let project_id = symbol_short!("proj1");

        client.initialize(&admin);

        // Register a project
        client.register_project(&admin, &project_id, &project_account);
        assert!(client.is_registered(&project_id));
        assert_eq!(client.get_account(&project_id), project_account);
        assert_eq!(client.get_projects().len(), 1);

        // Remove it
        client.remove_project(&admin, &project_id);
        assert!(!client.is_registered(&project_id));
        assert_eq!(client.get_projects().len(), 0);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_init_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, WaveHubRegistry);
        let client = WaveHubRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        client.initialize(&admin); // should panic
    }
}
