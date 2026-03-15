import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, PieChart, Pie, Cell, Legend,
} from 'recharts';
import API_BASE_URL from '../config';

const RANGES = [
  { label: '30d', days: 30 },
  { label: '60d', days: 60 },
  { label: '90d', days: 90 },
  { label: 'All', days: null },
];

function kgToLbs(kg) { return +(kg * 2.2046).toFixed(1); }
function kgToStLbs(kg) {
  const totalLbs = kg * 2.2046;
  const st = Math.floor(totalLbs / 14);
  const lbs = +((totalLbs % 14).toFixed(1));
  return `${st} st ${lbs} lbs`;
}

function formatWeight(kg, unit) {
  const n = parseFloat(kg);
  if (unit === 'lbs') return `${kgToLbs(n)} lbs`;
  if (unit === 'st+lbs') return kgToStLbs(n);
  return `${parseFloat(n.toFixed(2))} kg`;
}

function displayValue(kg, unit) {
  const n = parseFloat(kg);
  if (unit === 'lbs') return kgToLbs(n);
  return parseFloat(n.toFixed(2));
}

function unitLabel(unit) {
  if (unit === 'lbs') return 'lbs';
  if (unit === 'st+lbs') return 'kg'; // chart Y-axis uses kg for st+lbs since numeric axis
  return 'kg';
}

// ── TDEE / macro target helpers (mirrors Dashboard logic) ──────────────────

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

// ── Helper: get all year-month pairs between two dates ─────────────────────

function getMonthsBetween(fromStr, toStr) {
  const months = [];
  const [fy, fm] = fromStr.split('-').map(Number);
  const [ty, tm] = toStr.split('-').map(Number);
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    months.push({ year: y, month: m });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return months;
}

const ProgressCharts = () => {
  const [range, setRange] = useState(RANGES[1]); // default 60d
  const [weightUnit, setWeightUnit] = useState(() => localStorage.getItem('weightUnit') || 'kg');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mealPlans, setMealPlans] = useState([]); // raw meal plan rows
  const [loadingMeals, setLoadingMeals] = useState(true);
  const [calorieTarget, setCalorieTarget] = useState(null);
  const [macroTargets, setMacroTargets] = useState(null);

  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const fromDate = range.days
    ? new Date(Date.now() - range.days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : '2000-01-01';

  // Fetch daily logs
  const fetchLogs = useCallback(() => {
    const token = localStorage.getItem('token');
    setLoading(true);
    fetch(`${API_BASE_URL}/logs/daily?from=${fromDate}&to=${today}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        setLogs(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [today, fromDate]);

  // Fetch meal plans for the date range (may span multiple months)
  const fetchMealPlans = useCallback(() => {
    const token = localStorage.getItem('token');
    const months = getMonthsBetween(fromDate, today);
    setLoadingMeals(true);
    Promise.all(
      months.map(({ year, month }) =>
        fetch(`${API_BASE_URL}/meal-plans?year=${year}&month=${month}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json())
      )
    )
      .then(results => {
        const all = results.flat().filter(Boolean);
        // Filter to only rows within the actual date range
        const filtered = (Array.isArray(all) ? all : []).filter(p => {
          const d = typeof p.date === 'string' ? p.date.slice(0, 10) : '';
          return d >= fromDate && d <= today;
        });
        setMealPlans(filtered);
        setLoadingMeals(false);
      })
      .catch(() => { setMealPlans([]); setLoadingMeals(false); });
  }, [today, fromDate]);

  // Fetch profile for calorie/macro targets
  const fetchProfile = useCallback(() => {
    const token = localStorage.getItem('token');
    Promise.all([
      fetch(`${API_BASE_URL}/profile`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`${API_BASE_URL}/logs/daily?from=${today}&to=${today}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ])
      .then(([profile, todayLogs]) => {
        // Use latest weight from logs or profile
        const latestLog = Array.isArray(todayLogs) ? todayLogs.find(l => l.weight_kg) : null;
        const weightKg = latestLog ? parseFloat(latestLog.weight_kg) : (profile.weight_kg ? parseFloat(profile.weight_kg) : null);
        const calTarget = getCalorieTarget(profile, weightKg);
        setCalorieTarget(calTarget);
        if (calTarget) setMacroTargets(getMacroTargets(profile, weightKg, calTarget));
      })
      .catch(() => {});
  }, [today]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { fetchMealPlans(); }, [fetchMealPlans]);
  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  // ── Weight chart data ────────────────────────────────────────────────────

  const weightLogs = logs
    .filter(l => l.weight_kg != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  const useKgForAxis = weightUnit === 'st+lbs';
  const chartData = weightLogs.map(l => {
    const dateStr = typeof l.date === 'string' ? l.date.slice(0, 10) : l.date;
    return {
      date: dateStr,
      label: new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      weight: useKgForAxis ? parseFloat(parseFloat(l.weight_kg).toFixed(2)) : displayValue(l.weight_kg, weightUnit),
      raw_kg: l.weight_kg,
    };
  });

  const weights = chartData.map(d => d.weight);
  const minW = weights.length ? Math.floor(Math.min(...weights) - 1) : 0;
  const maxW = weights.length ? Math.ceil(Math.max(...weights) + 1) : 100;

  const first = weightLogs.length > 0 ? parseFloat(weightLogs[0].weight_kg) : null;
  const last = weightLogs.length > 0 ? parseFloat(weightLogs[weightLogs.length - 1].weight_kg) : null;
  const change = first != null && last != null ? last - first : null;

  // ── Calorie & macro chart data (aggregate meal plans per day) ────────────

  const dailyNutrition = (() => {
    const byDay = {};
    for (const p of mealPlans) {
      const d = typeof p.date === 'string' ? p.date.slice(0, 10) : '';
      if (!d) continue;
      if (!byDay[d]) byDay[d] = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
      byDay[d].calories += Number(p.calories) || 0;
      byDay[d].protein_g += Number(p.protein_g) || 0;
      byDay[d].carbs_g += Number(p.carbs_g) || 0;
      byDay[d].fat_g += Number(p.fat_g) || 0;
    }
    return Object.entries(byDay)
      .map(([date, totals]) => ({
        date,
        label: new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        calories: Math.round(totals.calories),
        protein: Math.round(totals.protein_g),
        carbs: Math.round(totals.carbs_g),
        fat: Math.round(totals.fat_g),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  })();

  // Add target line to calorie data
  const calorieChartData = dailyNutrition.map(d => ({
    ...d,
    target: calorieTarget || null,
  }));

  // Calorie Y-axis domain
  const calValues = dailyNutrition.map(d => d.calories);
  const maxCal = calValues.length ? Math.max(...calValues, calorieTarget || 0) : 3000;
  const calDomainMax = Math.ceil((maxCal + 100) / 100) * 100;

  // Weekly macro totals for pie chart (last 7 days with data)
  const last7 = dailyNutrition.slice(-7);
  const weeklyMacros = last7.reduce(
    (acc, d) => ({
      protein: acc.protein + d.protein,
      carbs: acc.carbs + d.carbs,
      fat: acc.fat + d.fat,
    }),
    { protein: 0, carbs: 0, fat: 0 }
  );
  const totalMacroG = weeklyMacros.protein + weeklyMacros.carbs + weeklyMacros.fat;
  const pieData = totalMacroG > 0 ? [
    { name: 'Protein', value: weeklyMacros.protein, color: '#3b82f6' },
    { name: 'Carbs', value: weeklyMacros.carbs, color: '#f59e0b' },
    { name: 'Fat', value: weeklyMacros.fat, color: '#f43f5e' },
  ] : [];

  // Calorie stats
  const avgCal = dailyNutrition.length
    ? Math.round(dailyNutrition.reduce((s, d) => s + d.calories, 0) / dailyNutrition.length)
    : null;

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 px-6 py-7 text-white shadow-lg">
        <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
        <p className="text-indigo-100 text-sm mt-0.5">Track your trends over time.</p>
      </div>

      {/* Range selector (shared) */}
      <div className="flex justify-end">
        <div className="flex gap-1">
          {RANGES.map(r => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer ${
                range.label === r.label ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-indigo-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Weight trend chart */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Weight Trend</h2>
            {change != null && (
              <p className="text-xs text-slate-400 mt-0.5">
                {change > 0 ? '+' : ''}{formatWeight(Math.abs(change), weightUnit === 'st+lbs' ? 'kg' : weightUnit)} over this period
                {change > 0 ? ' gained' : change < 0 ? ' lost' : ''}
              </p>
            )}
          </div>
          <div className="flex gap-1">
            {['kg', 'lbs', 'st+lbs'].map(u => (
              <button
                key={u}
                type="button"
                onClick={() => { setWeightUnit(u); localStorage.setItem('weightUnit', u); }}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer ${
                  weightUnit === u ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-blue-50'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-6 animate-pulse space-y-4">
            <div className="flex items-end gap-3 h-64">
              {[40, 55, 45, 60, 50, 65, 55, 70, 60, 50, 65, 58].map((h, i) => (
                <div key={i} className="flex-1 bg-slate-200 rounded-t" style={{ height: `${h}%` }} />
              ))}
            </div>
            <div className="flex justify-between">
              <div className="h-3 bg-slate-200 rounded w-12" />
              <div className="h-3 bg-slate-200 rounded w-12" />
              <div className="h-3 bg-slate-200 rounded w-12" />
            </div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-slate-500">No weight data yet.</p>
            <p className="text-xs text-slate-400 mt-1">Log your weight on the Daily Log page to see trends here.</p>
          </div>
        ) : (
          <div className="px-4 py-6">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[minW, maxW]}
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  unit={` ${useKgForAxis ? 'kg' : unitLabel(weightUnit)}`}
                  width={70}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm">
                        <p className="text-slate-500 text-xs">{d.date}</p>
                        <p className="font-semibold text-slate-800">{formatWeight(d.raw_kg, weightUnit)}</p>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Summary stats */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Latest</p>
            <p className="text-lg font-bold text-slate-800">{formatWeight(last, weightUnit)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Start</p>
            <p className="text-lg font-bold text-slate-800">{formatWeight(first, weightUnit)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Change</p>
            <p className={`text-lg font-bold ${change < 0 ? 'text-green-600' : change > 0 ? 'text-red-500' : 'text-slate-800'}`}>
              {change > 0 ? '+' : ''}{formatWeight(Math.abs(change), weightUnit === 'st+lbs' ? 'kg' : weightUnit)}
            </p>
          </div>
        </div>
      )}

      {/* Calorie Intake chart */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Calorie Intake</h2>
            {avgCal != null && (
              <p className="text-xs text-slate-400 mt-0.5">
                Avg {avgCal.toLocaleString()} kcal/day
                {calorieTarget && ` \u00b7 Target ${calorieTarget.toLocaleString()} kcal`}
              </p>
            )}
          </div>
        </div>

        {loadingMeals ? (
          <div className="px-6 py-6 animate-pulse space-y-4">
            <div className="flex items-end gap-3 h-64">
              {[35, 60, 45, 70, 55, 40, 65, 50, 75, 55, 45, 60].map((h, i) => (
                <div key={i} className="flex-1 bg-slate-200 rounded-t" style={{ height: `${h}%` }} />
              ))}
            </div>
            <div className="flex justify-between">
              <div className="h-3 bg-slate-200 rounded w-12" />
              <div className="h-3 bg-slate-200 rounded w-12" />
              <div className="h-3 bg-slate-200 rounded w-12" />
            </div>
          </div>
        ) : dailyNutrition.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-slate-500">No meal plan data yet.</p>
            <p className="text-xs text-slate-400 mt-1">Add meals to your calendar to see calorie trends here.</p>
          </div>
        ) : (
          <div className="px-4 py-6">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={calorieChartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, calDomainMax]}
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  unit=" kcal"
                  width={80}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm">
                        <p className="text-slate-500 text-xs">{d.date}</p>
                        <p className="font-semibold text-amber-600">{d.calories.toLocaleString()} kcal</p>
                        {calorieTarget && (
                          <p className="text-xs text-slate-400">Target: {calorieTarget.toLocaleString()} kcal</p>
                        )}
                      </div>
                    );
                  }}
                />
                {calorieTarget && (
                  <Line
                    type="monotone"
                    dataKey="target"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    dot={{ r: 2, fill: '#94a3b8', strokeWidth: 0 }}
                    activeDot={false}
                    name="Target"
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="calories"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#f59e0b', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }}
                  name="Actual"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Weekly Macro Split (pie chart) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Weekly Macro Split</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Protein, carbs, and fat from the last 7 days with data
            {macroTargets && ` · Targets: P ${macroTargets.proteinG}g · C ${macroTargets.carbsG}g · F ${macroTargets.fatG}g`}
          </p>
        </div>

        {loadingMeals ? (
          <div className="px-6 py-6 flex justify-center">
            <div className="w-48 h-48 rounded-full bg-slate-200 animate-pulse" />
          </div>
        ) : pieData.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-slate-500">No meal plan data yet.</p>
            <p className="text-xs text-slate-400 mt-1">Add meals to your calendar to see your macro split.</p>
          </div>
        ) : (
          <div className="px-4 py-6">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const d = payload[0].payload;
                      const pct = totalMacroG > 0 ? Math.round((d.value / totalMacroG) * 100) : 0;
                      const cals = d.name === 'Protein' ? d.value * 4 : d.name === 'Carbs' ? d.value * 4 : d.value * 9;
                      return (
                        <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm">
                          <p className="font-semibold" style={{ color: d.color }}>{d.name}</p>
                          <p className="text-slate-600">{d.value}g ({pct}%)</p>
                          <p className="text-slate-400 text-xs">{Math.round(cals)} kcal</p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Summary stats */}
              <div className="space-y-3 min-w-48">
                {pieData.map(d => {
                  const pct = totalMacroG > 0 ? Math.round((d.value / totalMacroG) * 100) : 0;
                  const target = macroTargets
                    ? (d.name === 'Protein' ? macroTargets.proteinG * last7.length : d.name === 'Carbs' ? macroTargets.carbsG * last7.length : macroTargets.fatG * last7.length)
                    : null;
                  return (
                    <div key={d.name} className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <div className="flex-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-slate-700">{d.name}</span>
                          <span className="text-slate-600">{d.value}g <span className="text-slate-400">({pct}%)</span></span>
                        </div>
                        {target && (
                          <div className="w-full h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${Math.min(100, Math.round((d.value / target) * 100))}%`, backgroundColor: d.color }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 border-t border-slate-100 text-xs text-slate-400">
                  Total: {totalMacroG}g over {last7.length} day{last7.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProgressCharts;
