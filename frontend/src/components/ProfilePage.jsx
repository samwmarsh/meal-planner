import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API_BASE_URL from '../config';

function cmToFtIn(cm) {
  if (!cm) return { ft: '', inches: '' };
  const totalInches = cm / 2.54;
  return { ft: Math.floor(totalInches / 12), inches: parseFloat((totalInches % 12).toFixed(1)) };
}
function ftInToCm(ft, inches) {
  return ((parseFloat(ft) || 0) * 12 + (parseFloat(inches) || 0)) * 2.54;
}
function kgToLbs(kg) { return +(kg * 2.2046).toFixed(1); }
function kgToStLbs(kg) {
  const t = kg * 2.2046;
  return { st: Math.floor(t / 14), lbs: +((t % 14).toFixed(1)) };
}

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

const ProfilePage = () => {
  const navigate = useNavigate();

  // Security section state
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess(false);
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwError('New passwords do not match.');
      return;
    }
    if (pwForm.new_password.length < 6) {
      setPwError('New password must be at least 6 characters.');
      return;
    }
    setPwSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: pwForm.current_password, new_password: pwForm.new_password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error || 'Failed to change password.');
      } else {
        setPwSuccess(true);
        setPwForm({ current_password: '', new_password: '', confirm_password: '' });
      }
    } catch {
      setPwError('Network error. Please try again.');
    } finally {
      setPwSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError('');
    if (!deletePassword) {
      setDeleteError('Password is required.');
      return;
    }
    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/auth/account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || 'Failed to delete account.');
      } else {
        localStorage.removeItem('token');
        navigate('/login');
      }
    } catch {
      setDeleteError('Network error. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const [form, setForm] = useState({
    date_of_birth: '', sex: '', height_cm: '', activity_level: 'moderately active',
  });
  const [latestWeightKg, setLatestWeightKg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [heightUnit, setHeightUnit] = useState(() => localStorage.getItem('heightUnit') || 'cm');
  const [weightUnit, setWeightUnit] = useState(() => localStorage.getItem('weightUnit') || 'kg');

  const [unitSaving, setUnitSaving] = useState(false);

  const saveUnit = async (weightU, heightU) => {
    localStorage.setItem('weightUnit', weightU);
    localStorage.setItem('heightUnit', heightU);
    setUnitSaving(true);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE_URL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...goalsFields,
          date_of_birth:  form.date_of_birth || null,
          sex:            form.sex           || null,
          height_cm:      form.height_cm !== '' ? parseFloat(form.height_cm) : null,
          activity_level: form.activity_level,
          protein_pct:    parseFloat(goalsFields.protein_pct),
          carbs_pct:      parseFloat(goalsFields.carbs_pct),
          fat_pct:        parseFloat(goalsFields.fat_pct),
          weight_unit:    weightU,
          height_unit:    heightU,
        }),
      });
    } catch { /* silent — localStorage already updated */ }
    finally { setUnitSaving(false); }
  };

  const setWeightUnitAndSync = (u) => { setWeightUnit(u); saveUnit(u, heightUnit); };
  const setHeightUnitAndSync = (u) => { setHeightUnit(u); saveUnit(weightUnit, u); };

  // We need to preserve goals fields on save so they don't get wiped
  const [goalsFields, setGoalsFields] = useState({
    goal: 'maintain', goal_pace: 'moderate', protein_pct: 30, carbs_pct: 40, fat_pct: 30,
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API_BASE_URL}/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setLatestWeightKg(data.latest_weight_kg ?? null);
        setForm({
          date_of_birth:  data.date_of_birth ? data.date_of_birth.slice(0, 10) : '',
          sex:            data.sex           || '',
          height_cm:      data.height_cm     ?? '',
          activity_level: data.activity_level || 'moderately active',
        });
        setGoalsFields({
          goal:        data.goal        || 'maintain',
          goal_pace:   data.goal_pace   || 'moderate',
          protein_pct: data.protein_pct ?? 30,
          carbs_pct:   data.carbs_pct   ?? 40,
          fat_pct:     data.fat_pct     ?? 30,
        });
        // Sync unit preferences from server (server is source of truth)
        if (data.weight_unit) { setWeightUnit(data.weight_unit); localStorage.setItem('weightUnit', data.weight_unit); }
        if (data.height_unit) { setHeightUnit(data.height_unit); localStorage.setItem('heightUnit', data.height_unit); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
    setSaveSuccess(false);
    setSaveError('');
  };

  const handleSave = async e => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...goalsFields,
          date_of_birth:  form.date_of_birth || null,
          sex:            form.sex           || null,
          height_cm:      form.height_cm !== '' ? parseFloat(form.height_cm) : null,
          activity_level: form.activity_level,
          protein_pct:    parseFloat(goalsFields.protein_pct),
          carbs_pct:      parseFloat(goalsFields.carbs_pct),
          fat_pct:        parseFloat(goalsFields.fat_pct),
          weight_unit:    weightUnit,
          height_unit:    heightUnit,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setSaveError(d.error || 'Failed to save profile.');
      } else {
        setSaveSuccess(true);
      }
    } catch {
      setSaveError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><p className="text-slate-500">Loading…</p></div>;
  }

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">

      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 px-6 py-8 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 ring-2 ring-white/30">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
            <p className="text-blue-100 text-sm mt-0.5">Your personal stats used to calculate BMR and daily targets.</p>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/goals" className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Goals &amp; Targets</p>
            <p className="text-xs text-slate-400">Set goal, pace &amp; macro split</p>
          </div>
        </Link>
        <Link to="/log" className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-teal-300 hover:bg-teal-50 transition-colors">
          <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Daily Log</p>
            <p className="text-xs text-slate-400">Log weight &amp; daily metrics</p>
          </div>
        </Link>
      </div>

      {/* Preferences card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Preferences</h2>
            <p className="text-xs text-slate-400 mt-0.5">Your default units — saved across all pages.</p>
          </div>
          {unitSaving && <span className="text-xs text-slate-400">Saving…</span>}
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-medium text-slate-600 mb-2">Weight unit</p>
            <div className="flex gap-2">
              {['kg', 'lbs', 'st+lbs'].map(u => (
                <button key={u} type="button"
                  onClick={() => setWeightUnitAndSync(u)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${weightUnit === u ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:bg-blue-50'}`}>
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-600 mb-2">Height unit</p>
            <div className="flex gap-2">
              {['cm', 'ft+in'].map(u => (
                <button key={u} type="button"
                  onClick={() => setHeightUnitAndSync(u)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${heightUnit === u ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:bg-blue-50'}`}>
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stats form */}
      <form onSubmit={handleSave}>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-800">Personal Stats</h2>
            <p className="text-xs text-slate-400 mt-0.5">Used to calculate your BMR and daily calorie target.</p>
          </div>

          <div className="p-6 space-y-5">
            {/* DOB + Sex */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Date of birth</label>
                <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow" />
              </div>
              <StyledSelect label="Sex" name="sex" value={form.sex} onChange={handleChange}>
                <option value="">Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="prefer not to say">Prefer not to say</option>
              </StyledSelect>
            </div>

            {/* Height + Weight (read-only) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Height */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Height</label>
                {heightUnit === 'cm' ? (
                  <input type="number" name="height_cm" value={form.height_cm} onChange={handleChange}
                    min="50" max="280" step="0.1" placeholder="e.g. 175"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow" />
                ) : (
                  <div className="flex gap-2">
                    <input type="number" value={cmToFtIn(form.height_cm).ft}
                      onChange={e => { const { inches } = cmToFtIn(form.height_cm); setForm(p => ({ ...p, height_cm: ftInToCm(e.target.value, inches) })); }}
                      placeholder="ft" min="1" max="9"
                      className="w-1/2 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow" />
                    <input type="number" value={cmToFtIn(form.height_cm).inches}
                      onChange={e => { const { ft } = cmToFtIn(form.height_cm); setForm(p => ({ ...p, height_cm: ftInToCm(ft, e.target.value) })); }}
                      placeholder="in" min="0" max="11.9" step="0.1"
                      className="w-1/2 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow" />
                  </div>
                )}
              </div>

              {/* Weight — read-only, link to log */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Current weight</label>
                {latestWeightKg != null ? (
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-4 py-1.5 text-sm font-semibold">
                      {weightUnit === 'kg' && `${latestWeightKg} kg`}
                      {weightUnit === 'lbs' && `${kgToLbs(latestWeightKg)} lbs`}
                      {weightUnit === 'st+lbs' && (() => { const { st, lbs } = kgToStLbs(latestWeightKg); return `${st} st ${lbs} lbs`; })()}
                    </span>
                    <Link to="/log" className="text-xs text-blue-600 hover:text-blue-800 font-medium">Update →</Link>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                    <p className="text-sm text-slate-400 flex-1">Not logged yet</p>
                    <Link to="/log" className="text-xs font-semibold text-blue-600 hover:text-blue-800">Log weight →</Link>
                  </div>
                )}
              </div>
            </div>

            {/* Activity level */}
            <StyledSelect label="Activity level" name="activity_level" value={form.activity_level} onChange={handleChange}>
              <option value="sedentary">Sedentary — little or no exercise</option>
              <option value="lightly active">Lightly active — 1–3 days/week</option>
              <option value="moderately active">Moderately active — 3–5 days/week</option>
              <option value="very active">Very active — 6–7 days/week</option>
              <option value="athlete">Athlete — intense training daily</option>
            </StyledSelect>

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
                Profile saved.
              </div>
            )}

            <button type="submit" disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors shadow-sm">
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </div>
      </form>

      {/* Security section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Security</h2>
          <p className="text-xs text-slate-400 mt-0.5">Change your password or delete your account.</p>
        </div>

        {/* Change Password */}
        <form onSubmit={handleChangePassword} className="p-6 space-y-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">Change Password</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Current password</label>
              <input type="password" value={pwForm.current_password}
                onChange={e => { setPwForm(p => ({ ...p, current_password: e.target.value })); setPwSuccess(false); setPwError(''); }}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                autoComplete="current-password" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">New password</label>
                <input type="password" value={pwForm.new_password}
                  onChange={e => { setPwForm(p => ({ ...p, new_password: e.target.value })); setPwSuccess(false); setPwError(''); }}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                  autoComplete="new-password" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Confirm new password</label>
                <input type="password" value={pwForm.confirm_password}
                  onChange={e => { setPwForm(p => ({ ...p, confirm_password: e.target.value })); setPwSuccess(false); setPwError(''); }}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                  autoComplete="new-password" />
              </div>
            </div>
          </div>
          {pwError && (
            <div className="flex items-start gap-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              {pwError}
            </div>
          )}
          {pwSuccess && (
            <div className="flex items-center gap-2.5 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              Password changed successfully.
            </div>
          )}
          <button type="submit" disabled={pwSaving}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors shadow-sm">
            {pwSaving ? 'Changing...' : 'Change Password'}
          </button>
        </form>

        {/* Delete Account */}
        <div className="p-6 space-y-4">
          <h3 className="text-sm font-semibold text-red-700">Delete Account</h3>
          <p className="text-sm text-slate-500">Permanently delete your account and all associated data. This action cannot be undone.</p>
          {!showDeleteConfirm ? (
            <button type="button" onClick={() => setShowDeleteConfirm(true)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300 transition-colors">
              Delete my account
            </button>
          ) : (
            <div className="space-y-3 bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm font-medium text-red-800">Enter your password to confirm deletion:</p>
              <input type="password" value={deletePassword}
                onChange={e => { setDeletePassword(e.target.value); setDeleteError(''); }}
                placeholder="Your password"
                className="w-full border border-red-200 rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-shadow"
                autoComplete="current-password" />
              {deleteError && (
                <div className="text-sm text-red-700">{deleteError}</div>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={handleDeleteAccount} disabled={deleting}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {deleting ? 'Deleting...' : 'Permanently Delete'}
                </button>
                <button type="button" onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteError(''); }}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
