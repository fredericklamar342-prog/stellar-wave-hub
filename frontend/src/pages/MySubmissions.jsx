import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

const STATUS_STYLES = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  featured: 'bg-stellar-100 text-stellar-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function MySubmissions() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/projects/my')
      .then(({ data }) => setProjects(data.projects))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Submissions</h1>
        <Link to="/submit" className="btn-primary text-sm">+ New Submission</Link>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          <p>You haven't submitted any projects yet.</p>
          <Link to="/submit" className="btn-primary mt-4 inline-block text-sm">Submit your first project</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <div key={p.id} className="card p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link to={`/projects/${p.slug}`} className="font-semibold hover:text-stellar-600">{p.name}</Link>
                  <span className={`badge ${STATUS_STYLES[p.status]}`}>{p.status}</span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5 truncate">{p.description}</p>
                {p.rejection_reason && (
                  <p className="text-sm text-red-600 mt-1">Reason: {p.rejection_reason}</p>
                )}
              </div>
              <div className="text-right shrink-0 text-sm text-gray-500">
                <div>{p.rating_count} ratings</div>
                <div className="text-xs">{new Date(p.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
