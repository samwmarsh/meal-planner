import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import API_BASE_URL from '../config';
import MealCalendar from './MealCalendar';

// ── Inline TDEE calc (mirrors ProfilePage logic) ───────────────────────────

function getCalorieTarget(profile, weightKg) {
  if (!profile || !weightKg || !profile.height_cm || !profile.date_of_birth || !profile.sex) return null;
  const dob = new Date(profile.date_of_birth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
  if (!age || age <= 0) return null;

  const bmr =
    profile.sex === 'male'
      ? 10 * weightKg + 6.25 * profile.height_cm - 5 * age + 5
      : 10 * weightKg + 6.25 * profile.height_cm - 5 * age - 161;

  const multipliers = {
    sedentary: 1.2,
    'lightly active': 1.375,
    'moderately active': 1.55,
    'very active': 1.725,
    athlete: 1.9,
  };
  const tdee = bmr * (multipliers[profile.activity_level] || 1.55);

  const goalAdj = {
    'lose fat': -500,
    maintain: 0,
    'build muscle': 500,
    'body recomposition': -200,
  };
  return Math.round(tdee + (goalAdj[profile.goal] || 0));
}

function getMacroTargets(profile, weightKg, calorieTarget) {
  if (!profile || !calorieTarget) return null;
  const proteinPct = parseFloat(profile.protein_pct) || 30;
  const carbsPct = parseFloat(profile.carbs_pct) || 40;
  const fatPct = parseFloat(profile.fat_pct) || 30;
  // Protein fixed at 2.0 g/kg if weight available, else macro-split approach
  const proteinG = weightKg ? Math.round(weightKg * 2.0) : Math.round((calorieTarget * (proteinPct / 100)) / 4);
  const carbsG = Math.round((calorieTarget * (carbsPct / 100)) / 4);
  const fatG = Math.round((calorieTarget * (fatPct / 100)) / 9);
  return { proteinG, carbsG, fatG };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function dateToKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDayLabel(date) {
  return date.toLocaleDateString('default', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

// A single progress bar (value / max, clamped to 100%)
function MacroBar({ value, max, colorClass }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Dashboard component ────────────────────────────────────────────────────

const Dashboard = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dateToKey(today);

  const [todayTotals, setTodayTotals] = useState(null); // { calories, protein_g, carbs_g, fat_g }
  const [calorieTarget, setCalorieTarget] = useState(null);
  const [macroTargets, setMacroTargets] = useState(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }

    const headers = { Authorization: `Bearer ${token}` };
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');

    Promise.all([
      fetch(`${API_BASE_URL}/meal-plans?year=${year}&month=${month}`, { headers }).then(r => r.json()),
      fetch(`${API_BASE_URL}/profile`, { headers }).then(r => r.json()),
    ])
      .then(([mealPlans, profile]) => {
        // ── Compute today's totals from meal plan data ──
        const todayPlans = Array.isArray(mealPlans)
          ? mealPlans.filter(p => p.date && p.date.slice(0, 10) === todayKey && p.meal_id)
          : [];

        if (todayPlans.length > 0) {
          const totals = todayPlans.reduce(
            (acc, p) => ({
              calories: acc.calories + (Number(p.calories) || 0),
              protein_g: parseFloat((acc.protein_g + (parseFloat(p.protein_g) || 0)).toFixed(1)),
              carbs_g: parseFloat((acc.carbs_g + (parseFloat(p.carbs_g) || 0)).toFixed(1)),
              fat_g: parseFloat((acc.fat_g + (parseFloat(p.fat_g) || 0)).toFixed(1)),
            }),
            { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
          );
          setTodayTotals(totals);
        }

        // ── Compute targets from profile ──
        if (profile && !profile.error) {
          setHasProfile(true);
          const weightKg = profile.latest_weight_kg ?? null;
          const calTarget = getCalorieTarget(profile, weightKg);
          setCalorieTarget(calTarget);
          if (calTarget) {
            setMacroTargets(getMacroTargets(profile, weightKg, calTarget));
          }
        }
      })
      .catch(() => {/* silent — banner just won't render */})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only show the banner if today has any meals logged
  const showBanner = !loading && todayTotals !== null;

  // Calorie progress %
  const calPct = calorieTarget && todayTotals
    ? Math.min(100, Math.round((todayTotals.calories / calorieTarget) * 100))
    : 0;

  return (
    <div>
      {/* ── Today's Summary Banner ── */}
      {showBanner && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Blue gradient accent strip */}
          <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-indigo-500" />

          <div className="px-5 py-4">
            {/* Header row */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-base font-bold text-slate-800 leading-tight">
                  Today
                  <span className="font-normal text-slate-500 ml-2 text-sm">{formatDayLabel(today)}</span>
                </h2>
              </div>
              {calorieTarget && (
                <span className="shrink-0 text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2.5 py-1">
                  {calorieTarget.toLocaleString()} kcal target
                </span>
              )}
            </div>

            {/* Main calorie progress bar */}
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium text-slate-700">
                {todayTotals.calories.toLocaleString()} kcal
                {calorieTarget && (
                  <span className="text-slate-400 font-normal"> / {calorieTarget.toLocaleString()}</span>
                )}
              </span>
              {calorieTarget && (
                <span className={`font-semibold ${calPct >= 100 ? 'text-rose-600' : 'text-blue-600'}`}>
                  {calPct}%
                </span>
              )}
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden mb-4">
              <div
                className={`h-full rounded-full transition-all duration-500 ${calPct >= 100 ? 'bg-rose-500' : 'bg-blue-500'}`}
                style={{ width: calorieTarget ? `${calPct}%` : '100%' }}
              />
            </div>

            {/* Macro mini-bars */}
            <div className="grid grid-cols-3 gap-4">
              {/* Protein */}
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs font-semibold text-blue-600">Protein</span>
                  <span className="text-xs text-slate-500">
                    {todayTotals.protein_g}g
                    {macroTargets && <span className="text-slate-400">/{macroTargets.proteinG}g</span>}
                  </span>
                </div>
                <MacroBar
                  value={todayTotals.protein_g}
                  max={macroTargets ? macroTargets.proteinG : todayTotals.protein_g}
                  colorClass="bg-blue-500"
                />
              </div>

              {/* Carbs */}
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs font-semibold text-amber-600">Carbs</span>
                  <span className="text-xs text-slate-500">
                    {todayTotals.carbs_g}g
                    {macroTargets && <span className="text-slate-400">/{macroTargets.carbsG}g</span>}
                  </span>
                </div>
                <MacroBar
                  value={todayTotals.carbs_g}
                  max={macroTargets ? macroTargets.carbsG : todayTotals.carbs_g}
                  colorClass="bg-amber-400"
                />
              </div>

              {/* Fat */}
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs font-semibold text-rose-600">Fat</span>
                  <span className="text-xs text-slate-500">
                    {todayTotals.fat_g}g
                    {macroTargets && <span className="text-slate-400">/{macroTargets.fatG}g</span>}
                  </span>
                </div>
                <MacroBar
                  value={todayTotals.fat_g}
                  max={macroTargets ? macroTargets.fatG : todayTotals.fat_g}
                  colorClass="bg-rose-500"
                />
              </div>
            </div>

            {/* "Set up goals" nudge — only if logged in with profile but no targets computed */}
            {hasProfile && !calorieTarget && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <Link
                  to="/profile"
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Set up your goals to see targets &rarr;
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Full Calendar ── */}
      <MealCalendar />
    </div>
  );
};

export default Dashboard;
