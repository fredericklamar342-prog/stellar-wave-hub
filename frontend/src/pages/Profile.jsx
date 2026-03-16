import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function Profile() {
  const { user, login } = useAuth();
  const [form, setForm] = useState({
    display_name: user?.display_name || '',
    stellar_address: user?.stellar_address || '',
    github_url: user?.github_url || '',
    bio: user?.bio || '',
  });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);
    try {
      const { data } = await api.put('/auth/me', form);
      login(localStorage.getItem('token'), data.user);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Profile</h1>
      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div>
          <label className="label">Display Name</label>
          <input type="text" required value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">Stellar Address</label>
          <input type="text" placeholder="G..." value={form.stellar_address} onChange={(e) => setForm({ ...form, stellar_address: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">GitHub URL</label>
          <input type="url" placeholder="https://github.com/..." value={form.github_url} onChange={(e) => setForm({ ...form, github_url: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">Bio</label>
          <textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="input resize-none" />
        </div>
        {success && <p className="text-sm text-green-600">Profile updated.</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
