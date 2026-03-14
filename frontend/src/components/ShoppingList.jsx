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

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun, 1 = Mon ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function toISODate(date) {
  // Use local date parts to avoid UTC-offset day shifts
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
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(2)));
}

const ShoppingList = () => {
  const [weekStart, setWeekStart] = useState(() => toISODate(getMondayOfWeek(new Date())));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [expandedIngredients, setExpandedIngredients] = useState(new Set());

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

  const mealsGrouped = groupedByDay();
  const hasMeals = data && data.meals.length > 0;

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
        <div className="text-center py-12 text-slate-500 text-sm">Loading…</div>
      )}

      {!loading && data && (
        <>
          {/* Weekly macro summary card — only when there are meals */}
          {hasMeals && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Weekly Totals
              </h2>
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center">
                  <p className="text-xl font-bold text-slate-800">{data.totals.calories}</p>
                  <p className="text-xs text-slate-500">kcal</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-blue-600">{data.totals.protein_g}g</p>
                  <p className="text-xs text-slate-500">Protein</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-amber-600">{data.totals.carbs_g}g</p>
                  <p className="text-xs text-slate-500">Carbs</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-red-500">{data.totals.fat_g}g</p>
                  <p className="text-xs text-slate-500">Fat</p>
                </div>
              </div>
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
                aria-hidden="true"
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
                      MEAL_TYPE_STYLES[meal.meal_type] || 'bg-slate-100 text-slate-700';
                    return (
                      <li key={idx} className="flex items-start gap-3 px-4 py-3">
                        <span
                          className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${badgeClass}`}
                        >
                          {meal.meal_type}
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

          {/* Copy to clipboard — only when there are meals */}
          {hasMeals && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              >
                {copied ? 'Copied!' : 'Copy to clipboard'}
              </button>
            </div>
          )}

          {/* Ingredients section — only for recipe-based meals */}
          {data.ingredients && data.ingredients.length > 0 && (
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
