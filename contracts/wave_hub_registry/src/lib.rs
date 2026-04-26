//! WaveHubRegistry — Soroban smart contract for the Stellar Wave Hub
//!
//! On-chain registry of approved Stellar Wave Program projects with a platform
//! fee mechanism. Every project registration costs a small fee (in a chosen
//! Soroban token, typically the native XLM wrapper). Collected fees accumulate
//! in the contract and can be withdrawn by the admin to a treasury address.
//!
//! # Public interface
//!
//! ## Admin-only
//! - `initialize(admin, token, fee, version)` — one-time setup.
- `get_version()` — returns the current contract version.
- `upgrade_version(admin, new_version)` — update the version (admin only).

//! - `register_project(admin, project_id, account_id, payer)` — add project; `payer` pays fee.
//! - `remove_project(admin, project_id)` — remove a project.
//! - `set_fee(admin, amount)` — change the registration fee.
//! - `set_treasury(admin, treasury)` — change the withdrawal address.
//! - `withdraw_fees(admin)` — send all collected fees to the treasury.
//!
//! ## Public reads
//! - `is_registered(project_id)` / `get_account(project_id)` / `get_projects()`
//! - `get_fee()` / `get_treasury_balance()` / `get_admin()`

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, Symbol, Vec,
};

// ── Storage keys ────────────────────────────────────────────────────────────

const ADMIN_KEY: Symbol = symbol_short!("ADMIN");
const PROJECTS_KEY: Symbol = symbol_short!("PROJECTS");
const TOKEN_KEY: Symbol = symbol_short!("TOKEN");
const FEE_KEY: Symbol = symbol_short!("FEE");
const TREASURY_KEY: Symbol = symbol_short!("TREASURY");
const COLLECTED_KEY: Symbol = symbol_short!("COLLECT");
const VERSION_KEY: Symbol = symbol_short!("VERSION");


// ── Types ───────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct ProjectEntry {
    pub account_id: Address,
    pub registered_at: u64,
}

// ── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct WaveHubRegistry;

#[contractimpl]
impl WaveHubRegistry {
    // ── Setup ───────────────────────────────────────────────────────────

    /// One-time initialization.
    ///
    /// * `admin`   — the privileged address that can manage the registry.
    /// * `token`   — the Soroban token contract used for fee payments
    ///               (e.g. the native XLM SAC wrapper).
    /// * `fee`     — registration fee in stroops (1 XLM = 10_000_000 stroops).
    /// * `version` — current contract version (semver format).
    pub fn initialize(env: Env, admin: Address, token: Address, fee: i128, version: String) {

        if env.storage().instance().has(&ADMIN_KEY) {
            panic!("already initialized");
        }
        assert!(fee >= 0, "fee must be non-negative");

        env.storage().instance().set(&ADMIN_KEY, &admin);
        env.storage().instance().set(&TOKEN_KEY, &token);
        env.storage().instance().set(&FEE_KEY, &fee);
        env.storage().instance().set(&TREASURY_KEY, &admin); // default treasury = admin
        env.storage().instance().set(&COLLECTED_KEY, &0i128);

        validate_version(&version);
        env.storage().instance().set(&VERSION_KEY, &version);

        let projects: Vec<Symbol> = Vec::new(&env);

        env.storage().instance().set(&PROJECTS_KEY, &projects);
    }

    // ── Project management (admin) ──────────────────────────────────────

    /// Register a project on-chain. The `payer` address pays the registration
    /// fee which is held by the contract until withdrawn.
    pub fn register_project(
        env: Env,
        admin: Address,
        project_id: Symbol,
        account_id: Address,
        payer: Address,
    ) {
        Self::require_admin(&env, &admin);
        admin.require_auth();
        payer.require_auth();

        if env.storage().persistent().has(&project_id) {
            panic!("project already registered");
        }

        // Collect registration fee
        let fee = Self::get_fee(env.clone());
        if fee > 0 {
            let token_addr: Address = env
                .storage()
                .instance()
                .get(&TOKEN_KEY)
                .expect("not initialized");
            let client = token::Client::new(&env, &token_addr);
            client.transfer(&payer, &env.current_contract_address(), &fee);

            // Track collected amount
            let collected: i128 = env
                .storage()
                .instance()
                .get(&COLLECTED_KEY)
                .unwrap_or(0i128);
            env.storage()
                .instance()
                .set(&COLLECTED_KEY, &(collected + fee));
        }

        let entry = ProjectEntry {
            account_id,
            registered_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&project_id, &entry);

        let mut projects: Vec<Symbol> = env
            .storage()
            .instance()
            .get(&PROJECTS_KEY)
            .unwrap_or_else(|| Vec::new(&env));
        projects.push_back(project_id);
        env.storage().instance().set(&PROJECTS_KEY, &projects);
    }

    /// Remove a project from the registry. No fee refund.
    pub fn remove_project(env: Env, admin: Address, project_id: Symbol) {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        if !env.storage().persistent().has(&project_id) {
            panic!("project not found");
        }
        env.storage().persistent().remove(&project_id);

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

    // ── Fee management (admin) ──────────────────────────────────────────

    /// Update the registration fee.
    pub fn set_fee(env: Env, admin: Address, amount: i128) {
        Self::require_admin(&env, &admin);
        admin.require_auth();
        assert!(amount >= 0, "fee must be non-negative");
        env.storage().instance().set(&FEE_KEY, &amount);
    }

    /// Update the treasury withdrawal address.
    pub fn set_treasury(env: Env, admin: Address, treasury: Address) {
        Self::require_admin(&env, &admin);
        admin.require_auth();
        env.storage().instance().set(&TREASURY_KEY, &treasury);
    }

    /// Withdraw all collected fees to the treasury address.
    /// Returns the amount withdrawn.
    pub fn withdraw_fees(env: Env, admin: Address) -> i128 {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        let collected: i128 = env
            .storage()
            .instance()
            .get(&COLLECTED_KEY)
            .unwrap_or(0i128);

        if collected <= 0 {
            panic!("nothing to withdraw");
        }

        let token_addr: Address = env
            .storage()
            .instance()
            .get(&TOKEN_KEY)
            .expect("not initialized");
        let treasury: Address = env
            .storage()
            .instance()
            .get(&TREASURY_KEY)
            .expect("treasury not set");

        let client = token::Client::new(&env, &token_addr);
        client.transfer(&env.current_contract_address(), &treasury, &collected);

        env.storage().instance().set(&COLLECTED_KEY, &0i128);
        collected
    }

    /// Update the contract version. Emits a ContractUpgraded event.
    pub fn upgrade_version(env: Env, admin: Address, new_version: String) {
        Self::require_admin(&env, &admin);
        admin.require_auth();
        validate_version(&new_version);

        let old_version: String = env
            .storage()
            .instance()
            .get(&VERSION_KEY)
            .unwrap_or_else(|| String::from_str(&env, "0.0.0"));

        env.storage().instance().set(&VERSION_KEY, &new_version);

        env.events().publish(
            (Symbol::new(&env, "ContractUpgraded"),),
            (old_version, new_version),
        );
    }


    // ── Public queries ──────────────────────────────────────────────────

    pub fn is_registered(env: Env, project_id: Symbol) -> bool {
        env.storage().persistent().has(&project_id)
    }

    pub fn get_account(env: Env, project_id: Symbol) -> Address {
        let entry: ProjectEntry = env
            .storage()
            .persistent()
            .get(&project_id)
            .expect("project not found");
        entry.account_id
    }

    pub fn get_projects(env: Env) -> Vec<Symbol> {
        env.storage()
            .instance()
            .get(&PROJECTS_KEY)
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&ADMIN_KEY)
            .expect("not initialized")
    }

    pub fn get_fee(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&FEE_KEY)
            .unwrap_or(0i128)
    }

    /// Returns the total uncollected fees sitting in the contract.
    pub fn get_treasury_balance(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&COLLECTED_KEY)
            .unwrap_or(0i128)
    }

    pub fn get_version(env: Env) -> String {
        env.storage()
            .instance()
            .get(&VERSION_KEY)
            .expect("not initialized")
    }


    // ── Internals ───────────────────────────────────────────────────────

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

fn validate_version(version: &String) {
    let len = version.len() as usize;
    if len == 0 || len > 32 {
        panic!("invalid version length");
    }

    let mut buf = [0u8; 32];
    version.copy_into_slice(&mut buf[..len]);

    let mut dot_count = 0;
    let mut part_len = 0;

    for i in 0..len {
        let b = buf[i];
        if b == b'.' {
            if part_len == 0 {
                panic!("invalid version format");
            }
            dot_count += 1;
            part_len = 0;
        } else if b >= b'0' && b <= b'9' {
            part_len += 1;
        } else {
            panic!("invalid version characters");
        }
    }

    if dot_count != 2 || part_len == 0 {
        panic!("invalid version format");
    }
}


// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        symbol_short,
        testutils::{Address as _, Ledger},
        Env,
    };

    fn setup_token(env: &Env, admin: &Address) -> Address {
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        token_id.address()
    }

    #[test]
    fn test_full_lifecycle() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_000_000);

        let contract_id = env.register(WaveHubRegistry, ());
        let client = WaveHubRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token_addr = setup_token(&env, &admin);
        let fee: i128 = 5_000_000; // 0.5 XLM

        // Mint tokens to a payer
        let payer = Address::generate(&env);
        let token_client = token::Client::new(&env, &token_addr);
        let sac_admin = token::StellarAssetClient::new(&env, &token_addr);
        sac_admin.mint(&payer, &100_000_000);

        // Initialize
        let version = String::from_str(&env, "1.0.0");
        client.initialize(&admin, &token_addr, &fee, &version);
        assert_eq!(client.get_fee(), fee);
        assert_eq!(client.get_admin(), admin);
        assert_eq!(client.get_version(), version);


        // Register a project — payer pays the fee
        let project_account = Address::generate(&env);
        let project_id = symbol_short!("proj1");
        client.register_project(&admin, &project_id, &project_account, &payer);

        assert!(client.is_registered(&project_id));
        assert_eq!(client.get_account(&project_id), project_account);
        assert_eq!(client.get_projects().len(), 1);
        assert_eq!(client.get_treasury_balance(), fee);

        // Payer balance decreased
        assert_eq!(token_client.balance(&payer), 100_000_000 - fee);

        // Withdraw fees
        let withdrawn = client.withdraw_fees(&admin);
        assert_eq!(withdrawn, fee);
        assert_eq!(client.get_treasury_balance(), 0);
        // Admin (default treasury) received the fees
        assert_eq!(token_client.balance(&admin), fee);

        // Update fee
        let new_fee: i128 = 10_000_000;
        client.set_fee(&admin, &new_fee);
        assert_eq!(client.get_fee(), new_fee);

        // Remove project
        client.remove_project(&admin, &project_id);
        assert!(!client.is_registered(&project_id));
        assert_eq!(client.get_projects().len(), 0);
    }

    #[test]
    fn test_zero_fee_registration() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(WaveHubRegistry, ());
        let client = WaveHubRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token_addr = setup_token(&env, &admin);
        let payer = Address::generate(&env);
        let project_account = Address::generate(&env);

        // Zero fee — no token transfer needed
        client.initialize(&admin, &token_addr, &0i128, &String::from_str(&env, "1.0.0"));

        client.register_project(&admin, &symbol_short!("free"), &project_account, &payer);
        assert!(client.is_registered(&symbol_short!("free")));
        assert_eq!(client.get_treasury_balance(), 0);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_init_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(WaveHubRegistry, ());
        let client = WaveHubRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let token_addr = setup_token(&env, &admin);
        client.initialize(&admin, &token_addr, &0i128, &String::from_str(&env, "1.0.0"));
        client.initialize(&admin, &token_addr, &0i128, &String::from_str(&env, "1.0.0"));

    }

    #[test]
    #[should_panic(expected = "nothing to withdraw")]
    fn test_withdraw_empty_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(WaveHubRegistry, ());
        let client = WaveHubRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let token_addr = setup_token(&env, &admin);
        client.initialize(&admin, &token_addr, &0i128, &String::from_str(&env, "1.0.0"));
        client.withdraw_fees(&admin);

    }

    #[test]
    fn test_set_treasury() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(WaveHubRegistry, ());
        let client = WaveHubRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token_addr = setup_token(&env, &admin);
        let treasury = Address::generate(&env);
        let payer = Address::generate(&env);
        let sac_admin = token::StellarAssetClient::new(&env, &token_addr);
        let token_client = token::Client::new(&env, &token_addr);
        sac_admin.mint(&payer, &50_000_000);

        let fee: i128 = 1_000_000;
        client.initialize(&admin, &token_addr, &fee, &String::from_str(&env, "1.0.0"));


        // Change treasury to a different address
        client.set_treasury(&admin, &treasury);

        // Register project so fees accumulate
        let pa = Address::generate(&env);
        client.register_project(&admin, &symbol_short!("tp"), &pa, &payer);

        // Withdraw goes to the new treasury
        client.withdraw_fees(&admin);
        assert_eq!(token_client.balance(&treasury), fee);
    }

    #[test]
    fn test_upgrade_version() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(WaveHubRegistry, ());
        let client = WaveHubRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let token_addr = setup_token(&env, &admin);

        client.initialize(&admin, &token_addr, &0, &String::from_str(&env, "1.0.0"));
        assert_eq!(client.get_version(), String::from_str(&env, "1.0.0"));

        let new_version = String::from_str(&env, "1.1.0");
        client.upgrade_version(&admin, &new_version);
        assert_eq!(client.get_version(), new_version);
    }

    #[test]
    #[should_panic(expected = "invalid version format")]
    fn test_invalid_version_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(WaveHubRegistry, ());
        let client = WaveHubRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let token_addr = setup_token(&env, &admin);

        client.initialize(&admin, &token_addr, &0, &String::from_str(&env, "1.0"));
    }
}

