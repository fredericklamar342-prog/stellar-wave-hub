import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import RatingForm from '../components/RatingForm';
import FinancialsPanel from '../components/FinancialsPanel';

const TABS = ['overview', 'ratings', 'financials'];

export default function ProjectDetail() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get(`/projects/${slug}`);
      setProject(data.project);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [slug]);

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-500">Loading…</div>;
  if (error) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-red-600">{error}</div>;
  if (!project) return null;

  const canRate = user && user.id !== project.submitted_by;
  const hasFinancials = project.stellar_account_id || project.stellar_contract_id;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            {project.status === 'featured' && <span className="badge bg-stellar-100 text-stellar-700">Featured</span>}
          </div>
          <p className="text-gray-500 mt-1">{project.description}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-gray-900">{project.avg_rating > 0 ? project.avg_rating.toFixed(1) : '—'}</div>
          <div className="text-xs text-gray-500">{project.rating_count} ratings</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {TABS.filter((t) => t !== 'financials' || hasFinancials).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t ? 'border-stellar-600 text-stellar-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {project.long_description && <p className="text-gray-700 whitespace-pre-wrap">{project.long_description}</p>}
          <div className="flex flex-wrap gap-3">
            {project.repo_url && <a href={project.repo_url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm">Repository</a>}
            {project.live_url && <a href={project.live_url} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm">Live App</a>}
          </div>
          {project.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {project.tags.map((tag) => <span key={tag} className="badge bg-gray-100 text-gray-700">{tag}</span>)}
            </div>
          )}
          <p className="text-sm text-gray-500">Submitted by <span className="font-medium">{project.submitter_name}</span></p>
        </div>
      )}

      {/* Ratings */}
      {tab === 'ratings' && (
        <div className="space-y-6">
          {canRate && (
            <div className="card p-5">
              <h3 className="font-semibold mb-4">{project.user_rating ? 'Update your rating' : 'Rate this project'}</h3>
              <RatingForm projectId={project.id} existing={project.user_rating} onSubmitted={load} />
            </div>
          )}
          {project.ratings?.length > 0 ? (
            <div className="space-y-4">
              {project.ratings.map((r) => (
                <div key={r.id} className="card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{r.reviewer_name}</span>
                    <span className="text-yellow-400 font-semibold">{r.score}/5</span>
                  </div>
                  {r.review_text && <p className="text-sm text-gray-600">{r.review_text}</p>}
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>Purpose: {r.purpose_score}</span>
                    <span>Innovation: {r.innovation_score}</span>
                    <span>Usability: {r.usability_score}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No ratings yet. Be the first!</p>
          )}
        </div>
      )}

      {/* Financials */}
      {tab === 'financials' && hasFinancials && (
        <FinancialsPanel projectId={project.id} />
      )}
    </div>
  );
}
