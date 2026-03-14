import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../config';

function kgToLbs(kg) { return +(kg * 2.2046).toFixed(1); }
function kgToStLbs(kg) {
  const totalLbs = kg * 2.2046;
  const st = Math.floor(totalLbs / 14);
  const lbs = +((totalLbs % 14).toFixed(1));
  return { st, lbs };
}
function lbsToKg(lbs) { return +(lbs / 2.2046).toFixed(2); }
function stLbsToKg(st, lbs) { return +(((parseFloat(st) || 0) * 14 + (parseFloat(lbs) || 0)) / 2.2046).toFixed(2); }

function displayWeight(kg, unit) {
  if (!kg) return '—';
  const n = parseFloat(kg);
  if (unit === 'lbs') return `${kgToLbs(n)} lbs`;
  if (unit === 'st+lbs') { const { st, lbs } = kgToStLbs(n); return `${st} st ${lbs} lbs`; }
  return `${parseFloat(n.toFixed(2))} kg`;
}

const DailyLog = () => {
  const [weightUnit, setWeightUnit] = useState(() => localStorage.getItem('weightUnit') || 'kg');
  const [weightInput, setWeightInput] = useState('');
  const [stPart, setStPart] = useState('');
  const [lbsPart, setLbsPart] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const fetchLogs = useCallback(() => {
    const token = localStorage.getItem('token');
    const from = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setLoadingLogs(true);
    fetch(`${API_BASE_URL}/logs/daily?from=${from}&to=${today}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => { setLogs(Array.isArray(data) ? data : []); setLoadingLogs(false); })
      .catch(() => setLoadingLogs(false));
  }, [today]);

  useEffect(() => { fetchLogs(); }, [fetchLogs, refreshKey]);

  const getWeightKg = () => {
    if (weightUnit === 'kg') return parseFloat(weightInput) || null;
    if (weightUnit === 'lbs') return parseFloat(weightInput) ? lbsToKg(parseFloat(weightInput)) : null;
    const s = parseFloat(stPart) || 0;
    const l = parseFloat(lbsPart) || 0;
    return s || l ? stLbsToKg(s, l) : null;
  };

  const isInputEmpty = weightUnit === 'st+lbs' ? (!stPart && !lbsPart) : !weightInput;

  const handleLog = async () => {
    const kg = getWeightKg();
    if (!kg) return;
    setSaving(true);
    setSaveError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/logs/daily`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ date: today, weight_kg: kg }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setWeightInput('');
      setStPart('');
      setLbsPart('');
      setRefreshKey(k => k + 1);
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const weightLogs = logs.filter(l => l.weight_kg != null);

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">

      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-700 px-6 py-7 text-white shadow-lg">
        <h1 className="text-2xl font-bold tracking-tight">Daily Log</h1>
        <p className="text-teal-100 text-sm mt-0.5">Track your weight and daily health metrics.</p>
      </div>

      {/* Weight logging card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-800">Log Today's Weight</h2>

        {/* Unit toggle */}
        <div>
          <p className="text-xs text-slate-500 mb-1.5">Units</p>
          <div className="flex gap-1">
            {['kg', 'lbs', 'st+lbs'].map(u => (
              <button
                key={u}
                type="button"
                onClick={() => {
                  setWeightUnit(u);
                  localStorage.setItem('weightUnit', u);
                  setWeightInput('');
                  setStPart('');
                  setLbsPart('');
                }}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  weightUnit === u ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-blue-50'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {/* Input row */}
        <div className="flex gap-2">
          {weightUnit === 'kg' && (
            <input
              type="number"
              value={weightInput}
              onChange={e => setWeightInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLog()}
              placeholder="e.g. 75.5"
              min="20" max="400" step="0.1"
              autoFocus
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
            />
          )}
          {weightUnit === 'lbs' && (
            <input
              type="number"
              value={weightInput}
              onChange={e => setWeightInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLog()}
              placeholder="e.g. 165"
              min="44" max="880" step="0.1"
              autoFocus
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
            />
          )}
          {weightUnit === 'st+lbs' && (
            <>
              <input
                type="number"
                value={stPart}
                onChange={e => setStPart(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLog()}
                placeholder="st"
                min="0" max="60"
                autoFocus
                className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              />
              <input
                type="number"
                value={lbsPart}
                onChange={e => setLbsPart(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLog()}
                placeholder="lbs"
                min="0" max="13.9" step="0.1"
                className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              />
            </>
          )}
          <button
            onClick={handleLog}
            disabled={isInputEmpty || saving}
            className="shrink-0 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {saving ? 'Saving…' : 'Log'}
          </button>
        </div>

        {saveError && <p className="text-xs text-red-600">{saveError}</p>}
        <p className="text-xs text-slate-400">
          Logs today's weight. Updates your calorie &amp; macro targets on the Goals page.
        </p>
      </div>

      {/* Weight history */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Weight History</h2>
            <p className="text-xs text-slate-400 mt-0.5">Last 60 days</p>
          </div>
          <div className="flex gap-1">
            {['kg', 'lbs', 'st+lbs'].map(u => (
              <button
                key={u}
                type="button"
                onClick={() => { setWeightUnit(u); localStorage.setItem('weightUnit', u); }}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                  weightUnit === u ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-blue-50'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {loadingLogs ? (
          <div className="py-10 text-center text-sm text-slate-400">Loading…</div>
        ) : weightLogs.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-slate-500">No weight entries yet.</p>
            <p className="text-xs text-slate-400 mt-1">Log your first weight above to get started.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {weightLogs.map(log => {
              const dateStr = typeof log.date === 'string' ? log.date.slice(0, 10) : log.date;
              const d = new Date(dateStr + 'T00:00:00');
              const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
              const isToday = dateStr === today;
              return (
                <li key={log.id} className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600">{label}</span>
                    {isToday && (
                      <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">Today</span>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-slate-800">
                    {displayWeight(log.weight_kg, weightUnit)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default DailyLog;
