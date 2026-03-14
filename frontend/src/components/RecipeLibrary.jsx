import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import API_BASE_URL from '../config';

const CATEGORIES = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Snacks'];

const slugify = (title) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Colour bands for the card header — mirrors MealCalendar mealTypeHeaderBar
const categoryHeaderBar = {
  Breakfast: 'bg-amber-400',
  Lunch:     'bg-green-400',
  Dinner:    'bg-blue-400',
  Snacks:    'bg-purple-400',
};

const categoryBadge = {
  Breakfast: 'bg-amber-100 text-amber-800',
  Lunch:     'bg-green-100 text-green-800',
  Dinner:    'bg-blue-100 text-blue-800',
  Snacks:    'bg-purple-100 text-purple-800',
};

const defaultHeaderBar = 'bg-slate-400';
const defaultBadge = 'bg-slate-100 text-slate-700';

// --- Skeleton card ---
const SkeletonCard = () => (
  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-pulse">
    <div className="h-14 bg-slate-200" />
    <div className="p-4 space-y-3">
      <div className="h-4 bg-slate-200 rounded w-3/4" />
      <div className="h-3 bg-slate-200 rounded w-full" />
      <div className="h-3 bg-slate-200 rounded w-5/6" />
      <div className="h-3 bg-slate-200 rounded w-1/2 mt-1" />
      <div className="flex gap-2 mt-2">
        <div className="h-5 bg-slate-200 rounded-full w-16" />
        <div className="h-5 bg-slate-200 rounded-full w-20" />
      </div>
      <div className="h-8 bg-slate-200 rounded-lg mt-2" />
    </div>
  </div>
);

// --- Recipe card ---
const RecipeCard = ({ recipe, addToMode, onSelect }) => {
  const category = recipe.category || recipe.meal_type || '';
  const headerBarClass = categoryHeaderBar[category] || defaultHeaderBar;
  const badgeClass = categoryBadge[category] || defaultBadge;

  const calories  = recipe.calories_per_serving ?? recipe.calories ?? null;
  const proteinG  = parseFloat(recipe.protein_per_serving ?? recipe.protein_g) || null;
  const carbsG    = parseFloat(recipe.carbs_per_serving   ?? recipe.carbs_g)   || null;
  const fatG      = parseFloat(recipe.fat_per_serving     ?? recipe.fat_g)     || null;

  const hasMacros = calories != null || proteinG != null || carbsG != null || fatG != null;

  const prepTime  = recipe.prep_time_mins ?? recipe.prep_time_minutes ?? null;
  const cookTime  = recipe.cook_time_mins ?? recipe.cook_time_minutes ?? null;
  const servings  = recipe.servings ?? null;

  // Dietary tags — accept array or comma-separated string
  let tags = [];
  if (Array.isArray(recipe.dietary_tags)) {
    tags = recipe.dietary_tags;
  } else if (typeof recipe.dietary_tags === 'string' && recipe.dietary_tags.trim()) {
    tags = recipe.dietary_tags.split(',').map(t => t.trim()).filter(Boolean);
  }

  const description = recipe.description || recipe.notes || '';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow duration-200 flex flex-col">
      {/* Colour header band */}
      <div className={`${headerBarClass} px-4 py-3 flex items-center justify-between`}>
        {category ? (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
            {category}
          </span>
        ) : (
          <span />
        )}
      </div>

      {/* Card body */}
      <div className="p-4 flex flex-col flex-1">
        {/* Title */}
        <h3 className="text-base font-bold text-slate-800 leading-snug mb-1">
          {recipe.name || recipe.title || 'Unnamed Recipe'}
        </h3>

        {/* Description */}
        {description && (
          <p className="text-sm text-slate-500 line-clamp-3 mb-3 leading-relaxed">
            {description}
          </p>
        )}

        {/* Macro row */}
        {hasMacros && (
          <div className="text-xs text-slate-500 mb-3 font-medium">
            {[
              calories != null      && `${Math.round(calories)}cal`,
              proteinG != null      && `${proteinG}g P`,
              carbsG   != null      && `${carbsG}g C`,
              fatG     != null      && `${fatG}g F`,
            ].filter(Boolean).join(' · ')}
          </div>
        )}

        {/* Time + servings footer */}
        {(prepTime != null || cookTime != null || servings != null) && (
          <div className="text-xs text-slate-400 flex items-center gap-3 mb-3">
            {(prepTime != null || cookTime != null) && (
              <span className="flex items-center gap-1">
                {/* Clock icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                </svg>
                {[
                  prepTime != null && `${prepTime}m prep`,
                  cookTime != null && `${cookTime}m cook`,
                ].filter(Boolean).join(' + ')}
              </span>
            )}
            {servings != null && (
              <span className="flex items-center gap-1">
                {/* Users icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {servings} serving{servings !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* Dietary tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.map(tag => (
              <span
                key={tag}
                className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Spacer pushes button to bottom */}
        <div className="flex-1" />

        {/* CTA button(s) */}
        {addToMode ? (
          <div className="mt-2 flex gap-2">
            <Link
              to={`/recipes/${recipe.id}-${slugify(recipe.title)}`}
              className="flex-1 block text-center border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium py-2 rounded-lg transition-colors"
            >
              View
            </Link>
            <button
              onClick={() => onSelect(recipe)}
              className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
            >
              Select
            </button>
          </div>
        ) : (
          <Link
            to={`/recipes/${recipe.id}-${slugify(recipe.title)}`}
            className="mt-2 block w-full text-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
          >
            View Recipe
          </Link>
        )}
      </div>
    </div>
  );
};

// --- Main component ---
const RecipeLibrary = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Read URL params
  const addTo    = searchParams.get('addTo')    || '';
  const mealType = searchParams.get('mealType') || '';
  const addToMode = !!(addTo && mealType);

  // Filter state — initialised from URL
  const [searchInput, setSearchInput]   = useState(searchParams.get('search') || '');
  const [activeCategory, setActiveCategory] = useState(searchParams.get('category') || 'All');

  // Data state
  const [recipes, setRecipes]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  // Debounced search term (avoid a fetch on every keypress)
  const [debouncedSearch, setDebouncedSearch] = useState(searchInput);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Sync URL params when filters change
  useEffect(() => {
    const params = {};
    if (debouncedSearch)           params.search   = debouncedSearch;
    if (activeCategory !== 'All')  params.category = activeCategory;
    if (addTo)                     params.addTo    = addTo;
    if (mealType)                  params.mealType = mealType;
    setSearchParams(params, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, activeCategory]);

  // Fetch recipes
  const fetchRecipes = useCallback(() => {
    setLoading(true);
    setError('');

    const params = {};
    if (debouncedSearch)          params.search   = debouncedSearch;
    if (activeCategory !== 'All') params.category = activeCategory;

    const token = localStorage.getItem('token');
    axios
      .get(`${API_BASE_URL}/recipes`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        params,
      })
      .then(res => {
        setRecipes(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        setError('Failed to load recipes. Please try again.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [debouncedSearch, activeCategory]);

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  // Handle "Select" in add-to-plan mode
  const handleSelect = (recipe) => {
    // Navigate back to calendar with highlight params so the calendar can
    // pre-open the chosen date. Full recipe→meal-plan linking is deferred
    // until the data model is complete.
    navigate(`/?highlight=${addTo}&mealType=${mealType}`);
  };

  // Handle category tab click
  const handleCategoryClick = (cat) => {
    setActiveCategory(cat);
  };

  // Handle search input change
  const handleSearchChange = (e) => {
    setSearchInput(e.target.value);
  };

  // Cancel add-to-plan mode
  const handleCancel = () => {
    navigate('/');
  };

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Recipe Library</h1>
          <p className="text-sm text-slate-500 mt-0.5">Browse and discover recipes</p>
        </div>
        <Link
          to="/recipes/import"
          className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Import Recipe
        </Link>
      </div>

      {/* Add-to-plan banner */}
      {addToMode && (
        <div className="flex items-center justify-between gap-4 bg-teal-50 border border-teal-200 rounded-xl px-5 py-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* Info icon */}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-teal-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
            </svg>
            <p className="text-sm font-medium text-teal-800 truncate">
              Picking <span className="font-bold">{mealType}</span> for{' '}
              <span className="font-bold">{addTo}</span> — select a recipe below
            </p>
          </div>
          <button
            onClick={handleCancel}
            className="shrink-0 text-sm font-medium text-teal-700 hover:text-teal-900 border border-teal-300 hover:border-teal-500 bg-white px-3 py-1 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Search + category filters */}
      <div className="space-y-3">
        {/* Search bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search recipes..."
            value={searchInput}
            onChange={handleSearchChange}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Clear search"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => handleCategoryClick(cat)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-blue-400'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Recipe grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : recipes.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-14 h-14 text-slate-300 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <p className="text-slate-500 font-medium">No recipes found.</p>
          <p className="text-slate-400 text-sm mt-1">
            Try a different search or category.
          </p>
          {(searchInput || activeCategory !== 'All') && (
            <button
              onClick={() => { setSearchInput(''); setActiveCategory('All'); }}
              className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium underline-offset-2 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {recipes.map(recipe => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              addToMode={addToMode}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default RecipeLibrary;
