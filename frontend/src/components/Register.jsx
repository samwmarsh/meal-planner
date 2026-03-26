import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API_BASE_URL from '../config';

const PASSWORD_RULES = [
  { test: (p) => p.length >= 8, label: 'At least 8 characters' },
  { test: (p) => /[A-Z]/.test(p), label: 'One uppercase letter' },
  { test: (p) => /[a-z]/.test(p), label: 'One lowercase letter' },
  { test: (p) => /[0-9]/.test(p), label: 'One number' },
];

const Register = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const passwordValid = PASSWORD_RULES.every((r) => r.test(password));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!passwordValid) {
      setError('Please meet all password requirements.');
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        navigate('/login');
      } else {
        const data = await response.json().catch(() => null);
        setError(data?.error || 'Registration failed.');
      }
    } catch {
      setError('Network error. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-8 w-full max-w-sm">
        <h2 className="text-2xl font-bold text-slate-700 dark:text-slate-200 mb-6 text-center">Create Account</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Choose a username (min 3 characters)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Choose a password"
            />
            {password.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {PASSWORD_RULES.map((rule) => (
                  <li key={rule.label} className={`text-xs flex items-center gap-1.5 ${rule.test(password) ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    <span>{rule.test(password) ? '\u2713' : '\u2022'}</span>
                    {rule.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {error && (
            <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={!passwordValid}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-lg transition-colors"
          >
            Register
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
