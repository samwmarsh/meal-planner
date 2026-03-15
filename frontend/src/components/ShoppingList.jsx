import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import API_BASE_URL from '../config';

const MEAL_TYPE_STYLES = {
  Breakfast: 'bg-amber-100 text-amber-800',
  Lunch: 'bg-green-100 text-green-800',
  Dinner: 'bg-blue-100 text-blue-800',
  Snacks: 'bg-purple-100 text-purple-800',
};

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const CATEGORY_ORDER = ['Produce', 'Meat & Fish', 'Dairy', 'Bakery', 'Dry Goods', 'Frozen', 'Other'];

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDayHeader(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function buildClipboardText(weekStart, mealsGrouped, totals) {
  const lines = [`Meal Plan — Week of ${formatDisplayDate(weekStart)}`, ''];
  for (const day of DAY_ORDER) {
    const dayMeals = mealsGrouped[day];
    if (!dayMeals || dayMeals.length === 0) continue;
    const isoDate = dayMeals[0].date;
    lines.push(formatDayHeader(isoDate));
    for (const meal of dayMeals) {
      lines.push(
        `  [${meal.meal_type}] ${meal.meal_name} (x${meal.servings}) — ${meal.calories} kcal | P: ${meal.protein_g}g | C: ${meal.carbs_g}g | F: ${meal.fat_g}g`
      );
    }
    lines.push('');
  }
  lines.push(
    `Weekly Totals: ${totals.calories} kcal | Protein: ${totals.protein_g}g | Carbs: ${totals.carbs_g}g | Fat: ${totals.fat_g}g`
  );
  return lines.join('\n');
}

function formatQty(n) {
  if (n === null || n === undefined) return '';
  const num = Number(n);
  if (isNaN(num)) return String(n);
  return Number.isInteger(num) ? String(num) : String(parseFloat(num.toFixed(2)));
}

// ── Active Shopping Trip View ─────────────────────────────────────────────────

const ActiveTripView = ({ trip: initialTrip, onBack }) => {
  const [trip, setTrip] = useState(initialTrip);
  const [items, setItems] = useState(initialTrip.items || []);
  const [newItemName, setNewItemName] = useState('');
  const [completing, setCompleting] = useState(false);

  const checkedCount = items.filter(i => i.checked).length;

  const toggleItem = async (item) => {
    const newChecked = !item.checked;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: newChecked } : i));
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE_URL}/shopping-trips/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ checked: newChecked }),
      });
    } catch { /* optimistic UI — already updated locally */ }
  };

  const addCustomItem = async () => {
    if (!newItemName.trim()) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE_URL}/shopping-trips/active/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newItemName.trim() }),
      });
      if (res.ok) {
        const item = await res.json();
        setItems(prev => [...prev, item]);
        setNewItemName('');
      }
    } catch { /* silent */ }
  };

  const completeTrip = async () => {
    setCompleting(true);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE_URL}/shopping-trips/active/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      onBack();
    } catch { setCompleting(false); }
  };

  // Group items by category
  const grouped = {};
  for (const item of items) {
    const cat = item.category || 'Other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }
  const sortedCategories = CATEGORY_ORDER.filter(c => grouped[c]?.length > 0);
  // Add any categories not in the standard order
  for (const c of Object.keys(grouped)) {
    if (!sortedCategories.includes(c)) sortedCategories.push(c);
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={onBack} className="text-sm text-slate-500 hover:text-blue-600 mb-1 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to plan
          </button>
          <h1 className="text-2xl font-bold text-slate-800">{trip.name}</h1>
        </div>
        <button
          onClick={completeTrip}
          disabled={completing}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {completing ? 'Completing...' : 'Complete Trip'}
        </button>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-slate-600 font-medium">{checkedCount} of {items.length} items</span>
          <span className="text-slate-400">{items.length > 0 ? Math.round(checkedCount / items.length * 100) : 0}%</span>
        </div>
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-300"
            style={{ width: `${items.length > 0 ? (checkedCount / items.length * 100) : 0}%` }}
          />
        </div>
      </div>

      {/* Add custom item */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={newItemName}
          onChange={e => setNewItemName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCustomItem()}
          placeholder="Add an item..."
          className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          onClick={addCustomItem}
          disabled={!newItemName.trim()}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Add
        </button>
      </div>

      {/* Items grouped by category */}
      {sortedCategories.map(category => (
        <div key={category} className="mb-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2 px-1">{category}</h3>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-50">
            {grouped[category].map(item => (
              <div
                key={item.id}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${item.checked ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                onClick={() => toggleItem(item)}
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${item.checked ? 'bg-green-500 border-green-500' : 'border-slate-300'}`}>
                  {item.checked && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`text-sm ${item.checked ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                    {item.quantity != null && <span className="font-semibold">{formatQty(item.quantity)}{item.unit ? ` ${item.unit}` : ''} </span>}
                    {item.name}
                  </span>
                </div>
                {item.custom && (
                  <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">added</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Main Shopping List ────────────────────────────────────────────────────────

const ShoppingList = () => {
  const [weekStart, setWeekStart] = useState(() => toISODate(getMondayOfWeek(new Date())));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [expandedIngredients, setExpandedIngredients] = useState(new Set());
  const [activeTrip, setActiveTrip] = useState(null);
  const [checkingTrip, setCheckingTrip] = useState(true);
  const [savingTrip, setSavingTrip] = useState(false);

  // Check for active trip on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API_BASE_URL}/shopping-trips/active`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(trip => { if (trip && trip.id) setActiveTrip(trip); })
      .catch(() => {})
      .finally(() => setCheckingTrip(false));
  }, []);

  const fetchShoppingList = useCallback(async (start) => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/shopping-list?weekStart=${start}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed with status ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShoppingList(weekStart);
  }, [weekStart, fetchShoppingList]);

  const shiftWeek = (delta) => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(toISODate(d));
  };

  const groupedByDay = () => {
    if (!data) return {};
    return data.meals.reduce((acc, meal) => {
      if (!acc[meal.day]) acc[meal.day] = [];
      acc[meal.day].push(meal);
      return acc;
    }, {});
  };

  const getDailyCalories = (dayMeals) =>
    dayMeals.reduce((sum, m) => sum + m.calories, 0);

  const handleCopy = async () => {
    if (!data) return;
    const grouped = groupedByDay();
    const text = buildClipboardText(weekStart, grouped, data.totals);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard.');
    }
  };

  const handleSaveForShopping = async () => {
    if (!data?.ingredients?.length) return;
    setSavingTrip(true);
    try {
      const token = localStorage.getItem('token');
      const items = data.ingredients.map(ing => ({
        name: ing.name,
        quantity: ing.totalQuantity,
        unit: ing.unit || null,
      }));
      const res = await fetch(`${API_BASE_URL}/shopping-trips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: `Week of ${formatDisplayDate(weekStart)}`,
          weekStart,
          items,
        }),
      });
      if (res.ok) {
        const trip = await res.json();
        setActiveTrip(trip);
      }
    } catch { /* silent */ }
    finally { setSavingTrip(false); }
  };

  // Show active trip view if one exists and user is on it
  if (activeTrip) {
    return (
      <ActiveTripView
        trip={activeTrip}
        onBack={() => { setActiveTrip(null); }}
      />
    );
  }

  if (checkingTrip) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-7 bg-slate-200 rounded w-48" />
              <div className="h-4 bg-slate-200 rounded w-36" />
            </div>
            <div className="flex gap-2">
              <div className="h-10 w-10 bg-slate-200 rounded-lg" />
              <div className="h-10 w-10 bg-slate-200 rounded-lg" />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
            <div className="h-4 bg-slate-200 rounded w-32" />
            <div className="grid grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="text-center space-y-2">
                  <div className="h-6 bg-slate-200 rounded w-16 mx-auto" />
                  <div className="h-3 bg-slate-200 rounded w-10 mx-auto" />
                </div>
              ))}
            </div>
          </div>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div className="h-4 bg-slate-200 rounded w-40" />
                <div className="h-3 bg-slate-200 rounded w-16" />
              </div>
              <div className="divide-y divide-slate-50">
                {[...Array(2)].map((_, j) => (
                  <div key={j} className="flex items-center gap-3 px-4 py-3">
                    <div className="h-5 w-16 bg-slate-200 rounded-full" />
                    <div className="h-4 bg-slate-200 rounded w-3/4" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const mealsGrouped = groupedByDay();
  const hasMeals = data && data.meals.length > 0;
  const hasIngredients = data?.ingredients?.length > 0;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Shopping List</h1>
          {weekStart && (
            <p className="text-sm text-slate-500 mt-0.5">Week of {formatDisplayDate(weekStart)}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftWeek(-1)}
            aria-label="Previous week"
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
          >
            &#8592;
          </button>
          <button
            onClick={() => shiftWeek(1)}
            aria-label="Next week"
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
          >
            &#8594;
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center justify-between gap-4">
          <span>Unable to load your meal plan. Please check your connection and try again.</span>
          <button
            onClick={() => fetchShoppingList(weekStart)}
            className="shrink-0 px-3 py-1 text-xs font-medium bg-red-100 hover:bg-red-200 text-red-700 rounded-md transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="animate-pulse space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
            <div className="h-4 bg-slate-200 rounded w-32" />
            <div className="grid grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="text-center space-y-2">
                  <div className="h-6 bg-slate-200 rounded w-16 mx-auto" />
                  <div className="h-3 bg-slate-200 rounded w-10 mx-auto" />
                </div>
              ))}
            </div>
          </div>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div className="h-4 bg-slate-200 rounded w-40" />
                <div className="h-3 bg-slate-200 rounded w-16" />
              </div>
              <div className="divide-y divide-slate-50">
                {[...Array(2)].map((_, j) => (
                  <div key={j} className="flex items-center gap-3 px-4 py-3">
                    <div className="h-5 w-16 bg-slate-200 rounded-full" />
                    <div className="h-4 bg-slate-200 rounded w-3/4" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && data && (
        <>
          {/* Action buttons — top of page */}
          {hasMeals && (
            <div className="flex justify-end gap-3 mb-4">
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition-colors"
              >
                {copied ? 'Copied!' : 'Copy to clipboard'}
              </button>
              {hasIngredients && (
                <button
                  onClick={handleSaveForShopping}
                  disabled={savingTrip}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                  </svg>
                  {savingTrip ? 'Saving...' : 'Save for Shopping'}
                </button>
              )}
            </div>
          )}

          {/* Empty state */}
          {!hasMeals && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 flex flex-col items-center text-center">
              <svg
                className="w-12 h-12 text-slate-300 mb-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                />
              </svg>
              <h2 className="text-lg font-semibold text-slate-700 mb-2">No meals planned this week</h2>
              <p className="text-sm text-slate-500 max-w-xs mb-6">
                Head to the calendar to plan your meals and your shopping list will appear here automatically.
              </p>
              <Link
                to="/"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              >
                Go to Calendar
              </Link>
            </div>
          )}

          {/* Days */}
          {hasMeals && DAY_ORDER.map((day) => {
            const dayMeals = mealsGrouped[day];
            if (!dayMeals || dayMeals.length === 0) return null;
            const dailyCal = getDailyCalories(dayMeals);
            return (
              <div key={day} className="mb-4 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-700 text-sm">
                    {formatDayHeader(dayMeals[0].date)}
                  </h3>
                  <span className="text-xs text-slate-500">{dailyCal} kcal</span>
                </div>
                <ul className="divide-y divide-slate-50">
                  {dayMeals.map((meal, idx) => {
                    const badgeClass =
                      MEAL_TYPE_STYLES[meal.meal_type] || (meal.meal_type && meal.meal_type.startsWith('Snacks') ? MEAL_TYPE_STYLES['Snacks'] : 'bg-slate-100 text-slate-700');
                    return (
                      <li key={idx} className="flex items-start gap-3 px-4 py-3">
                        <span
                          className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${badgeClass}`}
                        >
                          {meal.meal_type.startsWith('Snacks-') ? 'Snack ' + meal.meal_type.split('-')[1] : meal.meal_type}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{meal.meal_name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {meal.calories} kcal &middot; P {meal.protein_g}g &middot; C {meal.carbs_g}g &middot; F {meal.fat_g}g
                            {meal.servings !== 1 && (
                              <span className="ml-1 text-slate-400">&times;{meal.servings}</span>
                            )}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {/* (Action buttons moved to top of page) */}

          {/* Ingredients section */}
          {hasIngredients && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Ingredients
              </h2>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-50">
                {data.ingredients.map((ing) => {
                  const key = `${ing.name}||${ing.unit}`;
                  const isExpanded = expandedIngredients.has(key);
                  return (
                    <div key={key}>
                      <div
                        className={`flex items-center gap-3 px-4 py-3 ${ing.multipleUses ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                        onClick={() => {
                          if (!ing.multipleUses) return;
                          setExpandedIngredients(prev => {
                            const next = new Set(prev);
                            if (next.has(key)) next.delete(key); else next.add(key);
                            return next;
                          });
                        }}
                      >
                        {ing.totalQuantity != null ? (
                          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">
                            {formatQty(ing.totalQuantity)}{ing.unit ? ` ${ing.unit}` : ''}
                          </span>
                        ) : (
                          <span className="inline-flex items-center bg-slate-50 text-slate-400 rounded-full px-2.5 py-0.5 text-xs whitespace-nowrap border border-slate-200">
                            qty TBC
                          </span>
                        )}
                        <span className="flex-1 text-sm text-slate-800">{ing.name}</span>
                        {ing.multipleUses && (
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            {ing.uses.length} uses
                            <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </span>
                        )}
                      </div>
                      {ing.multipleUses && isExpanded && (
                        <div className="bg-slate-50 px-4 pb-3 space-y-1.5">
                          {ing.uses.map((use, idx) => (
                            <p key={idx} className="text-xs text-slate-500 pl-2 border-l-2 border-slate-200">
                              {idx === 0 ? '' : 'leftover · '}
                              {use.scaledQuantity != null ? `${formatQty(use.scaledQuantity)}${use.unit ? ` ${use.unit}` : ''} ` : ''}for{' '}
                              <span className="font-medium">{use.recipe}</span>{' '}
                              ({use.day} {use.meal_type})
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ShoppingList;
