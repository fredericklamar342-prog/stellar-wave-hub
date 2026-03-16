const StellarSdk = require('@stellar/stellar-sdk');

const HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon.stellar.org';
const server = new StellarSdk.Horizon.Server(HORIZON_URL);

/**
 * Fetch account details (balances, sequence, etc.) from Stellar Horizon
 */
async function getAccountDetails(accountId) {
  try {
    const account = await server.accounts().accountId(accountId).call();

    const balances = account.balances.map((b) => ({
      asset_type: b.asset_type,
      asset_code: b.asset_code || 'XLM',
      asset_issuer: b.asset_issuer || 'native',
      balance: b.balance,
    }));

    const xlmBalance = balances.find((b) => b.asset_type === 'native')?.balance || '0';
    const usdcBalance =
      balances.find(
        (b) =>
          b.asset_code === 'USDC' &&
          b.asset_issuer === 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
      )?.balance || '0';

    return {
      account_id: account.account_id,
      sequence: account.sequence,
      balances,
      xlm_balance: xlmBalance,
      usdc_balance: usdcBalance,
      num_subentries: account.subentry_count,
      last_modified_ledger: account.last_modified_ledger,
    };
  } catch (err) {
    if (err?.response?.status === 404) {
      return { error: 'Account not found on Stellar network', account_id: accountId };
    }
    throw new Error(`Stellar API error: ${err.message}`);
  }
}

/**
 * Fetch recent transactions for an account
 */
async function getAccountTransactions(accountId, limit = 20, cursor = null) {
  try {
    let query = server.transactions().forAccount(accountId).limit(limit).order('desc');
    if (cursor) query = query.cursor(cursor);

    const result = await query.call();

    const transactions = result.records.map((tx) => ({
      id: tx.id,
      hash: tx.hash,
      ledger: tx.ledger,
      created_at: tx.created_at,
      source_account: tx.source_account,
      fee_charged: tx.fee_charged,
      operation_count: tx.operation_count,
      memo_type: tx.memo_type,
      memo: tx.memo,
      successful: tx.successful,
    }));

    return {
      transactions,
      next_cursor: result.records.length > 0 ? result.records[result.records.length - 1].paging_token : null,
    };
  } catch (err) {
    if (err?.response?.status === 404) {
      return { transactions: [], next_cursor: null };
    }
    throw new Error(`Stellar API error: ${err.message}`);
  }
}

/**
 * Fetch payment operations for an account (incoming and outgoing)
 */
async function getAccountPayments(accountId, limit = 50, cursor = null) {
  try {
    let query = server.payments().forAccount(accountId).limit(limit).order('desc');
    if (cursor) query = query.cursor(cursor);

    const result = await query.call();

    const payments = result.records
      .filter((op) => ['payment', 'path_payment_strict_receive', 'path_payment_strict_send'].includes(op.type))
      .map((op) => ({
        id: op.id,
        type: op.type,
        created_at: op.created_at,
        transaction_hash: op.transaction_hash,
        from: op.from,
        to: op.to,
        amount: op.amount,
        asset_type: op.asset_type,
        asset_code: op.asset_code || 'XLM',
        asset_issuer: op.asset_issuer || 'native',
        direction: op.to === accountId ? 'received' : 'sent',
      }));

    return {
      payments,
      next_cursor: result.records.length > 0 ? result.records[result.records.length - 1].paging_token : null,
    };
  } catch (err) {
    if (err?.response?.status === 404) {
      return { payments: [], next_cursor: null };
    }
    throw new Error(`Stellar API error: ${err.message}`);
  }
}

/**
 * Fetch contract invocation operations (Soroban invoke_host_function)
 */
async function getContractOperations(accountId, limit = 50, cursor = null) {
  try {
    let query = server.operations().forAccount(accountId).limit(limit).order('desc');
    if (cursor) query = query.cursor(cursor);

    const result = await query.call();

    const contractOps = result.records
      .filter((op) => op.type === 'invoke_host_function')
      .map((op) => ({
        id: op.id,
        type: op.type,
        created_at: op.created_at,
        transaction_hash: op.transaction_hash,
        function: op.function,
        parameters: op.parameters,
        source_account: op.source_account,
      }));

    return {
      operations: contractOps,
      next_cursor: result.records.length > 0 ? result.records[result.records.length - 1].paging_token : null,
    };
  } catch (err) {
    if (err?.response?.status === 404) {
      return { operations: [], next_cursor: null };
    }
    throw new Error(`Stellar API error: ${err.message}`);
  }
}

/**
 * Build a financial summary for an account by aggregating payment data
 */
async function getFinancialSummary(accountId) {
  try {
    const [accountDetails, paymentsResult] = await Promise.all([
      getAccountDetails(accountId),
      getAccountPayments(accountId, 200),
    ]);

    if (accountDetails.error) {
      return { error: accountDetails.error };
    }

    let totalReceived = 0;
    let totalSent = 0;
    let paymentCount = 0;

    for (const payment of paymentsResult.payments) {
      const amount = parseFloat(payment.amount) || 0;
      if (payment.direction === 'received') {
        totalReceived += amount;
      } else {
        totalSent += amount;
      }
      paymentCount++;
    }

    return {
      account_id: accountId,
      balances: accountDetails.balances,
      xlm_balance: accountDetails.xlm_balance,
      usdc_balance: accountDetails.usdc_balance,
      total_payments: paymentCount,
      total_received: totalReceived.toFixed(7),
      total_sent: totalSent.toFixed(7),
      net_flow: (totalReceived - totalSent).toFixed(7),
      last_updated: new Date().toISOString(),
    };
  } catch (err) {
    throw new Error(`Financial summary error: ${err.message}`);
  }
}

module.exports = {
  server,
  getAccountDetails,
  getAccountTransactions,
  getAccountPayments,
  getContractOperations,
  getFinancialSummary,
};
