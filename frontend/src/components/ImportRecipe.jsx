import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import API_BASE_URL from '../config';

const slugify = (title) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const categoryBadge = {
  Breakfast: 'bg-amber-100 text-amber-800',
  Lunch:     'bg-green-100 text-green-800',
  Dinner:    'bg-blue-100 text-blue-800',
  Snacks:    'bg-purple-100 text-purple-800',
};

const ImportRecipe = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importedRecipe, setImportedRecipe] = useState(null);

  const handleImport = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setImportedRecipe(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/recipes/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to import recipe.');
      } else {
        setImportedRecipe(data);
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleImportAnother = () => {
    setImportedRecipe(null);
    setUrl('');
    setError('');
  };

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link to="/recipes" className="text-sm text-slate-500 hover:text-slate-700 transition-colors">
            Recipe Library
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm text-slate-700 font-medium">Import Recipe</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Import Recipe by URL</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Paste a URL from any recipe site that uses structured data (Schema.org Recipe).
        </p>
      </div>

      {/* Import form */}
      <form onSubmit={handleImport} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Recipe URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.example.com/recipes/chicken-caesar-salad"
            disabled={loading}
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow disabled:opacity-60"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              Importing…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Import Recipe
            </>
          )}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-700">Import failed</p>
            <p className="text-sm text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Success preview */}
      {importedRecipe && (
        <div className="bg-white rounded-2xl border border-green-200 shadow-sm overflow-hidden">
          {/* Success banner */}
          <div className="bg-green-50 border-b border-green-100 px-5 py-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <p className="text-sm font-semibold text-green-700">Recipe imported successfully!</p>
          </div>

          {/* Imported recipe image */}
          {importedRecipe.image_url && (
            <img
              src={importedRecipe.image_url}
              alt={importedRecipe.title}
              className="w-full h-48 object-cover"
              loading="lazy"
              onError={(e) => e.target.style.display = 'none'}
            />
          )}

          <div className="p-5 space-y-4">
            {/* Title + category */}
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold text-slate-800 leading-snug">{importedRecipe.title}</h2>
              {importedRecipe.category && (
                <span className={`shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full ${categoryBadge[importedRecipe.category] || 'bg-slate-100 text-slate-700'}`}>
                  {importedRecipe.category}
                </span>
              )}
            </div>

            {/* Description */}
            {importedRecipe.description && (
              <p className="text-sm text-slate-500 line-clamp-3 leading-relaxed">{importedRecipe.description}</p>
            )}

            {/* Stats row */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
              {(importedRecipe.prep_time_mins > 0 || importedRecipe.cook_time_mins > 0) && (
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                  </svg>
                  {[
                    importedRecipe.prep_time_mins > 0 && `${importedRecipe.prep_time_mins}m prep`,
                    importedRecipe.cook_time_mins > 0 && `${importedRecipe.cook_time_mins}m cook`,
                  ].filter(Boolean).join(' + ')}
                </span>
              )}
              {importedRecipe.servings > 0 && (
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {importedRecipe.servings} serving{importedRecipe.servings !== 1 ? 's' : ''}
                </span>
              )}
              {importedRecipe.ingredients?.length > 0 && (
                <span>{importedRecipe.ingredients.length} ingredients</span>
              )}
            </div>

            {/* Macros */}
            {importedRecipe.calories_per_serving > 0 && (
              <div className="text-xs text-slate-500 font-medium">
                {[
                  importedRecipe.calories_per_serving && `${Math.round(importedRecipe.calories_per_serving)} kcal`,
                  importedRecipe.protein_per_serving > 0 && `${importedRecipe.protein_per_serving}g protein`,
                  importedRecipe.carbs_per_serving > 0 && `${importedRecipe.carbs_per_serving}g carbs`,
                  importedRecipe.fat_per_serving > 0 && `${importedRecipe.fat_per_serving}g fat`,
                ].filter(Boolean).join(' · ')}
                <span className="text-slate-400"> per serving</span>
              </div>
            )}

            {/* Dietary tags */}
            {importedRecipe.dietary_tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {importedRecipe.dietary_tags.map(tag => (
                  <span key={tag} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <Link
                to={`/recipes/${importedRecipe.id}-${slugify(importedRecipe.title)}`}
                className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                View Recipe
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
              <button
                onClick={handleImportAnother}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                Import Another
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportRecipe;
