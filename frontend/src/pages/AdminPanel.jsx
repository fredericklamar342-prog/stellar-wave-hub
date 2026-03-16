import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function AdminPanel() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/projects/pending');
      setProjects(data.projects);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function approve(id, featured = false) {
    setActionLoading(id);
    try {
      await api.put(`/projects/${id}/approve`, { featured });
      setProjects((ps) => ps.filter((p) => p.id !== id));
    } finally {
      setActionLoading(null);
    }
  }

  async function reject(id) {
    const reason = window.prompt('Rejection reason (optional):');
    if (reason === null) return; // cancelled
    setActionLoading(id);
    try {
      await api.put(`/projects/${id}/reject`, { reason });
      setProjects((ps) => ps.filter((p) => p.id !== id));
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Admin Panel — Pending Submissions</h1>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">No pending submissions.</div>
      ) : (
        <div className="space-y-4">
          {projects.map((p) => (
            <div key={p.id} className="card p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link to={`/projects/${p.slug}`} target="_blank" className="font-semibold hover:text-stellar-600">{p.name}</Link>
                  <p className="text-sm text-gray-500 mt-0.5">{p.description}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Submitted by {p.submitter_name} · {new Date(p.created_at).toLocaleDateString()} · {p.category}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  disabled={actionLoading === p.id}
                  onClick={() => approve(p.id, false)}
                  className="btn-primary text-sm"
                >
                  Approve
                </button>
                <button
                  disabled={actionLoading === p.id}
                  onClick={() => approve(p.id, true)}
                  className="btn-secondary text-sm"
                >
                  Approve + Feature
                </button>
                <button
                  disabled={actionLoading === p.id}
                  onClick={() => reject(p.id)}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg border border-red-300 text-red-600 text-sm hover:bg-red-50"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
