import { useEffect, useState } from 'react';
import api from '../services/api';

export default function FinancialsPanel({ projectId }) {
  const [tab, setTab] = useState('summary');
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [contractOps, setContractOps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSummary();
  }, [projectId]);

  async function loadSummary() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/financials/${projectId}/summary`);
      setSummary(data.summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadTransactions() {
    setLoading(true);
    try {
      const { data } = await api.get(`/financials/${projectId}/transactions`);
      setTransactions(data.transactions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadContractOps() {
    setLoading(true);
    try {
      const { data } = await api.get(`/financials/${projectId}/contract-ops`);
      setContractOps(data.operations || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function switchTab(t) {
    setTab(t);
    if (t === 'transactions' && transactions.length === 0) loadTransactions();
    if (t === 'contract-ops' && contractOps.length === 0) loadContractOps();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-gray-200">
        {['summary', 'transactions', 'contract-ops'].map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-stellar-600 text-stellar-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'summary' ? 'Summary' : t === 'transactions' ? 'Transactions' : 'Contract Ops'}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && tab === 'summary' && summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Stat label="XLM Balance" value={`${parseFloat(summary.xlm_balance).toLocaleString()} XLM`} />
          <Stat label="USDC Balance" value={`${parseFloat(summary.usdc_balance).toLocaleString()} USDC`} />
          <Stat label="Total Payments" value={summary.total_payments} />
          <Stat label="Total Received" value={`${parseFloat(summary.total_received).toLocaleString()} XLM`} />
          <Stat label="Total Sent" value={`${parseFloat(summary.total_sent).toLocaleString()} XLM`} />
          <Stat label="Net Flow" value={`${parseFloat(summary.net_flow).toLocaleString()} XLM`} />
        </div>
      )}

      {!loading && !error && tab === 'transactions' && (
        <TxTable rows={transactions} />
      )}

      {!loading && !error && tab === 'contract-ops' && (
        <ContractOpsTable rows={contractOps} />
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function TxTable({ rows }) {
  if (!rows.length) return <p className="text-sm text-gray-500">No transactions found.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b text-gray-500 text-xs">
            <th className="py-2 text-left">Date</th>
            <th className="py-2 text-left">Hash</th>
            <th className="py-2 text-left">Ledger</th>
            <th className="py-2 text-left">Ops</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((tx) => (
            <tr key={tx.hash} className="border-b hover:bg-gray-50">
              <td className="py-2 text-gray-600">{new Date(tx.created_at).toLocaleDateString()}</td>
              <td className="py-2 font-mono text-xs text-stellar-600">{tx.hash.slice(0, 12)}…</td>
              <td className="py-2">{tx.ledger}</td>
              <td className="py-2">{tx.operation_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContractOpsTable({ rows }) {
  if (!rows.length) return <p className="text-sm text-gray-500">No contract invocations found.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b text-gray-500 text-xs">
            <th className="py-2 text-left">Date</th>
            <th className="py-2 text-left">Function</th>
            <th className="py-2 text-left">Invoker</th>
            <th className="py-2 text-left">Tx Hash</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((op) => (
            <tr key={op.id} className="border-b hover:bg-gray-50">
              <td className="py-2 text-gray-600">{new Date(op.created_at).toLocaleDateString()}</td>
              <td className="py-2 font-mono text-xs">{op.function || '—'}</td>
              <td className="py-2 font-mono text-xs text-gray-600">{op.source_account?.slice(0, 10)}…</td>
              <td className="py-2 font-mono text-xs text-stellar-600">{op.transaction_hash?.slice(0, 12)}…</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
