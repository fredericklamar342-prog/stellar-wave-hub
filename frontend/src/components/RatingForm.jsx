import { useState } from 'react';
import api from '../services/api';

const DIMENSIONS = [
  { key: 'score', label: 'Overall' },
  { key: 'purpose_score', label: 'Purpose' },
  { key: 'innovation_score', label: 'Innovation' },
  { key: 'usability_score', label: 'Usability' },
];

function StarPicker({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`text-2xl ${n <= value ? 'text-yellow-400' : 'text-gray-300'} hover:text-yellow-400 transition-colors`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function RatingForm({ projectId, existing, onSubmitted }) {
  const [scores, setScores] = useState({
    score: existing?.score || 0,
    purpose_score: existing?.purpose_score || 0,
    innovation_score: existing?.innovation_score || 0,
    usability_score: existing?.usability_score || 0,
  });
  const [reviewText, setReviewText] = useState(existing?.review_text || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (Object.values(scores).some((s) => s === 0)) {
      setError('Please fill in all rating dimensions.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.post('/ratings', { project_id: projectId, ...scores, review_text: reviewText || undefined });
      onSubmitted?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {DIMENSIONS.map(({ key, label }) => (
        <div key={key}>
          <label className="label">{label}</label>
          <StarPicker value={scores[key]} onChange={(v) => setScores((s) => ({ ...s, [key]: v }))} />
        </div>
      ))}

      <div>
        <label className="label">Review (optional)</label>
        <textarea
          rows={3}
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          placeholder="Share your thoughts..."
          className="input resize-none"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={submitting} className="btn-primary w-full">
        {submitting ? 'Submitting…' : existing ? 'Update Rating' : 'Submit Rating'}
      </button>
    </form>
  );
}
