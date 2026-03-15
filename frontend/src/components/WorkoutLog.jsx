import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../config';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const emptySet = (num = 1) => ({
  exercise_id: '',
  set_number: num,
  reps: '',
  weight_kg: '',
  duration_secs: '',
  distance_m: '',
});

// Exercises that support distance tracking (km input, stored as meters)
const DISTANCE_EXERCISES = ['Running', 'Cycling', 'Swimming', 'Walking', 'Rowing Machine', 'Elliptical'];

// Pre-built template suggestions
const PRESET_TEMPLATES = [
  { name: 'Push Day', exerciseNames: ['Bench Press', 'Incline Bench Press', 'Overhead Press', 'Lateral Raise', 'Tricep Pushdown', 'Dips'] },
  { name: 'Pull Day', exerciseNames: ['Deadlift', 'Barbell Row', 'Lat Pulldown', 'Cable Row', 'Dumbbell Curl', 'Pull-ups'] },
  { name: 'Leg Day', exerciseNames: ['Squat', 'Leg Press', 'Romanian Deadlift', 'Lunges'] },
  { name: 'Cardio', exerciseNames: ['Running', 'Cycling', 'Jump Rope'] },
];

const WorkoutLog = () => {
  const [exercises, setExercises] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [date, setDate] = useState(today());
  const [workoutName, setWorkoutName] = useState('');
  const [notes, setNotes] = useState('');
  const [sets, setSets] = useState([emptySet(1)]);

  // New exercise form
  const [showNewExercise, setShowNewExercise] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExCategory, setNewExCategory] = useState('Strength');

  // Template save modal
  const [showTemplateSave, setShowTemplateSave] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // Strava state
  const [stravaStatus, setStravaStatus] = useState({ available: false, connected: false });
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [stravaSyncResult, setStravaSyncResult] = useState(null);
  const [stravaError, setStravaError] = useState('');

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchExercises = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/exercises`, { headers });
      const data = await res.json();
      setExercises(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }, []);

  const fetchWorkouts = useCallback(async () => {
    setLoading(true);
    try {
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const to = today();
      const res = await fetch(`${API_BASE_URL}/workouts?from=${from}&to=${to}`, { headers });
      const data = await res.json();
      setWorkouts(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/workout-templates`, { headers });
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }, []);

  const fetchStravaStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/strava/status`, { headers });
      const data = await res.json();
      setStravaStatus(data);
    } catch { /* ignore */ }
  }, []);

  const handleStravaConnect = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/strava/auth-url`, { headers });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch { /* ignore */ }
  };

  const handleStravaSync = async () => {
    setStravaSyncing(true);
    setStravaSyncResult(null);
    setStravaError('');
    try {
      const res = await fetch(`${API_BASE_URL}/strava/sync`, { method: 'POST', headers });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Sync failed');
      }
      const data = await res.json();
      setStravaSyncResult(data);
      fetchWorkouts();
    } catch (err) {
      setStravaError(err.message);
    }
    setStravaSyncing(false);
  };

  const handleStravaDisconnect = async () => {
    if (!confirm('Disconnect Strava? Previously imported workouts will remain.')) return;
    try {
      await fetch(`${API_BASE_URL}/strava/disconnect`, { method: 'DELETE', headers });
      setStravaStatus({ available: true, connected: false });
      setStravaSyncResult(null);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchExercises();
    fetchWorkouts();
    fetchTemplates();
    fetchStravaStatus();
    // Check for strava callback result in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('strava') === 'connected') {
      setStravaStatus(prev => ({ ...prev, connected: true }));
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('strava') === 'error') {
      setStravaError('Failed to connect Strava. Please try again.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const getExercise = (id) => exercises.find(e => e.id === Number(id));
  const isCardio = (exerciseId) => {
    const ex = getExercise(exerciseId);
    return ex?.category === 'Cardio';
  };
  const hasDistance = (exerciseId) => {
    const ex = getExercise(exerciseId);
    return ex && DISTANCE_EXERCISES.includes(ex.name);
  };

  const updateSet = (idx, field, value) => {
    setSets(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const addSet = () => {
    setSets(prev => [...prev, emptySet(prev.length + 1)]);
  };

  const removeSet = (idx) => {
    setSets(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next.map((s, i) => ({ ...s, set_number: i + 1 }));
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const validSets = sets.filter(s => s.exercise_id);
    if (validSets.length === 0) {
      setError('Add at least one exercise set.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        date,
        name: workoutName || null,
        notes: notes || null,
        sets: validSets.map(s => ({
          exercise_id: Number(s.exercise_id),
          set_number: s.set_number,
          reps: s.reps ? Number(s.reps) : null,
          weight_kg: s.weight_kg ? Number(s.weight_kg) : null,
          duration_secs: s.duration_secs ? Math.round(Number(s.duration_secs) * 60) : null,
          distance_m: s.distance_m ? Math.round(Number(s.distance_m) * 1000) : null,
        })),
      };
      const res = await fetch(`${API_BASE_URL}/workouts`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save workout');
      }
      // Reset form
      setWorkoutName('');
      setNotes('');
      setSets([emptySet(1)]);
      setDate(today());
      fetchWorkouts();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this workout?')) return;
    try {
      await fetch(`${API_BASE_URL}/workouts/${id}`, { method: 'DELETE', headers });
      fetchWorkouts();
    } catch { /* ignore */ }
  };

  const handleCreateExercise = async () => {
    if (!newExName.trim()) return;
    try {
      const res = await fetch(`${API_BASE_URL}/exercises`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: newExName.trim(), category: newExCategory, muscle_groups: [] }),
      });
      if (res.ok) {
        setNewExName('');
        setShowNewExercise(false);
        await fetchExercises();
      }
    } catch { /* ignore */ }
  };

  // --- Template functions ---
  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    const validSets = sets.filter(s => s.exercise_id);
    if (validSets.length === 0) return;

    // Group sets by exercise_id
    const exerciseMap = {};
    for (const s of validSets) {
      if (!exerciseMap[s.exercise_id]) exerciseMap[s.exercise_id] = [];
      exerciseMap[s.exercise_id].push({
        reps: s.reps ? Number(s.reps) : null,
        weight_kg: s.weight_kg ? Number(s.weight_kg) : null,
        duration_secs: s.duration_secs ? Math.round(Number(s.duration_secs) * 60) : null,
        distance_m: s.distance_m ? Math.round(Number(s.distance_m) * 1000) : null,
      });
    }
    const templateExercises = Object.entries(exerciseMap).map(([eid, setsArr]) => ({
      exercise_id: Number(eid),
      sets: setsArr,
    }));

    try {
      const res = await fetch(`${API_BASE_URL}/workout-templates`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: templateName.trim(), exercises: templateExercises }),
      });
      if (res.ok) {
        setTemplateName('');
        setShowTemplateSave(false);
        fetchTemplates();
      }
    } catch { /* ignore */ }
  };

  const handleDeleteTemplate = async (id) => {
    if (!confirm('Delete this template?')) return;
    try {
      await fetch(`${API_BASE_URL}/workout-templates/${id}`, { method: 'DELETE', headers });
      fetchTemplates();
    } catch { /* ignore */ }
  };

  const loadTemplate = (templateExercises, name) => {
    const newSets = [];
    let setNum = 1;
    for (const ex of templateExercises) {
      const exSets = ex.sets || [{}];
      for (const s of exSets) {
        newSets.push({
          exercise_id: String(ex.exercise_id),
          set_number: setNum++,
          reps: s.reps || '',
          weight_kg: s.weight_kg || '',
          duration_secs: s.duration_secs ? (s.duration_secs / 60).toFixed(1).replace(/\.0$/, '') : '',
          distance_m: s.distance_m ? (s.distance_m / 1000).toFixed(2).replace(/\.?0+$/, '') : '',
        });
      }
    }
    if (newSets.length === 0) newSets.push(emptySet(1));
    setSets(newSets);
    if (name) setWorkoutName(name);
  };

  const loadPresetTemplate = (preset) => {
    const newSets = [];
    let setNum = 1;
    for (const exName of preset.exerciseNames) {
      const ex = exercises.find(e => e.name === exName);
      if (!ex) continue;
      // Add 3 default sets for strength/bodyweight, 1 for cardio
      const numSets = ex.category === 'Cardio' ? 1 : 3;
      for (let i = 0; i < numSets; i++) {
        newSets.push({
          exercise_id: String(ex.id),
          set_number: setNum++,
          reps: '',
          weight_kg: '',
          duration_secs: '',
          distance_m: '',
        });
      }
    }
    if (newSets.length === 0) newSets.push(emptySet(1));
    setSets(newSets);
    setWorkoutName(preset.name);
  };

  const formatDate = (d) => {
    const ds = typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
    return new Date(ds + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatDuration = (secs) => {
    if (!secs) return '';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s > 0 ? s + 's' : ''}` : `${s}s`;
  };

  const formatDistance = (meters) => {
    if (!meters) return '';
    const km = Number(meters) / 1000;
    return km >= 1 ? `${km.toFixed(2).replace(/\.?0+$/, '')} km` : `${meters} m`;
  };

  // Group sets by exercise for display
  const groupSets = (setsArr) => {
    const groups = {};
    for (const s of setsArr) {
      const name = s.exercise_name || `Exercise #${s.exercise_id}`;
      if (!groups[name]) groups[name] = { category: s.exercise_category, sets: [] };
      groups[name].sets.push(s);
    }
    return groups;
  };

  const strengthExercises = exercises.filter(e => e.category === 'Strength');
  const bodyweightExercises = exercises.filter(e => e.category === 'Bodyweight');
  const cardioExercises = exercises.filter(e => e.category === 'Cardio');
  const otherExercises = exercises.filter(e => !['Strength', 'Bodyweight', 'Cardio'].includes(e.category));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Workouts</h1>

      {/* Strava Connected Apps */}
      {stravaStatus.available && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
          <h2 className="text-lg font-semibold text-slate-700 mb-3">Connected Apps</h2>
          {stravaStatus.connected ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: '#FC4C02' }}>
                    Strava Connected
                  </span>
                </div>
                <button
                  onClick={handleStravaDisconnect}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Disconnect
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleStravaSync}
                  disabled={stravaSyncing}
                  className="px-4 py-1.5 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors hover:opacity-90"
                  style={{ backgroundColor: '#FC4C02' }}
                >
                  {stravaSyncing ? 'Syncing...' : 'Sync Activities'}
                </button>
                <span className="text-xs text-slate-400">Imports last 30 days of activities</span>
              </div>
              {stravaSyncResult && (
                <p className="text-sm text-green-600">
                  Imported {stravaSyncResult.imported} activit{stravaSyncResult.imported === 1 ? 'y' : 'ies'}
                  {stravaSyncResult.skipped > 0 && `, ${stravaSyncResult.skipped} already imported`}
                  {stravaSyncResult.estimated_steps > 0 && `, ~${stravaSyncResult.estimated_steps.toLocaleString()} steps estimated`}
                </p>
              )}
              {stravaError && <p className="text-sm text-red-600">{stravaError}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={handleStravaConnect}
                className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors hover:opacity-90"
                style={{ backgroundColor: '#FC4C02' }}
              >
                Connect Strava
              </button>
              <p className="text-xs text-slate-400">Import your runs, rides, swims, and walks automatically</p>
            </div>
          )}
        </div>
      )}

      {/* Templates Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-700">Templates</h2>

        {templates.length > 0 ? (
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <span className="text-sm font-medium text-slate-700">{t.name}</span>
                  <span className="ml-2 text-xs text-slate-400">
                    {(t.exercises || []).length} exercise{(t.exercises || []).length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadTemplate(t.exercises, t.name)}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(t.id)}
                    className="px-3 py-1 text-xs text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">No saved templates yet. Try a quick-start split:</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_TEMPLATES.map(p => (
                <button
                  key={p.name}
                  onClick={() => loadPresetTemplate(p)}
                  className="px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 border border-slate-200 font-medium"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Log Workout Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-700">Log Workout</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Workout Name (optional)</label>
            <input
              type="text"
              value={workoutName}
              onChange={e => setWorkoutName(e.target.value)}
              placeholder="e.g. Push Day, Morning Run"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="How did it feel?"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Sets */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-600">Sets</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const validSets = sets.filter(s => s.exercise_id);
                  if (validSets.length === 0) {
                    setError('Add at least one exercise to save as template.');
                    return;
                  }
                  setShowTemplateSave(true);
                }}
                className="text-xs text-green-600 hover:text-green-800 font-medium"
              >
                Save as Template
              </button>
              <button
                type="button"
                onClick={() => setShowNewExercise(!showNewExercise)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                {showNewExercise ? 'Cancel' : '+ New Exercise'}
              </button>
            </div>
          </div>

          {/* Save template modal */}
          {showTemplateSave && (
            <div className="flex flex-col sm:flex-row sm:items-end gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">Template Name</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                  placeholder="e.g. Push Day"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => { setShowTemplateSave(false); setTemplateName(''); }}
                  className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showNewExercise && (
            <div className="flex flex-col sm:flex-row sm:items-end gap-2 p-3 bg-slate-50 rounded-lg">
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">Exercise Name</label>
                <input
                  type="text"
                  value={newExName}
                  onChange={e => setNewExName(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                  placeholder="e.g. Dumbbell Curl"
                />
              </div>
              <div className="w-full sm:w-32">
                <label className="block text-xs text-slate-500 mb-1">Category</label>
                <select
                  value={newExCategory}
                  onChange={e => setNewExCategory(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                >
                  <option value="Strength">Strength</option>
                  <option value="Bodyweight">Bodyweight</option>
                  <option value="Cardio">Cardio</option>
                </select>
              </div>
              <button
                type="button"
                onClick={handleCreateExercise}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          )}

          <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="pb-2 pr-2 w-8">#</th>
                  <th className="pb-2 pr-2">Exercise</th>
                  <th className="pb-2 pr-2 w-20">Reps</th>
                  <th className="pb-2 pr-2 w-24">Weight (kg)</th>
                  <th className="pb-2 pr-2 w-24">Duration (min)</th>
                  <th className="pb-2 pr-2 w-24">Distance (km)</th>
                  <th className="pb-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {sets.map((s, idx) => {
                  const cardio = isCardio(s.exercise_id);
                  const showDist = hasDistance(s.exercise_id);
                  return (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="py-2 pr-2 text-slate-400">{s.set_number}</td>
                      <td className="py-2 pr-2">
                        <select
                          value={s.exercise_id}
                          onChange={e => updateSet(idx, 'exercise_id', e.target.value)}
                          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                        >
                          <option value="">Select exercise...</option>
                          {strengthExercises.length > 0 && (
                            <optgroup label="Strength">
                              {strengthExercises.map(e => (
                                <option key={e.id} value={e.id}>{e.name}</option>
                              ))}
                            </optgroup>
                          )}
                          {bodyweightExercises.length > 0 && (
                            <optgroup label="Bodyweight">
                              {bodyweightExercises.map(e => (
                                <option key={e.id} value={e.id}>{e.name}</option>
                              ))}
                            </optgroup>
                          )}
                          {cardioExercises.length > 0 && (
                            <optgroup label="Cardio">
                              {cardioExercises.map(e => (
                                <option key={e.id} value={e.id}>{e.name}</option>
                              ))}
                            </optgroup>
                          )}
                          {otherExercises.map(e => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-2">
                        {!cardio ? (
                          <input
                            type="number"
                            min="0"
                            value={s.reps}
                            onChange={e => updateSet(idx, 'reps', e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                            placeholder="0"
                          />
                        ) : (
                          <span className="text-slate-300">--</span>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        {!cardio ? (
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={s.weight_kg}
                            onChange={e => updateSet(idx, 'weight_kg', e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                            placeholder="0"
                          />
                        ) : (
                          <span className="text-slate-300">--</span>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        {cardio ? (
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={s.duration_secs}
                            onChange={e => updateSet(idx, 'duration_secs', e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                            placeholder="0"
                          />
                        ) : (
                          <span className="text-slate-300">--</span>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        {showDist ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={s.distance_m}
                            onChange={e => updateSet(idx, 'distance_m', e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                            placeholder="0"
                          />
                        ) : (
                          <span className="text-slate-300">--</span>
                        )}
                      </td>
                      <td className="py-2">
                        {sets.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSet(idx)}
                            className="text-red-400 hover:text-red-600 text-lg leading-none"
                            title="Remove set"
                          >
                            &times;
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addSet}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            + Add Set
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Workout'}
        </button>
      </form>

      {/* Workout History */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
        <h2 className="text-lg font-semibold text-slate-700 mb-4">Recent Workouts (Last 30 Days)</h2>

        {loading ? (
          <div className="animate-pulse space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-4 bg-slate-200 rounded w-24" />
                    <div className="h-4 bg-slate-200 rounded w-32" />
                  </div>
                  <div className="h-3 bg-slate-200 rounded w-12" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-40" />
                  <div className="ml-4 space-y-1.5">
                    <div className="h-3 bg-slate-200 rounded w-48" />
                    <div className="h-3 bg-slate-200 rounded w-44" />
                    <div className="h-3 bg-slate-200 rounded w-52" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : workouts.length === 0 ? (
          <p className="text-sm text-slate-400">No workouts logged yet. Use the form above to get started.</p>
        ) : (
          <div className="space-y-4">
            {workouts.map(w => {
              const groups = groupSets(w.sets || []);
              return (
                <div key={w.id} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-semibold text-slate-700">
                        {formatDate(w.date)}
                      </span>
                      {w.name && (
                        <span className="ml-2 text-sm text-slate-500">-- {w.name}</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(w.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                  {w.notes && (
                    <p className="text-xs text-slate-400 mb-2 italic">{w.notes}</p>
                  )}
                  {Object.keys(groups).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(groups).map(([exName, { category, sets: exSets }]) => (
                        <div key={exName}>
                          <p className="text-sm font-medium text-slate-600">
                            {exName}
                            <span className="ml-1 text-xs text-slate-400">({category || 'Other'})</span>
                          </p>
                          <div className="ml-4 text-xs text-slate-500 space-y-0.5">
                            {exSets.map(s => (
                              <div key={s.id}>
                                {category === 'Cardio' ? (
                                  <>
                                    Set {s.set_number}: {formatDuration(s.duration_secs)}
                                    {s.distance_m ? ` / ${formatDistance(s.distance_m)}` : ''}
                                  </>
                                ) : (
                                  <>Set {s.set_number}: {s.reps} reps{s.weight_kg ? ` @ ${s.weight_kg} kg` : ''}</>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">No sets recorded</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkoutLog;
