import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../config';

// ── BMR/TDEE helpers (copied from ProfilePage) ────────────────────────────────
const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2, 'lightly active': 1.375, 'moderately active': 1.55,
  'very active': 1.725, athlete: 1.9,
};
const GOAL_ADJUSTMENTS = {
  'lose fat':          { slow: -250, moderate: -500, aggressive: -750 },
  maintain:            { slow: 0,    moderate: 0,    aggressive: 0    },
  'build muscle':      { slow: 250,  moderate: 500,  aggressive: 750  },
  'body recomposition':{ slow: -200, moderate: -200, aggressive: -200 },
};
function calcAge(dob) {
  if (!dob) return null;
  const d = new Date(dob), t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age;
}
function calcBMR(w, h, age, sex) {
  if (!w || !h || !age) return null;
  const male = 10 * w + 6.25 * h - 5 * age + 5;
  const female = 10 * w + 6.25 * h - 5 * age - 161;
  if (sex === 'male') return male;
  if (sex === 'female') return female;
  return (male + female) / 2;
}
function calcTargets(profile, weightKg) {
  const age = calcAge(profile.date_of_birth);
  const h = parseFloat(profile.height_cm);
  const w = parseFloat(weightKg);
  if (!age || !h || !w || !profile.sex) return null;
  const bmr = calcBMR(w, h, age, profile.sex);
  if (!bmr) return null;
  const multiplier = ACTIVITY_MULTIPLIERS[profile.activity_level] || 1.55;
  const tdee = bmr * multiplier;
  const adj = GOAL_ADJUSTMENTS[profile.goal] || GOAL_ADJUSTMENTS.maintain;
  const pace = profile.goal === 'maintain' ? 'moderate' : profile.goal_pace;
  const calorieTarget = tdee + (adj[pace] ?? adj.moderate ?? 0);
  const proteinPct = parseFloat(profile.protein_pct) || 30;
  const carbsPct   = parseFloat(profile.carbs_pct)   || 40;
  const fatPct     = parseFloat(profile.fat_pct)     || 30;
  return {
    bmr: Math.round(bmr), tdee: Math.round(tdee), calorieTarget: Math.round(calorieTarget),
    proteinG: Math.round(w * 2.0),
    carbsG:   Math.round((calorieTarget * carbsPct / 100) / 4),
    fatG:     Math.round((calorieTarget * fatPct   / 100) / 9),
    proteinPct, carbsPct, fatPct,
  };
}

// Suggested macro splits per goal — applied when user changes goal (can be overridden)
const GOAL_MACRO_PRESETS = {
  'lose fat':           { protein_pct: 40, carbs_pct: 30, fat_pct: 30 },
  maintain:             { protein_pct: 30, carbs_pct: 40, fat_pct: 30 },
  'build muscle':       { protein_pct: 35, carbs_pct: 45, fat_pct: 20 },
  'body recomposition': { protein_pct: 40, carbs_pct: 35, fat_pct: 25 },
};

// Dietary requirement macro overrides — these take priority over goal presets
const DIETARY_MACRO_PRESETS = {
  pcos:          { protein_pct: 30, carbs_pct: 25, fat_pct: 45 },
  keto:          { protein_pct: 25, carbs_pct: 5,  fat_pct: 70 },
  low_carb:      { protein_pct: 30, carbs_pct: 20, fat_pct: 50 },
  high_protein:  { protein_pct: 40, carbs_pct: 35, fat_pct: 25 },
  vegan:         { protein_pct: 25, carbs_pct: 50, fat_pct: 25 },
  diabetic:      { protein_pct: 30, carbs_pct: 30, fat_pct: 40 },
};

const DIETARY_OPTIONS = [
  { value: 'none',         label: 'No specific requirements' },
  { value: 'pcos',         label: 'PCOS-friendly (lower carbs, higher protein)' },
  { value: 'keto',         label: 'Keto (very low carb, high fat)' },
  { value: 'low_carb',     label: 'Low Carb (reduced carbohydrates)' },
  { value: 'high_protein', label: 'High Protein (muscle building focus)' },
  { value: 'vegan',        label: 'Vegan (plant-based, adjusted protein sources)' },
  { value: 'diabetic',     label: 'Diabetic-friendly (controlled carbs)' },
];

const GOAL_DESCRIPTIONS = {
  'lose fat': 'Create a calorie deficit to burn stored fat.',
  maintain:   'Eat at your maintenance level to stay the same weight.',
  'build muscle': 'Eat a calorie surplus to support muscle growth.',
  'body recomposition': 'Lose fat and gain muscle simultaneously.',
};
const GOAL_PACE_DESCRIPTIONS = {
  slow:       'A gentle pace — easier to sustain long term.',
  moderate:   'A balanced pace with steady, consistent progress.',
  aggressive: 'Faster results — requires more discipline.',
};

const StyledSelect = ({ label, name, value, onChange, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 mb-1.5">{label}</label>
    <div className="relative">
      <select name={name} value={value} onChange={onChange}
        className="w-full appearance-none border border-slate-200 rounded-xl px-4 py-2.5 pr-10 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow cursor-pointer">
        {children}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  </div>
);

const GoalsPage = () => {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    dietary_requirement: 'none', goal: 'maintain', goal_pace: 'moderate',
    protein_pct: 30, carbs_pct: 40, fat_pct: 30,
  });
  const [latestWeightKg, setLatestWeightKg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API_BASE_URL}/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setProfile(data);
        setLatestWeightKg(data.latest_weight_kg ?? null);
        setForm({
          dietary_requirement: data.dietary_requirement || 'none',
          goal:        data.goal        || 'maintain',
          goal_pace:   data.goal_pace   || 'moderate',
          protein_pct: data.protein_pct ?? 30,
          carbs_pct:   data.carbs_pct   ?? 40,
          fat_pct:     data.fat_pct     ?? 30,
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleChange = e => {
    const { name, value } = e.target;
    if (name === 'dietary_requirement') {
      const preset = DIETARY_MACRO_PRESETS[value] || null;
      if (preset) {
        setForm(p => ({ ...p, [name]: value, ...preset }));
      } else {
        // "none" — revert to goal-based defaults
        const goalPreset = GOAL_MACRO_PRESETS[form.goal] || {};
        setForm(p => ({ ...p, [name]: value, ...goalPreset }));
      }
    } else if (name === 'goal') {
      // Only apply goal presets if no dietary requirement is active
      const hasDietary = form.dietary_requirement && form.dietary_requirement !== 'none';
      const preset = hasDietary ? {} : (GOAL_MACRO_PRESETS[value] || {});
      setForm(p => ({ ...p, [name]: value, ...preset }));
    } else {
      setForm(p => ({ ...p, [name]: value }));
    }
    setSaveSuccess(false);
    setSaveError('');
  };

  const targets = profile ? calcTargets({ ...profile, ...form }, latestWeightKg) : null;

  const handleSave = async e => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      const token = localStorage.getItem('token');
      const body = {
        // pass through existing stats so we don't overwrite them
        date_of_birth:  profile?.date_of_birth  ?? null,
        sex:            profile?.sex             ?? null,
        height_cm:      profile?.height_cm       ? parseFloat(profile.height_cm) : null,
        activity_level: profile?.activity_level  ?? 'moderately active',
        // goals fields
        dietary_requirement: form.dietary_requirement === 'none' ? null : form.dietary_requirement,
        goal:           form.goal,
        goal_pace:      form.goal_pace,
        protein_pct:    parseFloat(form.protein_pct),
        carbs_pct:      parseFloat(form.carbs_pct),
        fat_pct:        parseFloat(form.fat_pct),
      };
      const res = await fetch(`${API_BASE_URL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        setSaveError(d.error || 'Failed to save goals.');
      } else {
        setSaveSuccess(true);
      }
    } catch {
      setSaveError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-20 text-center text-sm text-slate-500">Loading…</div>;

  const proteinPct = parseFloat(form.protein_pct) || 0;
  const carbsPct   = parseFloat(form.carbs_pct)   || 0;
  const fatPct     = parseFloat(form.fat_pct)      || 0;
  const macroTotal = proteinPct + carbsPct + fatPct;
  const proteinW = macroTotal > 0 ? (proteinPct / macroTotal) * 100 : 0;
  const carbsW   = macroTotal > 0 ? (carbsPct   / macroTotal) * 100 : 0;
  const fatW     = macroTotal > 0 ? (fatPct     / macroTotal) * 100 : 0;

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">

      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 px-6 py-7 text-white shadow-lg">
        <h1 className="text-2xl font-bold tracking-tight">Goals &amp; Targets</h1>
        <p className="text-indigo-100 text-sm mt-0.5">Set your goal and macro split to calculate your daily targets.</p>
      </div>

      {/* Calorie target summary */}
      {targets ? (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl overflow-hidden">
          <div className="px-6 pt-5 pb-3 border-b border-white/10">
            <p className="text-xs text-slate-400">
              {form.goal === 'lose fat' ? `Deficit at ${form.goal_pace} pace`
               : form.goal === 'build muscle' ? `Surplus at ${form.goal_pace} pace`
               : form.goal === 'body recomposition' ? 'Recomposition approach'
               : 'Maintenance calories'}
              {' · '}BMR {targets.bmr.toLocaleString()} · TDEE {targets.tdee.toLocaleString()} kcal
            </p>
          </div>
          <div className="px-6 pt-5 pb-3 text-center">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Daily Calorie Target</p>
            <p className="text-5xl font-black text-white tabular-nums leading-none">{targets.calorieTarget.toLocaleString()}</p>
            <p className="text-sm text-slate-400 mt-1">kcal / day</p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-white/10 mx-6 mb-5 bg-white/5 rounded-2xl overflow-hidden">
            {[
              { label: 'Protein', g: targets.proteinG, pct: targets.proteinPct, color: 'blue' },
              { label: 'Carbs',   g: targets.carbsG,   pct: targets.carbsPct,   color: 'amber' },
              { label: 'Fat',     g: targets.fatG,     pct: targets.fatPct,     color: 'rose' },
            ].map(({ label, g, pct, color }) => (
              <div key={label} className="px-4 py-4 text-center">
                <span className="text-xl font-bold text-white">{g}g</span>
                <p className={`text-xs font-semibold text-slate-400 uppercase tracking-wide mt-1`}>{label}</p>
                <div className="w-full h-1 rounded-full bg-white/10 mt-2 overflow-hidden">
                  <div className={`h-full bg-${color}-400 rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <p className={`text-xs text-${color}-400 mt-1 font-medium`}>{pct}%</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-700">
          Complete your <a href="/profile" className="font-semibold underline">Profile</a> (date of birth, sex, height, and <a href="/log" className="font-semibold underline">log your weight</a>) to see personalised calorie targets.
        </div>
      )}

      {/* Goals form */}
      <form onSubmit={handleSave}>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-800">Your Goal</h2>
          </div>
          <div className="p-6 space-y-5">

            <div>
              <StyledSelect label="Dietary Requirement" name="dietary_requirement" value={form.dietary_requirement} onChange={handleChange}>
                {DIETARY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </StyledSelect>
              {form.dietary_requirement && form.dietary_requirement !== 'none' && (
                <p className="mt-2 text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                  Macro split set by <span className="font-semibold">{DIETARY_OPTIONS.find(o => o.value === form.dietary_requirement)?.label || form.dietary_requirement}</span> preset.
                </p>
              )}
            </div>

            <div>
              <StyledSelect label="Goal" name="goal" value={form.goal} onChange={handleChange}>
                <option value="lose fat">Lose fat</option>
                <option value="maintain">Maintain</option>
                <option value="build muscle">Build muscle</option>
                <option value="body recomposition">Body recomposition</option>
              </StyledSelect>
              {form.goal && (
                <p className="mt-2 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                  {GOAL_DESCRIPTIONS[form.goal]}
                </p>
              )}
            </div>

            {form.goal !== 'maintain' && (
              <div>
                <StyledSelect label="Goal pace" name="goal_pace" value={form.goal_pace} onChange={handleChange}>
                  <option value="slow">Slow</option>
                  <option value="moderate">Moderate</option>
                  <option value="aggressive">Aggressive</option>
                </StyledSelect>
                {form.goal_pace && (
                  <p className="mt-2 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                    {GOAL_PACE_DESCRIPTIONS[form.goal_pace]}
                  </p>
                )}
              </div>
            )}

            {/* Macro split */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="block text-sm font-medium text-slate-600">Macro split</p>
                {form.dietary_requirement && form.dietary_requirement !== 'none' ? (
                  <span className="text-xs font-medium text-indigo-600 bg-indigo-50 rounded-full px-2.5 py-0.5">
                    {DIETARY_OPTIONS.find(o => o.value === form.dietary_requirement)?.label.split(' (')[0] || form.dietary_requirement} preset
                  </span>
                ) : (
                  <span className="text-xs font-medium text-slate-400 bg-slate-50 rounded-full px-2.5 py-0.5">
                    Based on goal
                  </span>
                )}
              </div>
              <div className="flex rounded-full overflow-hidden h-3 mb-4 gap-px bg-slate-100">
                {macroTotal > 0 ? (
                  <>
                    <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${proteinW}%` }} />
                    <div className="h-full bg-amber-400 transition-all duration-300" style={{ width: `${carbsW}%` }} />
                    <div className="h-full bg-rose-500 transition-all duration-300" style={{ width: `${fatW}%` }} />
                  </>
                ) : (
                  <div className="h-full w-full bg-slate-200 rounded-full" />
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'protein_pct', label: 'Protein', color: 'blue',  cals: 4,  dotCls: 'bg-blue-500'  },
                  { key: 'carbs_pct',   label: 'Carbs',   color: 'amber', cals: 4,  dotCls: 'bg-amber-400' },
                  { key: 'fat_pct',     label: 'Fat',     color: 'rose',  cals: 9,  dotCls: 'bg-rose-500'  },
                ].map(({ key, label, color, cals, dotCls }) => {
                  const pct = parseFloat(form[key]) || 0;
                  const macroKcal = targets ? Math.round(targets.calorieTarget * pct / 100) : null;
                  const macroG    = macroKcal ? Math.round(macroKcal / cals) : null;
                  return (
                    <div key={key} className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <span className={`w-2 h-2 rounded-full ${dotCls} inline-block`} />
                        <span className="text-xs font-medium text-slate-500">{label}</span>
                      </div>
                      <p className={`text-2xl font-bold text-${color}-600`}>{pct}%</p>
                      {macroG !== null && (
                        <p className="text-xs text-slate-500 mt-0.5">{macroG}g · {macroKcal} kcal</p>
                      )}
                    </div>
                  );
                })}
              </div>
              {!targets && (
                <p className="mt-2 text-xs text-slate-400 text-center">Complete your profile to see gram targets.</p>
              )}
            </div>

            {/* Errors / success */}
            {saveError && (
              <div className="flex items-start gap-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                {saveError}
              </div>
            )}
            {saveSuccess && (
              <div className="flex items-center gap-2.5 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                Goals saved successfully.
              </div>
            )}

            <button
              type="submit" disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors shadow-sm"
            >
              {saving ? 'Saving…' : 'Save Goals'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default GoalsPage;
