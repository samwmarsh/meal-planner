import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE_URL from '../config';
import { useToast } from './ToastContext';

const Skeleton = () => (
  <div className="animate-pulse space-y-4">
    {[1, 2, 3].map(i => (
      <div key={i} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
        <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
        <div className="flex gap-4">
          {[1, 2, 3, 4].map(j => (
            <div key={j} className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-16" />
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <div className="h-9 bg-slate-200 dark:bg-slate-700 rounded w-24" />
          <div className="h-9 bg-slate-200 dark:bg-slate-700 rounded w-24" />
        </div>
      </div>
    ))}
  </div>
);

const AdminQueue = () => {
  const toast = useToast();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchPending = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/admin/recipes/pending`, { headers });
      setRecipes(res.data);
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to load pending recipes', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApprove = async (id) => {
    try {
      const res = await axios.put(`${API_BASE_URL}/admin/recipes/${id}/approve`, {}, { headers });
      toast(`Approved: ${res.data.recipe.title}`, 'success');
      setRecipes(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to approve recipe', 'error');
    }
  };

  const handleReject = async (id) => {
    try {
      const res = await axios.put(`${API_BASE_URL}/admin/recipes/${id}/reject`, { reason: rejectReason }, { headers });
      toast(`Rejected: ${res.data.recipe.title}`, 'success');
      setRecipes(prev => prev.filter(r => r.id !== id));
      setRejectingId(null);
      setRejectReason('');
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to reject recipe', 'error');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">Admin: Approval Queue</h1>

      {loading ? (
        <Skeleton />
      ) : recipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-lg font-semibold text-slate-600 dark:text-slate-400 mb-1">All caught up!</h2>
          <p className="text-sm text-slate-500 dark:text-slate-500">No recipes pending approval.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {recipes.map(recipe => (
            <div
              key={recipe.id}
              className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate">{recipe.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    by {recipe.author_name || 'Unknown'} &middot; {formatDate(recipe.created_at)}
                  </p>
                  <div className="flex flex-wrap gap-3 mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {recipe.category && (
                      <span className="inline-flex items-center gap-1">
                        <span className="font-medium">Category:</span> {recipe.category}
                      </span>
                    )}
                    {recipe.calories_per_serving > 0 && (
                      <span>{Math.round(recipe.calories_per_serving)} cal</span>
                    )}
                    {recipe.protein_per_serving > 0 && (
                      <span>{Math.round(recipe.protein_per_serving)}g protein</span>
                    )}
                    {recipe.carbs_per_serving > 0 && (
                      <span>{Math.round(recipe.carbs_per_serving)}g carbs</span>
                    )}
                    {recipe.fat_per_serving > 0 && (
                      <span>{Math.round(recipe.fat_per_serving)}g fat</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => handleApprove(recipe.id)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Approve
                </button>
                {rejectingId === recipe.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="Reason (optional)"
                      className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                    <button
                      onClick={() => handleReject(recipe.id)}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => { setRejectingId(null); setRejectReason(''); }}
                      className="px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setRejectingId(recipe.id)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-semibold rounded-lg transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Reject
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminQueue;
