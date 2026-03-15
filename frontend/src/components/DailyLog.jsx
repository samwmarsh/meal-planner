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

function sleepQualityLabel(q) {
  const labels = { 1: 'Terrible', 2: 'Poor', 3: 'Fair', 4: 'Good', 5: 'Great' };
  return labels[q] || '—';
}

const DailyLog = () => {
  const [weightUnit, setWeightUnit] = useState(() => localStorage.getItem('weightUnit') || 'kg');
  const [weightInput, setWeightInput] = useState('');
  const [stPart, setStPart] = useState('');
  const [lbsPart, setLbsPart] = useState('');
  const [sleepHours, setSleepHours] = useState('');
  const [sleepQuality, setSleepQuality] = useState(0);
  const [waterMl, setWaterMl] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
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
      .then(data => {
        const allLogs = Array.isArray(data) ? data : [];
        setLogs(allLogs);
        // Pre-fill form with today's existing log
        const todayLog = allLogs.find(l => {
          const ds = typeof l.date === 'string' ? l.date.slice(0, 10) : l.date;
          return ds === today;
        });
        if (todayLog) {
          if (todayLog.sleep_hours != null) setSleepHours(String(todayLog.sleep_hours));
          if (todayLog.sleep_quality != null) setSleepQuality(todayLog.sleep_quality);
          if (todayLog.water_ml != null) setWaterMl(String(todayLog.water_ml));
          if (todayLog.notes != null && todayLog.notes !== '') setNotes(todayLog.notes);
        }
        setLoadingLogs(false);
      })
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

  const isWeightEmpty = weightUnit === 'st+lbs' ? (!stPart && !lbsPart) : !weightInput;

  const hasAnyInput = !isWeightEmpty || sleepHours || sleepQuality > 0 || waterMl || notes;

  const handleLog = async () => {
    if (!hasAnyInput) return;
    setSaving(true);
    setSaveError('');
    setSaveSuccess('');
    try {
      const token = localStorage.getItem('token');
      const body = { date: today };
      const kg = getWeightKg();
      if (kg) body.weight_kg = kg;
      if (sleepHours) body.sleep_hours = parseFloat(sleepHours);
      if (sleepQuality > 0) body.sleep_quality = sleepQuality;
      if (waterMl) body.water_ml = parseInt(waterMl, 10);
      if (notes.trim()) body.notes = notes.trim();

      const res = await fetch(`${API_BASE_URL}/logs/daily`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save');
      setWeightInput('');
      setStPart('');
      setLbsPart('');
      setSaveSuccess('Saved!');
      setTimeout(() => setSaveSuccess(''), 2000);
      setRefreshKey(k => k + 1);
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const addWater = (amount) => {
    setWaterMl(prev => String((parseInt(prev, 10) || 0) + amount));
  };

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">

      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-700 px-6 py-7 text-white shadow-lg">
        <h1 className="text-2xl font-bold tracking-tight">Daily Log</h1>
        <p className="text-teal-100 text-sm mt-0.5">Track your weight, sleep, water intake, and more.</p>
      </div>

      {/* Weight logging card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-800">Weight</h2>

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

        {/* Weight input row */}
        <div className="flex gap-2">
          {weightUnit === 'kg' && (
            <input
              type="number"
              value={weightInput}
              onChange={e => setWeightInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLog()}
              placeholder="e.g. 75.5"
              min="20" max="400" step="0.1"
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
        </div>
      </div>

      {/* Sleep tracking card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-800">Sleep</h2>

        {/* Sleep hours */}
        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">Hours slept</label>
          <input
            type="number"
            value={sleepHours}
            onChange={e => setSleepHours(e.target.value)}
            placeholder="e.g. 7.5"
            min="0" max="24" step="0.25"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
          />
        </div>

        {/* Sleep quality */}
        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">Sleep quality</label>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map(q => (
              <button
                key={q}
                type="button"
                onClick={() => setSleepQuality(prev => prev === q ? 0 : q)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                  sleepQuality >= q
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-indigo-50'
                }`}
              >
                {q <= sleepQuality ? '\u2605' : '\u2606'}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {sleepQuality > 0 ? `${sleepQuality}/5 — ${sleepQualityLabel(sleepQuality)}` : 'Tap to rate 1-5'}
          </p>
        </div>
      </div>

      {/* Water intake card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-800">Water Intake</h2>

        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1.5 block">Total (ml)</label>
            <input
              type="number"
              value={waterMl}
              onChange={e => setWaterMl(e.target.value)}
              placeholder="e.g. 2000"
              min="0" max="10000" step="50"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
            />
          </div>
        </div>

        {/* Quick-add buttons */}
        <div>
          <p className="text-xs text-slate-500 mb-1.5">Quick add</p>
          <div className="flex gap-1.5">
            {[250, 500, 750, 1000].map(amt => (
              <button
                key={amt}
                type="button"
                onClick={() => addWater(amt)}
                className="flex-1 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 text-sm font-medium rounded-xl transition-colors"
              >
                +{amt}ml
              </button>
            ))}
          </div>
        </div>

        {waterMl && parseInt(waterMl, 10) > 0 && (
          <p className="text-xs text-slate-400">
            {(parseInt(waterMl, 10) / 250).toFixed(1)} glasses ({(parseInt(waterMl, 10) / 1000).toFixed(1)}L)
          </p>
        )}
      </div>

      {/* Notes card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-800">Notes</h2>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="How are you feeling today? Any observations..."
          rows={3}
          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow resize-none"
        />
      </div>

      {/* Save button */}
      <div className="space-y-2">
        <button
          onClick={handleLog}
          disabled={!hasAnyInput || saving}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {saving ? 'Saving...' : 'Save Daily Log'}
        </button>
        {saveError && <p className="text-xs text-red-600 text-center">{saveError}</p>}
        {saveSuccess && <p className="text-xs text-emerald-600 text-center font-medium">{saveSuccess}</p>}
        <p className="text-xs text-slate-400 text-center">
          Saves today's entries. Weight updates your calorie &amp; macro targets on the Goals page.
        </p>
      </div>

      {/* History */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Log History</h2>
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
          <div className="animate-pulse divide-y divide-slate-50">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-6 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-4 bg-slate-200 rounded w-36" />
                    {i === 0 && <div className="h-5 bg-slate-200 rounded-full w-14" />}
                  </div>
                  <div className="h-4 bg-slate-200 rounded w-20" />
                </div>
                <div className="flex gap-4">
                  <div className="h-3 bg-slate-200 rounded w-16" />
                  <div className="h-3 bg-slate-200 rounded w-20" />
                  <div className="h-3 bg-slate-200 rounded w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-slate-500">No log entries yet.</p>
            <p className="text-xs text-slate-400 mt-1">Log your first entry above to get started.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {logs.map(log => {
              const dateStr = typeof log.date === 'string' ? log.date.slice(0, 10) : log.date;
              const d = new Date(dateStr + 'T00:00:00');
              const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
              const isToday = dateStr === today;
              const hasWeight = log.weight_kg != null;
              const hasSleep = log.sleep_hours != null || log.sleep_quality != null;
              const hasWater = log.water_ml != null;
              const hasNotes = log.notes != null && log.notes !== '';
              return (
                <li key={log.id} className="px-6 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">{label}</span>
                      {isToday && (
                        <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">Today</span>
                      )}
                    </div>
                    {hasWeight && (
                      <span className="text-sm font-semibold text-slate-800">
                        {displayWeight(log.weight_kg, weightUnit)}
                      </span>
                    )}
                  </div>
                  {/* Detail row */}
                  {(hasSleep || hasWater || hasNotes) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {log.sleep_hours != null && (
                        <span>{parseFloat(log.sleep_hours)}h sleep</span>
                      )}
                      {log.sleep_quality != null && (
                        <span>Quality: {log.sleep_quality}/5</span>
                      )}
                      {hasWater && (
                        <span>{log.water_ml}ml water</span>
                      )}
                      {hasNotes && (
                        <span className="text-slate-400 truncate max-w-[200px]" title={log.notes}>
                          {log.notes}
                        </span>
                      )}
                    </div>
                  )}
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
