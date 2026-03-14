import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import API_BASE_URL from '../config';

// ── Helpers ───────────────────────────────────────────────────────────────────

const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

const categoryToMealType = (category) => {
  if (!category) return 'Dinner';
  const c = category.toLowerCase();
  if (c === 'breakfast') return 'Breakfast';
  if (c === 'lunch') return 'Lunch';
  if (c === 'snack' || c === 'snacks') return 'Snacks';
  return 'Dinner';
};

const todayDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const tagColors = [
  'bg-emerald-100 text-emerald-800',
  'bg-sky-100 text-sky-800',
  'bg-violet-100 text-violet-800',
  'bg-rose-100 text-rose-800',
  'bg-amber-100 text-amber-800',
  'bg-teal-100 text-teal-800',
];

const getTagColor = (tag, idx) => tagColors[idx % tagColors.length];

// ── Skeleton ──────────────────────────────────────────────────────────────────

const Skeleton = () => (
  <div className="animate-pulse space-y-6">
    {/* Back link placeholder */}
    <div className="h-4 w-32 bg-slate-200 rounded" />

    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8">
      {/* Left column */}
      <div className="space-y-4">
        <div className="h-8 bg-slate-200 rounded w-3/4" />
        <div className="flex gap-2">
          <div className="h-6 w-20 bg-slate-200 rounded-full" />
          <div className="h-6 w-24 bg-slate-200 rounded-full" />
        </div>
        <div className="space-y-2">
          <div className="h-4 bg-slate-200 rounded w-full" />
          <div className="h-4 bg-slate-200 rounded w-5/6" />
        </div>
        <div className="flex gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex-1 h-16 bg-slate-200 rounded-xl" />
          ))}
        </div>
        <div className="h-32 bg-slate-200 rounded-xl" />
      </div>

      {/* Right column */}
      <div className="space-y-4">
        <div className="h-6 w-32 bg-slate-200 rounded" />
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-8 bg-slate-200 rounded" />
        ))}
        <div className="h-6 w-28 bg-slate-200 rounded mt-4" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-slate-200 rounded-xl" />
        ))}
      </div>
    </div>
  </div>
);

// ── Add-to-Plan Modal ─────────────────────────────────────────────────────────

const AddToPlanModal = ({ recipe, onClose, onConfirm, servings }) => {
  const [date, setDate] = useState(todayDateString());
  const [mealType, setMealType] = useState(categoryToMealType(recipe.category));

  const handleConfirm = () => {
    onConfirm(date, mealType);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-slate-800">Add to Plan</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Recipe name */}
        <p className="text-sm text-slate-500 mb-1 -mt-2 line-clamp-1" title={recipe.title}>
          {recipe.title}
        </p>
        <p className="text-xs text-slate-400 mb-5">Servings: {servings}</p>

        {/* Date picker */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Meal type selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">Meal Type</label>
          <div className="grid grid-cols-2 gap-2">
            {mealTypes.map(type => (
              <button
                key={type}
                onClick={() => setMealType(type)}
                className={`py-2 px-3 rounded-lg text-sm font-medium border-2 transition-colors ${
                  mealType === type
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!date}
            className="flex-1 py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-sm font-medium text-white transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Edit Recipe Modal ─────────────────────────────────────────────────────────

const EditRecipeModal = ({ recipe, onClose, onSaved }) => {
  const [form, setForm] = useState({
    title:                recipe.title || '',
    category:             recipe.category || 'Dinner',
    description:          recipe.description || '',
    servings:             recipe.servings || 1,
    prep_time_mins:       recipe.prep_time_mins || 0,
    cook_time_mins:       recipe.cook_time_mins || 0,
    calories_per_serving: recipe.calories_per_serving || 0,
    protein_per_serving:  recipe.protein_per_serving || 0,
    carbs_per_serving:    recipe.carbs_per_serving || 0,
    fat_per_serving:      recipe.fat_per_serving || 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/recipes/${recipe.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...form,
          servings:             parseInt(form.servings) || 1,
          prep_time_mins:       parseInt(form.prep_time_mins) || 0,
          cook_time_mins:       parseInt(form.cook_time_mins) || 0,
          calories_per_serving: parseFloat(form.calories_per_serving) || 0,
          protein_per_serving:  parseFloat(form.protein_per_serving) || 0,
          carbs_per_serving:    parseFloat(form.carbs_per_serving) || 0,
          fat_per_serving:      parseFloat(form.fat_per_serving) || 0,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to save'); }
      const updated = await res.json();
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const labelCls = "block text-xs font-medium text-slate-500 mb-1";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-800">Edit Recipe</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className={labelCls}>Title</label>
            <input name="title" value={form.title} onChange={handleChange} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Category</label>
              <select name="category" value={form.category} onChange={handleChange} className={inputCls}>
                {['Breakfast', 'Lunch', 'Dinner', 'Snacks'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Servings</label>
              <input type="number" name="servings" value={form.servings} onChange={handleChange} min="1" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Prep time (mins)</label>
              <input type="number" name="prep_time_mins" value={form.prep_time_mins} onChange={handleChange} min="0" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Cook time (mins)</label>
              <input type="number" name="cook_time_mins" value={form.cook_time_mins} onChange={handleChange} min="0" className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea name="description" value={form.description} onChange={handleChange} rows={3}
              className={`${inputCls} resize-none`} />
          </div>

          <div>
            <p className={labelCls}>Nutrition per serving</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { name: 'calories_per_serving', label: 'Calories' },
                { name: 'protein_per_serving',  label: 'Protein (g)' },
                { name: 'carbs_per_serving',    label: 'Carbs (g)' },
                { name: 'fat_per_serving',      label: 'Fat (g)' },
              ].map(({ name, label }) => (
                <div key={name}>
                  <label className={labelCls}>{label}</label>
                  <input type="number" name={name} value={form[name]} onChange={handleChange} min="0" step="0.1" className={inputCls} />
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Macro Card ────────────────────────────────────────────────────────────────

const MacroCard = ({ calories, protein, carbs, fat }) => (
  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
      Nutrition per serving
    </p>
    <div className="grid grid-cols-4 gap-3 text-center">
      <div>
        <div className="text-2xl font-bold text-slate-800">{calories}</div>
        <div className="text-xs text-slate-500 mt-0.5">cal</div>
      </div>
      <div>
        <div className="text-2xl font-bold text-blue-600">{protein}g</div>
        <div className="text-xs text-slate-500 mt-0.5">protein</div>
      </div>
      <div>
        <div className="text-2xl font-bold text-amber-600">{carbs}g</div>
        <div className="text-xs text-slate-500 mt-0.5">carbs</div>
      </div>
      <div>
        <div className="text-2xl font-bold text-rose-500">{fat}g</div>
        <div className="text-xs text-slate-500 mt-0.5">fat</div>
      </div>
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

const RecipeDetail = () => {
  const { id: idParam } = useParams();
  // Support slug URLs like /recipes/42-chicken-stir-fry — extract numeric ID prefix
  const id = idParam.split('-')[0];
  const navigate = useNavigate();

  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const [servings, setServings] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [addSuccess, setAddSuccess] = useState(null);
  const [addError, setAddError] = useState(null);

  // ── Fetch recipe ──────────────────────────────────────────────────────────

  const fetchRecipe = () => {
    setLoading(true);
    setError(null);
    setNotFound(false);

    const token = localStorage.getItem('token');
    axios
      .get(`${API_BASE_URL}/recipes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then(res => {
        setRecipe(res.data);
        setServings(res.data.servings || 1);
        setLoading(false);
      })
      .catch(err => {
        if (err.response?.status === 404) {
          setNotFound(true);
        } else {
          setError(err.message || 'Failed to load recipe.');
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchRecipe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Derived values ────────────────────────────────────────────────────────

  const scaledMacros = recipe
    ? {
        calories: Math.round(recipe.calories_per_serving * servings),
        protein: Math.round(recipe.protein_per_serving * servings),
        carbs: Math.round(recipe.carbs_per_serving * servings),
        fat: Math.round(recipe.fat_per_serving * servings),
      }
    : null;

  const scaleQty = (qty) =>
    parseFloat(((qty * servings) / recipe.servings).toFixed(1));

  // Group ingredients by section
  const ingredientSections = recipe
    ? recipe.ingredients.reduce((acc, ing) => {
        const section = ing.section || 'Ingredients';
        if (!acc[section]) acc[section] = [];
        acc[section].push(ing);
        return acc;
      }, {})
    : {};

  // Group steps by section
  const stepSections = recipe
    ? recipe.steps.reduce((acc, step) => {
        const section = step.section || 'Method';
        if (!acc[section]) acc[section] = [];
        acc[section].push(step);
        return acc;
      }, {})
    : {};

  // Build per-ingredient running totals across steps (for "X remaining" display).
  // stepsOrdered: all steps sorted globally by position
  const stepsOrdered = recipe
    ? [...recipe.steps].sort((a, b) => a.position - b.position)
    : [];

  // Map ingredient_id -> total quantity from the ingredient list
  const ingredientTotals = {};
  if (recipe) {
    for (const ing of recipe.ingredients) {
      if (ing.quantity != null) ingredientTotals[ing.id] = ing.quantity;
    }
  }

  // For each step, compute how much of each referenced ingredient has been used
  // by *previous* steps (so we can show "Xg remaining before this step").
  // Returns a map: ingredient_id -> usedSoFar (NOT including this step)
  const usedBeforeStep = {};
  const runningUsed = {}; // ingredient_id -> cumulative used so far
  for (const step of stepsOrdered) {
    usedBeforeStep[step.id] = { ...runningUsed };
    const refs = Array.isArray(step.ingredient_refs) ? step.ingredient_refs : [];
    for (const ref of refs) {
      if (ref.quantity != null) {
        runningUsed[ref.ingredient_id] = (runningUsed[ref.ingredient_id] || 0) + ref.quantity;
      }
    }
  }

  // ── Handle add-to-plan confirm ────────────────────────────────────────────

  const handleAddToPlanConfirm = async (date, mealType) => {
    const token = localStorage.getItem('token');
    try {
      await axios.post(
        `${API_BASE_URL}/meal-plans/from-recipe`,
        { date, meal_type: mealType, recipe_id: recipe.id, servings },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowModal(false);
      setAddSuccess(`Added to ${mealType} on ${date}`);
      setTimeout(() => setAddSuccess(null), 3000);
    } catch (err) {
      setShowModal(false);
      setAddError('Failed to add to plan. Please try again.');
      setTimeout(() => setAddError(null), 3000);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <Skeleton />
      </div>
    );
  }

  // ── 404 state ─────────────────────────────────────────────────────────────

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-5xl mb-4">404</div>
        <h2 className="text-xl font-bold text-slate-700 mb-2">Recipe not found</h2>
        <p className="text-slate-500 mb-6">This recipe doesn't exist or has been removed.</p>
        <Link
          to="/recipes"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Recipes
        </Link>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-4xl mb-4">!</div>
        <h2 className="text-xl font-bold text-slate-700 mb-2">Something went wrong</h2>
        <p className="text-slate-500 mb-6">{error}</p>
        <button
          onClick={fetchRecipe}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div>
      {/* Top bar: back link + Add to Plan */}
      <div className="flex items-center justify-between mb-6">
        <Link
          to="/recipes"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Recipes
        </Link>

        <div className="flex items-center gap-2">
        <button
          onClick={() => setShowEditModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg shadow-sm transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
          </svg>
          Edit
        </button>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Add to Plan
        </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8 items-start">

        {/* ── LEFT COLUMN (sticky on desktop) ───────────────────────────── */}
        <div className="lg:sticky lg:top-6 space-y-5">

          {/* Title */}
          <h1 className="text-3xl font-extrabold text-slate-900 leading-tight">
            {recipe.title}
          </h1>

          {/* Category badge + dietary tag pills */}
          <div className="flex flex-wrap gap-2">
            {recipe.category && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                {recipe.category}
              </span>
            )}
            {(recipe.dietary_tags || []).map((tag, idx) => (
              <span
                key={tag}
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${getTagColor(tag, idx)}`}
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Description */}
          {recipe.description && (
            <p className="text-slate-600 leading-relaxed text-sm">
              {recipe.description}
            </p>
          )}

          {/* Source URL */}
          {recipe.source_url && (
            <a
              href={recipe.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              View original recipe
            </a>
          )}

          {/* Stats row */}
          <div className="flex gap-3">
            <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3 text-center shadow-sm">
              <div className="text-lg font-bold text-slate-800">{recipe.prep_time_mins}<span className="text-sm font-medium text-slate-500 ml-0.5">m</span></div>
              <div className="text-xs text-slate-500 mt-0.5">Prep</div>
            </div>
            <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3 text-center shadow-sm">
              <div className="text-lg font-bold text-slate-800">{recipe.cook_time_mins}<span className="text-sm font-medium text-slate-500 ml-0.5">m</span></div>
              <div className="text-xs text-slate-500 mt-0.5">Cook</div>
            </div>
            <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3 text-center shadow-sm">
              <div className="text-lg font-bold text-slate-800">{recipe.servings}</div>
              <div className="text-xs text-slate-500 mt-0.5">Servings</div>
            </div>
          </div>

          {/* Macro card */}
          <MacroCard
            calories={Math.round(recipe.calories_per_serving)}
            protein={Math.round(recipe.protein_per_serving)}
            carbs={Math.round(recipe.carbs_per_serving)}
            fat={Math.round(recipe.fat_per_serving)}
          />

          {/* Servings adjuster */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Adjust Servings
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setServings(s => Math.max(1, s - 1))}
                disabled={servings <= 1}
                className="w-9 h-9 rounded-lg border border-slate-300 text-slate-600 text-lg font-bold hover:bg-slate-50 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                aria-label="Decrease servings"
              >
                &minus;
              </button>
              <span className="w-8 text-center text-lg font-bold text-slate-800 select-none">
                {servings}
              </span>
              <button
                onClick={() => setServings(s => s + 1)}
                className="w-9 h-9 rounded-lg border border-slate-300 text-slate-600 text-lg font-bold hover:bg-slate-50 hover:border-blue-400 transition-colors flex items-center justify-center"
                aria-label="Increase servings"
              >
                +
              </button>
              <span className="text-xs text-slate-400 ml-1">
                {servings !== recipe.servings && (
                  <span className="text-slate-500">
                    (original: {recipe.servings})
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN (scrollable) ──────────────────────────────────── */}
        <div className="space-y-8">

          {/* Ingredients */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Ingredients</h2>
            </div>

            <div className="divide-y divide-slate-50">
              {Object.entries(ingredientSections).map(([section, ings]) => (
                <div key={section} className="px-6 py-4">
                  {/* Section label — only shown if there's more than one section */}
                  {Object.keys(ingredientSections).length > 1 && (
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
                      {section}
                    </h3>
                  )}
                  <ul className="space-y-2">
                    {[...ings]
                      .sort((a, b) => a.position - b.position)
                      .map((ing, idx) => {
                        const qty = scaleQty(ing.quantity);
                        const qtyDisplay = qty % 1 === 0 ? String(qty | 0) : String(qty);
                        return (
                          <li key={idx} className="flex items-baseline gap-3 text-sm">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                            <span className="font-semibold text-slate-700 tabular-nums w-16 shrink-0">
                              {qtyDisplay}{ing.unit && <span className="font-normal text-slate-500 ml-0.5">{ing.unit}</span>}
                            </span>
                            <span className="text-slate-800 flex-1">
                              {ing.name}
                              {ing.notes && (
                                <span className="text-slate-400 ml-1.5 font-normal italic">{ing.notes}</span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Method / Steps */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Method</h2>
            </div>

            <div className="divide-y divide-slate-50">
              {Object.entries(stepSections).map(([section, steps]) => (
                <div key={section} className="px-6 py-4">
                  {/* Section label — only shown if there's more than one section */}
                  {Object.keys(stepSections).length > 1 && (
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
                      {section}
                    </h3>
                  )}
                  <div className="space-y-4">
                    {[...steps]
                      .sort((a, b) => a.position - b.position)
                      .map((step, idx) => {
                        const refs = Array.isArray(step.ingredient_refs) ? step.ingredient_refs : [];
                        const usedBefore = usedBeforeStep[step.id] || {};
                        return (
                          <div key={idx} className="flex gap-4">
                            {/* Step number circle */}
                            <div className="shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
                              {step.position}
                            </div>
                            {/* Instruction + ingredient refs */}
                            <div className="flex-1 space-y-2">
                              <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm text-slate-700 leading-relaxed">
                                {step.instruction}
                              </div>
                              {refs.length > 0 && (
                                <div className="flex flex-wrap gap-2 pl-1">
                                  {refs.map((ref, ri) => {
                                    const total = ingredientTotals[ref.ingredient_id];
                                    const usedPrior = usedBefore[ref.ingredient_id] || 0;
                                    const remaining = (total != null && ref.quantity != null)
                                      ? +(total - usedPrior - ref.quantity).toFixed(2)
                                      : null;
                                    const qtyStr = ref.quantity != null
                                      ? `${ref.quantity % 1 === 0 ? ref.quantity : ref.quantity}${ref.unit ? ref.unit : ''}`
                                      : null;
                                    return (
                                      <span key={ri} className="inline-flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-full px-2.5 py-1 font-medium">
                                        {qtyStr && <span className="font-bold">{qtyStr}</span>}
                                        <span>{ref.name}</span>
                                        {remaining !== null && remaining > 0 && (
                                          <span className="text-amber-600 font-normal">· {remaining % 1 === 0 ? remaining : remaining}{ref.unit ? ref.unit : ''} remaining</span>
                                        )}
                                        {remaining !== null && remaining <= 0 && (
                                          <span className="text-slate-400 font-normal">· uses all</span>
                                        )}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Edit recipe modal */}
      {showEditModal && (
        <EditRecipeModal
          recipe={recipe}
          onClose={() => setShowEditModal(false)}
          onSaved={async (updated) => {
            setRecipe(r => ({ ...r, ...updated }));
            setShowEditModal(false);
            // Re-parse ingredient refs in case ingredients changed
            try {
              const token = localStorage.getItem('token');
              const r = await fetch(`${API_BASE_URL}/recipes/${recipe.id}/reparse-steps`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (r.ok) {
                const { steps } = await r.json();
                setRecipe(prev => ({ ...prev, steps }));
              }
            } catch { /* non-critical */ }
          }}
        />
      )}

      {/* Add to Plan modal */}
      {showModal && (
        <AddToPlanModal
          recipe={recipe}
          onClose={() => setShowModal(false)}
          onConfirm={handleAddToPlanConfirm}
          servings={servings}
        />
      )}

      {/* Toast notifications */}
      {addSuccess && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {addSuccess}
        </div>
      )}
      {addError && (
        <div className="fixed top-4 right-4 z-50 bg-red-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium">
          {addError}
        </div>
      )}
    </div>
  );
};

export default RecipeDetail;
