import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '', display_name: '', stellar_address: '', github_url: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/register', form);
      login(data.token, data.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function field(key) {
    return { value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }) };
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold mb-6">Create Account</h1>
      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div>
          <label className="label">Display Name</label>
          <input type="text" required {...field('display_name')} className="input" />
        </div>
        <div>
          <label className="label">Username</label>
          <input type="text" required {...field('username')} className="input" />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" required {...field('email')} className="input" />
        </div>
        <div>
          <label className="label">Password</label>
          <input type="password" required minLength={8} {...field('password')} className="input" />
        </div>
        <div>
          <label className="label">Stellar Address (optional)</label>
          <input type="text" placeholder="G..." {...field('stellar_address')} className="input" />
        </div>
        <div>
          <label className="label">GitHub URL (optional)</label>
          <input type="url" placeholder="https://github.com/..." {...field('github_url')} className="input" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Creating account…' : 'Register'}</button>
        <p className="text-sm text-center text-gray-500">
          Already have an account? <Link to="/login" className="text-stellar-600 hover:underline">Login</Link>
        </p>
      </form>
    </div>
  );
}
