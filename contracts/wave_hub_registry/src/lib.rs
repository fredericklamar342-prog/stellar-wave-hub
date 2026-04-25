//! WaveHubRegistry — Soroban smart contract for the Stellar Wave Hub
//!
//! On-chain registry of approved Stellar Wave Program projects with two fee
//! mechanisms (registration + rating) and admin-gated upgradability.
//!
//! ## Fees
//! - **Registration fee** — paid once per project when it's added.
//! - **Rating fee** — paid by a user every time they rate a project
//!   (default: 0.1 USD worth of the configured token, i.e. 1_000_000 stroops
//!   for USDC which uses 7 decimals on Stellar).
//!
//! Both fees are collected in the same token (typically USDC SAC on mainnet,
//! or native XLM wrapper for testing). Collected fees accumulate in the
//! contract and can be withdrawn by the admin to a treasury address.
//!
//! ## Upgradability
//! The admin can swap out the contract's WASM bytecode by calling `upgrade`
//! with the hash of a newly installed WASM. Storage is preserved across
//! upgrades.
//!
//! # Public interface
//!
//! ## Admin-only
//! - `initialize(admin, token, reg_fee, rate_fee)`
//! - `register_project(admin, project_id, account_id, payer)`
//! - `remove_project(admin, project_id)`
//! - `set_registration_fee(admin, amount)` / `set_rating_fee(admin, amount)`
//! - `set_treasury(admin, treasury)` / `withdraw_fees(admin) -> i128`
//! - `upgrade(admin, new_wasm_hash)` — swap contract WASM.
//! - `transfer_admin(admin, new_admin)` — hand off admin rights.
//!
//! ## User-facing
//! - `rate_project(user, project_id, score)` — charges rating fee, stores rating.
//!
//! ## Public reads
//! - `is_registered(project_id)` / `get_account(project_id)` / `get_projects()`
//! - `get_registration_fee()` / `get_rating_fee()`
//! - `get_rating(user, project_id)` / `get_project_rating(project_id)`
//! - `has_rated(user, project_id)` / `get_treasury_balance()` / `get_admin()`

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, BytesN,
    Env, Symbol, Vec,
};

// ── Storage keys ────────────────────────────────────────────────────────────

const ADMIN_KEY: Symbol = symbol_short!("ADMIN");
const PROJECTS_KEY: Symbol = symbol_short!("PROJECTS");
const TOKEN_KEY: Symbol = symbol_short!("TOKEN");
const REG_FEE_KEY: Symbol = symbol_short!("REG_FEE");
const RATE_FEE_KEY: Symbol = symbol_short!("RATE_FEE");
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

/// Running aggregate of ratings for a project. `sum / count` gives the mean.
#[contracttype]
#[derive(Clone)]
pub struct ProjectRating {
    pub count: u64,
    pub sum: u64,
}

/// Keys for persistent per-rating and per-project-rating storage.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Aggregate ratings for a project.
    ProjectRating(Symbol),
    /// Score a specific user has given a specific project (prevents double-rate).
    UserRating(Address, Symbol),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidFee = 4,
    ProjectAlreadyRegistered = 5,
    ProjectNotFound = 6,
    NothingToWithdraw = 7,
    InvalidScore = 8,
    AlreadyRated = 9,
}

// ── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct WaveHubRegistry;

#[contractimpl]
impl WaveHubRegistry {
    // ── Setup ───────────────────────────────────────────────────────────

    /// One-time initialization.
    ///
    /// * `admin`     — privileged address that can manage the registry.
    /// * `token`     — Soroban token contract used for fee payments
    ///                 (e.g. USDC SAC address on mainnet).
    /// * `reg_fee`   — registration fee in token's smallest unit
    ///                 (for USDC with 7 decimals: 1_000_000 = 0.1 USDC).
    /// * `rate_fee`  — rating fee in the same unit. Default recommendation: 1_000_000 (0.1 USDC).
    pub fn initialize(env: Env, admin: Address, token: Address, reg_fee: i128, rate_fee: i128) {
        if env.storage().instance().has(&ADMIN_KEY) {
            panic_with_error(&env, Error::AlreadyInitialized);
        }
        if reg_fee < 0 || rate_fee < 0 {
            panic_with_error(&env, Error::InvalidFee);
        }

        env.storage().instance().set(&ADMIN_KEY, &admin);
        env.storage().instance().set(&TOKEN_KEY, &token);
        env.storage().instance().set(&REG_FEE_KEY, &reg_fee);
        env.storage().instance().set(&RATE_FEE_KEY, &rate_fee);
        env.storage().instance().set(&TREASURY_KEY, &admin);
        env.storage().instance().set(&COLLECTED_KEY, &0i128);
        env.storage().instance().set(&VERSION_KEY, &1u32);

        let projects: Vec<Symbol> = Vec::new(&env);
        env.storage().instance().set(&PROJECTS_KEY, &projects);
    }

    // ── Upgradability (admin) ───────────────────────────────────────────

    /// Replace the contract's WASM bytecode. The new WASM must already be
    /// uploaded to the ledger (`soroban contract install`); pass its hash.
    /// Storage is preserved.
    pub fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
        Self::require_admin(&env, &admin);
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);

        // Bump version counter so clients can detect upgrades.
        let v: u32 = env.storage().instance().get(&VERSION_KEY).unwrap_or(1);
        env.storage().instance().set(&VERSION_KEY, &(v + 1));
    }

    /// Transfer admin rights to a new address. Irrevocable.
    pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) {
        Self::require_admin(&env, &admin);
        admin.require_auth();
        env.storage().instance().set(&ADMIN_KEY, &new_admin);
    }

    // ── Project management (admin) ──────────────────────────────────────

    /// Register a project on-chain. `payer` pays the registration fee.
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
            panic_with_error(&env, Error::ProjectAlreadyRegistered);
        }

        let fee = Self::get_registration_fee(env.clone());
        if fee > 0 {
            Self::collect_fee(&env, &payer, fee);
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
            panic_with_error(&env, Error::ProjectNotFound);
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

    // ── Rating (user-facing) ────────────────────────────────────────────

    /// Rate a registered project. Charges the user the rating fee and records
    /// the score. Each user can only rate a given project once.
    ///
    /// * `score` must be between 1 and 5 inclusive.
    pub fn rate_project(env: Env, user: Address, project_id: Symbol, score: u32) {
        user.require_auth();

        if !env.storage().persistent().has(&project_id) {
            panic_with_error(&env, Error::ProjectNotFound);
        }
        if score < 1 || score > 5 {
            panic_with_error(&env, Error::InvalidScore);
        }

        let ur_key = DataKey::UserRating(user.clone(), project_id.clone());
        if env.storage().persistent().has(&ur_key) {
            panic_with_error(&env, Error::AlreadyRated);
        }

        let fee = Self::get_rating_fee(env.clone());
        if fee > 0 {
            Self::collect_fee(&env, &user, fee);
        }

        env.storage().persistent().set(&ur_key, &score);

        let pr_key = DataKey::ProjectRating(project_id);
        let mut rating: ProjectRating = env
            .storage()
            .persistent()
            .get(&pr_key)
            .unwrap_or(ProjectRating { count: 0, sum: 0 });
        rating.count += 1;
        rating.sum += score as u64;
        env.storage().persistent().set(&pr_key, &rating);
    }

    // ── Fee management (admin) ──────────────────────────────────────────

    pub fn set_registration_fee(env: Env, admin: Address, amount: i128) {
        Self::require_admin(&env, &admin);
        admin.require_auth();
        if amount < 0 {
            panic_with_error(&env, Error::InvalidFee);
        }
        env.storage().instance().set(&REG_FEE_KEY, &amount);
    }

    pub fn set_rating_fee(env: Env, admin: Address, amount: i128) {
        Self::require_admin(&env, &admin);
        admin.require_auth();
        if amount < 0 {
            panic_with_error(&env, Error::InvalidFee);
        }
        env.storage().instance().set(&RATE_FEE_KEY, &amount);
    }

    pub fn set_treasury(env: Env, admin: Address, treasury: Address) {
        Self::require_admin(&env, &admin);
        admin.require_auth();
        env.storage().instance().set(&TREASURY_KEY, &treasury);
    }

    /// Withdraw all collected fees to the treasury. Returns the amount sent.
    pub fn withdraw_fees(env: Env, admin: Address) -> i128 {
        Self::require_admin(&env, &admin);
        admin.require_auth();

        let collected: i128 = env
            .storage()
            .instance()
            .get(&COLLECTED_KEY)
            .unwrap_or(0i128);

        if collected <= 0 {
            panic_with_error(&env, Error::NothingToWithdraw);
        }

        let token_addr: Address = env
            .storage()
            .instance()
            .get(&TOKEN_KEY)
            .unwrap_or_else(|| panic_with_error(&env, Error::NotInitialized));
        let treasury: Address = env
            .storage()
            .instance()
            .get(&TREASURY_KEY)
            .unwrap_or_else(|| panic_with_error(&env, Error::NotInitialized));

        let client = token::Client::new(&env, &token_addr);
        client.transfer(&env.current_contract_address(), &treasury, &collected);

        env.storage().instance().set(&COLLECTED_KEY, &0i128);
        collected
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
            .unwrap_or_else(|| panic_with_error(&env, Error::ProjectNotFound));
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
            .unwrap_or_else(|| panic_with_error(&env, Error::NotInitialized))
    }

    pub fn get_registration_fee(env: Env) -> i128 {
        env.storage().instance().get(&REG_FEE_KEY).unwrap_or(0i128)
    }

    pub fn get_rating_fee(env: Env) -> i128 {
        env.storage().instance().get(&RATE_FEE_KEY).unwrap_or(0i128)
    }

    pub fn get_treasury_balance(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&COLLECTED_KEY)
            .unwrap_or(0i128)
    }

    /// Version counter. Starts at 1, incremented on each upgrade.
    pub fn get_version(env: Env) -> u32 {
        env.storage().instance().get(&VERSION_KEY).unwrap_or(1)
    }

    pub fn has_rated(env: Env, user: Address, project_id: Symbol) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::UserRating(user, project_id))
    }

    pub fn get_rating(env: Env, user: Address, project_id: Symbol) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::UserRating(user, project_id))
            .unwrap_or(0)
    }

    pub fn get_project_rating(env: Env, project_id: Symbol) -> ProjectRating {
        env.storage()
            .persistent()
            .get(&DataKey::ProjectRating(project_id))
            .unwrap_or(ProjectRating { count: 0, sum: 0 })
    }

    // ── Internals ───────────────────────────────────────────────────────

    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&ADMIN_KEY)
            .unwrap_or_else(|| panic_with_error(env, Error::NotInitialized));
        if *caller != admin {
            panic_with_error(env, Error::Unauthorized);
        }
    }

    fn collect_fee(env: &Env, payer: &Address, fee: i128) {
        let token_addr: Address = env
            .storage()
            .instance()
            .get(&TOKEN_KEY)
            .unwrap_or_else(|| panic_with_error(env, Error::NotInitialized));
        let client = token::Client::new(env, &token_addr);
        client.transfer(payer, &env.current_contract_address(), &fee);

        let collected: i128 = env
            .storage()
            .instance()
            .get(&COLLECTED_KEY)
            .unwrap_or(0i128);
        env.storage()
            .instance()
            .set(&COLLECTED_KEY, &(collected + fee));
    }
}

fn panic_with_error(env: &Env, err: Error) -> ! {
    soroban_sdk::panic_with_error!(env, err);
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

    const REG_FEE: i128 = 5_000_000; // 0.5 USDC (7 decimals)
    const RATE_FEE: i128 = 1_000_000; // 0.1 USDC (7 decimals)

    fn setup_token(env: &Env, admin: &Address) -> Address {
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        token_id.address()
    }

    fn fund(env: &Env, token_addr: &Address, to: &Address, amount: i128) {
        let sac_admin = token::StellarAssetClient::new(env, token_addr);
        sac_admin.mint(to, &amount);
    }

    #[test]
    fn test_full_lifecycle() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_000_000);

        let contract_id = env.register_contract(None, WaveHubRegistry);
        let client = WaveHubRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token_addr = setup_token(&env, &admin);
        let payer = Address::generate(&env);
        fund(&env, &token_addr, &payer, 100_000_000);

        client.initialize(&admin, &token_addr, &REG_FEE, &RATE_FEE);
        assert_eq!(client.get_registration_fee(), REG_FEE);
        assert_eq!(client.get_rating_fee(), RATE_FEE);
        assert_eq!(client.get_admin(), admin);
        assert_eq!(client.get_version(), 1);

        let project_account = Address::generate(&env);
        let project_id = symbol_short!("proj1");
        client.register_project(&admin, &project_id, &project_account, &payer);

        assert!(client.is_registered(&project_id));
        assert_eq!(client.get_account(&project_id), project_account);
        assert_eq!(client.get_treasury_balance(), REG_FEE);

        let token_client = token::Client::new(&env, &token_addr);
        assert_eq!(token_client.balance(&payer), 100_000_000 - REG_FEE);

        client.withdraw_fees(&admin);
        assert_eq!(token_client.balance(&admin), REG_FEE);
        assert_eq!(client.get_treasury_balance(), 0);
    }

    #[test]
    fn test_rate_project_charges_fee_and_records() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, WaveHubRegistry);
        let client = WaveHubRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token_addr = setup_token(&env, &admin);
        let user = Address::generate(&env);
        let payer = Address::generate(&env);
        fund(&env, &token_addr, &payer, 100_000_000);
        fund(&env, &token_addr, &user, 100_000_000);

        client.initialize(&admin, &token_addr, &0, &RATE_FEE);

        let project_account = Address::generate(&env);
        let pid = symbol_short!("proj_r");
        client.register_project(&admin, &pid, &project_account, &payer);

        client.rate_project(&user, &pid, &4);

        let token_client = token::Client::new(&env, &token_addr);
        assert_eq!(token_client.balance(&user), 100_000_000 - RATE_FEE);
        assert_eq!(client.get_treasury_balance(), RATE_FEE);
        assert!(client.has_rated(&user, &pid));
        assert_eq!(client.get_rating(&user, &pid), 4);

        let agg = client.get_project_rating(&pid);
        assert_eq!(agg.count, 1);
        assert_eq!(agg.sum, 4);
    }

    #[test]
    fn test_multiple_users_average() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, WaveHubRegistry);
        let client = WaveHubRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token_addr = setup_token(&env, &admin);
        let payer = Address::generate(&env);
        let u1 = Address::generate(&env);
        let u2 = Address::generate(&env);
        let u3 = Address::generate(&env);
        for a in [&payer, &u1, &u2, &u3] {
            fund(&env, &token_addr, a, 100_000_000);
        }

        client.initialize(&admin, &token_addr, &0, &RATE_FEE);
        let pid = symbol_short!("proj_m");
        client.register_project(&admin, &pid, &Address::generate(&env), &payer);

        client.rate_project(&u1, &pid, &5);
        client.rate_project(&u2, &pid, &3);
        client.rate_project(&u3, &pid, &4);

        let agg = client.get_project_rating(&pid);
        assert_eq!(agg.count, 3);
        assert_eq!(agg.sum, 12);
        // average = 12/3 = 4.0

        assert_eq!(client.get_treasury_balance(), RATE_FEE * 3);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")] // AlreadyRated
    fn test_double_rate_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, WaveHubRegistry);
        let client = WaveHubRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let token_addr = setup_token(&env, &admin);
        let user = Address::generate(&env);
        let payer = Address::generate(&env);
        fund(&env, &token_addr, &user, 100_000_000);
        fund(&env, &token_addr, &payer, 100_000_000);
        client.initialize(&admin, &token_addr, &0, &RATE_FEE);
        let pid = symbol_short!("proj_d");
        client.register_project(&admin, &pid, &Address::generate(&env), &payer);
        client.rate_project(&user, &pid, &5);
        client.rate_project(&user, &pid, &3); // should panic
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")] // InvalidScore
    fn test_invalid_score_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, WaveHubRegistry);
        let client = WaveHubRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let token_addr = setup_token(&env, &admin);
        let user = Address::generate(&env);
        let payer = Address::generate(&env);
        fund(&env, &token_addr, &user, 100_000_000);
        fund(&env, &token_addr, &payer, 100_000_000);
        client.initialize(&admin, &token_addr, &0, &RATE_FEE);
        let pid = symbol_short!("proj_i");
        client.register_project(&admin, &pid, &Address::generate(&env), &payer);
        client.rate_project(&user, &pid, &6);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")] // ProjectNotFound
    fn test_rate_unknown_project_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, WaveHubRegistry);
        let client = WaveHubRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let token_addr = setup_token(&env, &admin);
        let user = Address::generate(&env);
        fund(&env, &token_addr, &user, 100_000_000);
        client.initialize(&admin, &token_addr, &0, &RATE_FEE);
        client.rate_project(&user, &symbol_short!("ghost"), &4);
    }

    #[test]
    fn test_set_rating_fee() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, WaveHubRegistry);
        let client = WaveHubRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let token_addr = setup_token(&env, &admin);
        client.initialize(&admin, &token_addr, &0, &RATE_FEE);
        client.set_rating_fee(&admin, &2_000_000);
        assert_eq!(client.get_rating_fee(), 2_000_000);
    }

    #[test]
    fn test_transfer_admin() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, WaveHubRegistry);
        let client = WaveHubRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let new_admin = Address::generate(&env);
        let token_addr = setup_token(&env, &admin);
        client.initialize(&admin, &token_addr, &0, &0);
        client.transfer_admin(&admin, &new_admin);
        assert_eq!(client.get_admin(), new_admin);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")] // AlreadyInitialized
    fn test_double_init_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, WaveHubRegistry);
        let client = WaveHubRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let token_addr = setup_token(&env, &admin);
        client.initialize(&admin, &token_addr, &0, &0);
        client.initialize(&admin, &token_addr, &0, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")] // Unauthorized
    fn test_non_admin_cannot_set_fee() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, WaveHubRegistry);
        let client = WaveHubRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let attacker = Address::generate(&env);
        let token_addr = setup_token(&env, &admin);
        client.initialize(&admin, &token_addr, &0, &RATE_FEE);
        client.set_rating_fee(&attacker, &1);
    }
}
