import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API_BASE_URL from '../config';

const slugify = (title) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const CATEGORIES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

const DIETARY_TAGS = ['vegan', 'vegetarian', 'gluten-free', 'dairy-free', 'keto', 'low-glycemic', 'high-protein', 'low-carb'];

const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'oz', 'lb', 'piece', 'pinch', 'bunch', 'clove', 'slice', ''];

const emptyIngredient = () => ({
  quantity: '', unit: '', name: '', notes: '',
});

const emptyStep = () => ({
  instruction: '',
});

const CreateRecipe = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '',
    category: 'Dinner',
    description: '',
    servings: 2,
    prep_time_mins: '',
    cook_time_mins: '',
    calories_per_serving: '',
    protein_per_serving: '',
    carbs_per_serving: '',
    fat_per_serving: '',
    image_url: '',
  });

  const [ingredientSection, setIngredientSection] = useState('Ingredients');
  const [ingredients, setIngredients] = useState([emptyIngredient()]);

  const [stepSection, setStepSection] = useState('Method');
  const [steps, setSteps] = useState([emptyStep()]);

  const [selectedTags, setSelectedTags] = useState([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // --- Form helpers ---

  const handleChange = (e) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const updateIngredient = (idx, field, value) => {
    setIngredients((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  const addIngredient = () => setIngredients((p) => [...p, emptyIngredient()]);

  const removeIngredient = (idx) =>
    setIngredients((p) => p.filter((_, i) => i !== idx));

  const updateStep = (idx, value) => {
    setSteps((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], instruction: value };
      return copy;
    });
  };

  const addStep = () => setSteps((p) => [...p, emptyStep()]);

  const removeStep = (idx) => setSteps((p) => p.filter((_, i) => i !== idx));

  // --- Submit ---

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    setSaving(true);
    setError('');

    const payload = {
      title: form.title.trim(),
      category: form.category,
      description: form.description.trim(),
      servings: parseInt(form.servings) || 2,
      prep_time_mins: parseInt(form.prep_time_mins) || 0,
      cook_time_mins: parseInt(form.cook_time_mins) || 0,
      calories_per_serving: parseFloat(form.calories_per_serving) || 0,
      protein_per_serving: parseFloat(form.protein_per_serving) || 0,
      carbs_per_serving: parseFloat(form.carbs_per_serving) || 0,
      fat_per_serving: parseFloat(form.fat_per_serving) || 0,
      dietary_tags: selectedTags,
      image_url: form.image_url.trim() || null,
      ingredients: ingredients
        .filter((ing) => ing.name.trim())
        .map((ing, idx) => ({
          section: ingredientSection || 'Ingredients',
          position: idx + 1,
          quantity: parseFloat(ing.quantity) || 0,
          unit: ing.unit,
          name: ing.name.trim(),
          notes: ing.notes.trim(),
        })),
      steps: steps
        .filter((s) => s.instruction.trim())
        .map((s, idx) => ({
          section: stepSection || 'Method',
          position: idx + 1,
          instruction: s.instruction.trim(),
        })),
    };

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/recipes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create recipe.');
      } else {
        navigate(`/recipes/${data.id}-${slugify(data.title)}`);
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow';
  const labelCls = 'block text-sm font-medium text-slate-600 mb-1.5';

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">
      {/* Breadcrumb */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link
            to="/recipes"
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            Recipe Library
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm text-slate-700 font-medium">Create Recipe</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Create Recipe</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Build a new recipe from scratch with ingredients and method steps.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-800">Basic Info</h2>

          <div>
            <label className={labelCls}>
              Title <span className="text-red-400">*</span>
            </label>
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="e.g. Chicken Stir Fry"
              className={inputCls}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Category</label>
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                className={inputCls}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Servings</label>
              <input
                type="number"
                name="servings"
                value={form.servings}
                onChange={handleChange}
                min="1"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              placeholder="A short description of the recipe..."
              className={`${inputCls} resize-none`}
            />
          </div>

          <div>
            <label className={labelCls}>Image URL</label>
            <input
              name="image_url"
              value={form.image_url}
              onChange={handleChange}
              placeholder="https://example.com/photo.jpg"
              className={inputCls}
            />
          </div>

          {/* Dietary tags */}
          <div>
            <label className={labelCls}>Dietary Tags</label>
            <div className="flex flex-wrap gap-2">
              {DIETARY_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setSelectedTags((prev) =>
                      prev.includes(tag)
                        ? prev.filter((t) => t !== tag)
                        : [...prev, tag]
                    )
                  }
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Prep time (mins)</label>
              <input
                type="number"
                name="prep_time_mins"
                value={form.prep_time_mins}
                onChange={handleChange}
                min="0"
                placeholder="0"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Cook time (mins)</label>
              <input
                type="number"
                name="cook_time_mins"
                value={form.cook_time_mins}
                onChange={handleChange}
                min="0"
                placeholder="0"
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Nutrition card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-800">Nutrition per Serving</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { name: 'calories_per_serving', label: 'Calories', placeholder: '0' },
              { name: 'protein_per_serving', label: 'Protein (g)', placeholder: '0' },
              { name: 'carbs_per_serving', label: 'Carbs (g)', placeholder: '0' },
              { name: 'fat_per_serving', label: 'Fat (g)', placeholder: '0' },
            ].map(({ name, label, placeholder }) => (
              <div key={name}>
                <label className={labelCls}>{label}</label>
                <input
                  type="number"
                  name={name}
                  value={form[name]}
                  onChange={handleChange}
                  min="0"
                  step="0.1"
                  placeholder={placeholder}
                  className={inputCls}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Ingredients card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-slate-800">Ingredients</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400 shrink-0">Section:</label>
              <input
                value={ingredientSection}
                onChange={(e) => setIngredientSection(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-28"
              />
            </div>
          </div>

          <div className="space-y-3">
            {ingredients.map((ing, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 bg-slate-50 border border-slate-100 rounded-xl p-3"
              >
                <div className="flex-1 grid grid-cols-12 gap-2">
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">Qty</label>
                    <input
                      type="number"
                      value={ing.quantity}
                      onChange={(e) => updateIngredient(idx, 'quantity', e.target.value)}
                      min="0"
                      step="0.1"
                      placeholder="0"
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">Unit</label>
                    <select
                      value={ing.unit}
                      onChange={(e) => updateIngredient(idx, 'unit', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u || '—'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4">
                    <label className="block text-xs text-slate-400 mb-1">Name</label>
                    <input
                      value={ing.name}
                      onChange={(e) => updateIngredient(idx, 'name', e.target.value)}
                      placeholder="e.g. chicken breast"
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="col-span-4">
                    <label className="block text-xs text-slate-400 mb-1">Notes</label>
                    <input
                      value={ing.notes}
                      onChange={(e) => updateIngredient(idx, 'notes', e.target.value)}
                      placeholder="diced, optional..."
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeIngredient(idx)}
                  disabled={ingredients.length === 1}
                  className="mt-5 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
                  aria-label="Remove ingredient"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addIngredient}
            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add ingredient
          </button>
        </div>

        {/* Method steps card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-slate-800">Method</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400 shrink-0">Section:</label>
              <input
                value={stepSection}
                onChange={(e) => setStepSection(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-28"
              />
            </div>
          </div>

          <div className="space-y-3">
            {steps.map((step, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3"
              >
                <div className="shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                  {idx + 1}
                </div>
                <textarea
                  value={step.instruction}
                  onChange={(e) => updateStep(idx, e.target.value)}
                  rows={2}
                  placeholder={`Step ${idx + 1} instructions...`}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <button
                  type="button"
                  onClick={() => removeStep(idx)}
                  disabled={steps.length === 1}
                  className="mt-0.5 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
                  aria-label="Remove step"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addStep}
            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add step
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-start gap-3">
            <svg
              className="w-5 h-5 text-red-500 mt-0.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
            <div>
              <p className="text-sm font-semibold text-red-700">Error</p>
              <p className="text-sm text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
        >
          {saving ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
                />
              </svg>
              Creating...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create Recipe
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default CreateRecipe;
