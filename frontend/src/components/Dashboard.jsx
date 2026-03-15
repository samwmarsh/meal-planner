import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API_BASE_URL from '../config';

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

/** Get Monday of the week containing `date` */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function MacroBar({ value, max, colorClass }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Weight unit converters ────────────────────────────────────────────────

function kgToLbs(n) { return +(n * 2.2046).toFixed(1); }
function kgToStLbs(n) {
  const totalLbs = n * 2.2046;
  const st = Math.floor(totalLbs / 14);
  const lbs = +((totalLbs % 14).toFixed(1));
  return { st, lbs };
}
function formatWeight(kg, unit) {
  if (unit === 'lbs') return `${kgToLbs(kg)} lbs`;
  if (unit === 'st+lbs') { const { st, lbs } = kgToStLbs(kg); return `${st} st ${lbs} lbs`; }
  return `${kg} kg`;
}
function formatWeightChange(changeKg, unit) {
  const sign = changeKg > 0 ? '+' : '';
  if (unit === 'lbs') return `${sign}${kgToLbs(changeKg)} lbs`;
  if (unit === 'st+lbs') return `${sign}${kgToLbs(changeKg)} lbs`;
  return `${sign}${changeKg} kg`;
}

const DIETARY_LABELS = {
  pcos: 'PCOS-friendly',
  keto: 'Keto',
  low_carb: 'Low Carb',
  high_protein: 'High Protein',
  vegan: 'Vegan',
  diabetic: 'Diabetic-friendly',
};

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
const isSnackType = (type) => type === 'Snacks' || type.startsWith('Snacks-');
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Dashboard component ────────────────────────────────────────────────────

const Dashboard = () => {
  const navigate = useNavigate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dateToKey(today);

  const [todayTotals, setTodayTotals] = useState(null);
  const [calorieTarget, setCalorieTarget] = useState(null);
  const [macroTargets, setMacroTargets] = useState(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [weekData, setWeekData] = useState(null); // { filledSlots, totalSlots, days: [{date, key, filled: {Breakfast:bool,...}}] }
  const [weightData, setWeightData] = useState(null); // { latest, previous, change }
  const [activeTrip, setActiveTrip] = useState(null); // { name, totalItems, checkedItems }
  const [dietaryRequirement, setDietaryRequirement] = useState(null);
  const [weightUnit, setWeightUnit] = useState(() => localStorage.getItem('weightUnit') || 'kg');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }

    const headers = { Authorization: `Bearer ${token}` };
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');

    // We need the current week's range for meal plan filtering
    const weekStart = getWeekStart(today);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Fetch 30 days of weight logs to find latest + previous week
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const logFrom = dateToKey(thirtyDaysAgo);
    const logTo = dateToKey(today);

    Promise.all([
      fetch(`${API_BASE_URL}/meal-plans?year=${year}&month=${month}`, { headers }).then(r => r.json()),
      fetch(`${API_BASE_URL}/profile`, { headers }).then(r => r.json()),
      fetch(`${API_BASE_URL}/logs/daily?from=${logFrom}&to=${logTo}`, { headers }).then(r => r.json()),
      fetch(`${API_BASE_URL}/shopping-trips/active`, { headers }).then(r => r.json()),
    ])
      .then(([mealPlans, profile, logs, trip]) => {
        const plans = Array.isArray(mealPlans) ? mealPlans : [];

        // ── Today's nutrition totals ──
        const todayPlans = plans.filter(p => p.date && p.date.slice(0, 10) === todayKey && (p.meal_id || p.recipe_id));
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

        // ── Profile & targets ──
        if (profile && !profile.error) {
          setHasProfile(true);
          if (profile.weight_unit) {
            setWeightUnit(profile.weight_unit);
            localStorage.setItem('weightUnit', profile.weight_unit);
          }
          if (profile.dietary_requirement) {
            setDietaryRequirement(profile.dietary_requirement);
          }
          const weightKg = profile.latest_weight_kg ?? null;
          const calTarget = getCalorieTarget(profile, weightKg);
          setCalorieTarget(calTarget);
          if (calTarget) {
            setMacroTargets(getMacroTargets(profile, weightKg, calTarget));
          }
        }

        // ── Week at a glance ──
        const days = [];
        let filledSlots = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date(weekStart);
          d.setDate(d.getDate() + i);
          const key = dateToKey(d);
          const dayPlans = plans.filter(p => p.date && p.date.slice(0, 10) === key && (p.meal_id || p.recipe_id));
          const filled = {};
          MEAL_TYPES.forEach(mt => {
            const has = mt === 'Snacks'
              ? dayPlans.some(p => isSnackType(p.meal_type))
              : dayPlans.some(p => p.meal_type === mt);
            filled[mt] = has;
            if (has) filledSlots++;
          });
          days.push({ date: d, key, filled });
        }
        setWeekData({ filledSlots, totalSlots: 28, days });

        // ── Weight trend ──
        const weightLogs = Array.isArray(logs) ? logs.filter(l => l.weight_kg != null) : [];
        if (weightLogs.length > 0) {
          // logs come back DESC by date
          const latest = weightLogs[0];
          // Find a log from ~7 days ago
          const sevenDaysAgo = new Date(today);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const sevenKey = dateToKey(sevenDaysAgo);
          // Find closest log to 7 days ago
          let previous = null;
          for (const log of weightLogs) {
            const logDate = typeof log.date === 'string' ? log.date.slice(0, 10) : log.date;
            if (logDate <= sevenKey) {
              previous = log;
              break;
            }
          }
          const change = previous ? parseFloat((latest.weight_kg - previous.weight_kg).toFixed(1)) : null;
          setWeightData({
            latest: parseFloat(latest.weight_kg),
            latestDate: typeof latest.date === 'string' ? latest.date.slice(0, 10) : latest.date,
            change,
          });
        }

        // ── Active shopping trip ──
        if (trip && trip.id) {
          const items = trip.items || [];
          setActiveTrip({
            name: trip.name || 'Shopping Trip',
            totalItems: items.length,
            checkedItems: items.filter(i => i.checked).length,
          });
        }
      })
      .catch(() => {/* silent */})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const calPctRaw = calorieTarget && todayTotals
    ? Math.round((todayTotals.calories / calorieTarget) * 100)
    : 0;
  const calPct = Math.min(100, calPctRaw); // capped for bar width

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Page heading */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h1>
          {dietaryRequirement && DIETARY_LABELS[dietaryRequirement] && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2.5 py-0.5">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714a2.25 2.25 0 0 0 .659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5a2.25 2.25 0 0 1 0 3l-3.5 3.5a2.25 2.25 0 0 1-3 0L5 14.5a2.25 2.25 0 0 1 0-3" />
              </svg>
              {DIETARY_LABELS[dietaryRequirement]}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{formatDayLabel(today)}</p>
      </div>

      {/* Widget grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* ─── Today's Nutrition ─── */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-indigo-500" />
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 uppercase tracking-wide">Today's Nutrition</h2>
              {calorieTarget && (
                <span className="text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2.5 py-0.5">
                  {calorieTarget.toLocaleString()} kcal target
                </span>
              )}
            </div>

            {todayTotals ? (
              <>
                {/* Calorie bar */}
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {todayTotals.calories.toLocaleString()} kcal
                    {calorieTarget && (
                      <span className="text-slate-400 font-normal"> / {calorieTarget.toLocaleString()}</span>
                    )}
                  </span>
                  {calorieTarget && (
                    <span className={`font-semibold ${calPctRaw >= 100 ? 'text-rose-600' : 'text-blue-600'}`}>
                      {calPctRaw}%
                    </span>
                  )}
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden mb-4">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${calPctRaw >= 100 ? 'bg-rose-500' : 'bg-blue-500'}`}
                    style={{ width: calorieTarget ? `${calPct}%` : '100%' }}
                  />
                </div>

                {/* Macro bars */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-xs font-semibold text-blue-600">Protein</span>
                      <span className="text-xs text-slate-500">
                        {todayTotals.protein_g}g
                        {macroTargets && <span className="text-slate-400">/{macroTargets.proteinG}g</span>}
                      </span>
                    </div>
                    <MacroBar value={todayTotals.protein_g} max={macroTargets ? macroTargets.proteinG : todayTotals.protein_g} colorClass="bg-blue-500" />
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-xs font-semibold text-amber-600">Carbs</span>
                      <span className="text-xs text-slate-500">
                        {todayTotals.carbs_g}g
                        {macroTargets && <span className="text-slate-400">/{macroTargets.carbsG}g</span>}
                      </span>
                    </div>
                    <MacroBar value={todayTotals.carbs_g} max={macroTargets ? macroTargets.carbsG : todayTotals.carbs_g} colorClass="bg-amber-400" />
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-xs font-semibold text-rose-600">Fat</span>
                      <span className="text-xs text-slate-500">
                        {todayTotals.fat_g}g
                        {macroTargets && <span className="text-slate-400">/{macroTargets.fatG}g</span>}
                      </span>
                    </div>
                    <MacroBar value={todayTotals.fat_g} max={macroTargets ? macroTargets.fatG : todayTotals.fat_g} colorClass="bg-rose-500" />
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400 py-4 text-center">No meals planned for today yet.</p>
            )}

            {hasProfile && !calorieTarget && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <Link to="/profile" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  Set up your goals to see targets &rarr;
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ─── This Week at a Glance ─── */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-500" />
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 uppercase tracking-wide">This Week</h2>
              {weekData && (
                <span className="text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2.5 py-0.5">
                  {weekData.filledSlots} / {weekData.totalSlots} meals
                </span>
              )}
            </div>

            {weekData ? (
              <div className="space-y-2">
                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${Math.round((weekData.filledSlots / weekData.totalSlots) * 100)}%` }}
                  />
                </div>

                {/* Day grid */}
                <div className="grid grid-cols-7 gap-1.5">
                  {weekData.days.map((day, i) => {
                    const isToday = day.key === todayKey;
                    const filledCount = MEAL_TYPES.filter(mt => day.filled[mt]).length;
                    return (
                      <button
                        key={day.key}
                        onClick={() => navigate('/calendar')}
                        className={`flex flex-col items-center rounded-lg py-2 px-1 transition-colors cursor-pointer border
                          ${isToday
                            ? 'bg-emerald-50 border-emerald-300'
                            : 'bg-slate-50 border-transparent hover:bg-slate-100'
                          }`}
                      >
                        <span className={`text-xs font-semibold mb-1.5 ${isToday ? 'text-emerald-700' : 'text-slate-600'}`}>
                          {DAY_LABELS[i]}
                        </span>
                        <div className="flex flex-col gap-0.5">
                          {MEAL_TYPES.map(mt => (
                            <div
                              key={mt}
                              className={`w-2 h-2 rounded-full ${day.filled[mt] ? 'bg-emerald-500' : 'bg-slate-200'}`}
                              title={mt}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1">{filledCount}/4</span>
                      </button>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">Meals:</span>
                  {MEAL_TYPES.map(mt => (
                    <span key={mt} className="text-[10px] text-slate-500">{mt.charAt(0)}</span>
                  ))}
                  <Link to="/calendar" className="ml-auto text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                    Full calendar &rarr;
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 py-4 text-center">Loading week data...</p>
            )}
          </div>
        </div>

        {/* ─── Recent Weight ─── */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-purple-500" />
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 uppercase tracking-wide">Recent Weight</h2>
              <Link to="/log" className="text-xs text-violet-600 hover:text-violet-700 font-medium">
                Log &rarr;
              </Link>
            </div>

            {weightData ? (
              <div className="flex items-end gap-4">
                <div>
                  <span className="text-3xl font-bold text-slate-800 dark:text-slate-100">{formatWeight(weightData.latest, weightUnit)}</span>
                </div>
                {weightData.change !== null && (
                  <div className={`flex items-center gap-1 mb-1 px-2 py-0.5 rounded-full text-xs font-semibold
                    ${weightData.change > 0
                      ? 'bg-rose-50 text-rose-600'
                      : weightData.change < 0
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-slate-50 text-slate-500'
                    }`}
                  >
                    {weightData.change > 0 ? (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" /></svg>
                    ) : weightData.change < 0 ? (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" /></svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>
                    )}
                    <span>{formatWeightChange(weightData.change, weightUnit)}</span>
                    <span className="text-[10px] font-normal opacity-70 ml-0.5">vs last week</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="text-sm text-slate-400 mb-2">No weight logged yet.</p>
                <Link to="/log" className="text-xs text-violet-600 hover:text-violet-700 font-medium">
                  Log your first weigh-in &rarr;
                </Link>
              </div>
            )}

            {weightData && (
              <p className="text-[10px] text-slate-400 mt-2">Last logged: {weightData.latestDate}</p>
            )}
          </div>
        </div>

        {/* ─── Active Shopping Trip ─── */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-orange-400 to-amber-500" />
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 uppercase tracking-wide">Shopping Trip</h2>
              <Link to="/shopping-list" className="text-xs text-amber-600 hover:text-amber-700 font-medium">
                View &rarr;
              </Link>
            </div>

            {activeTrip ? (
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">{activeTrip.name}</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-500"
                      style={{ width: activeTrip.totalItems > 0 ? `${Math.round((activeTrip.checkedItems / activeTrip.totalItems) * 100)}%` : '0%' }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-600 shrink-0">
                    {activeTrip.checkedItems} / {activeTrip.totalItems} items
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="text-sm text-slate-400 mb-2">No active shopping trip.</p>
                <Link to="/shopping-list" className="text-xs text-amber-600 hover:text-amber-700 font-medium">
                  Start a shopping trip &rarr;
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ─── Quick Actions ─── full width */}
        <div className="md:col-span-2 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-slate-400 to-slate-500" />
          <div className="px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 uppercase tracking-wide mb-3">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Link
                to="/calendar"
                className="flex flex-col items-center gap-2 px-4 py-3 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors text-center"
              >
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                <span className="text-xs font-medium text-blue-700">Plan Today</span>
              </Link>
              <Link
                to="/recipes"
                className="flex flex-col items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors text-center"
              >
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
                <span className="text-xs font-medium text-emerald-700">Browse Recipes</span>
              </Link>
              <Link
                to="/log"
                className="flex flex-col items-center gap-2 px-4 py-3 rounded-lg bg-violet-50 hover:bg-violet-100 border border-violet-200 transition-colors text-center"
              >
                <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" /></svg>
                <span className="text-xs font-medium text-violet-700">Log Weight</span>
              </Link>
              <Link
                to="/shopping-list"
                className="flex flex-col items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors text-center"
              >
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121 0 2.002-.936 1.834-2.042L18.752 4.622A1.5 1.5 0 0017.269 3.5H6.293a1.5 1.5 0 00-1.483 1.277L3.707 14.25" /></svg>
                <span className="text-xs font-medium text-amber-700">Shopping List</span>
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
