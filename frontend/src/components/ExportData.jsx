import React, { useState } from 'react';
import API_BASE_URL from '../config';
import { useToast } from './ToastContext';

const EXPORTS = [
  { key: 'meal-plans', label: 'Meal Plans', desc: 'Dates, meals, servings, calories, macros', icon: '📅', hasDateRange: true },
  { key: 'recipes', label: 'Recipes', desc: 'Your recipes with macros, tags, and source URLs', icon: '📖', hasDateRange: false },
  { key: 'recipes/ingredients', label: 'Recipe Ingredients', desc: 'All ingredients for your recipes', icon: '🥕', hasDateRange: false },
  { key: 'daily-logs', label: 'Daily Logs', desc: 'Weight, sleep, water, steps, notes', icon: '📊', hasDateRange: true },
  { key: 'workouts', label: 'Workouts', desc: 'Exercises, sets, reps, weights, duration', icon: '💪', hasDateRange: true },
];

const ExportData = () => {
  const toast = useToast();
  const [loading, setLoading] = useState({});
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async (key, isZip = false) => {
    setLoading(prev => ({ ...prev, [key]: true }));
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (!isZip && dateRange.from) params.set('from', dateRange.from);
      if (!isZip && dateRange.to) params.set('to', dateRange.to);
      const qs = params.toString() ? `?${params.toString()}` : '';

      const response = await fetch(`${API_BASE_URL}/export/${key}${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const ext = isZip ? 'zip' : 'csv';
      const filename = isZip
        ? `meal-planner-export-${new Date().toISOString().slice(0, 10)}.zip`
        : `${key.replace('/', '-')}.csv`;
      triggerDownload(blob, filename);
      toast(`${isZip ? 'All data' : key} exported successfully`, 'success');
    } catch (err) {
      toast(`Export failed: ${err.message}`, 'error');
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-700 dark:text-slate-200">Export Data</h1>
        <button
          onClick={() => handleExport('all', true)}
          disabled={loading.all}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2"
        >
          {loading.all ? (
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
          )}
          {loading.all ? 'Exporting...' : 'Export All (ZIP)'}
        </button>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Download your data as CSV files. Open them in Google Sheets, Excel, or any spreadsheet app.
      </p>

      {/* Optional date range filter */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Date range (optional — applies to meal plans, logs, workouts)</h3>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500 dark:text-slate-400">From</label>
            <input
              type="date"
              value={dateRange.from}
              onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))}
              className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 dark:bg-slate-700"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500 dark:text-slate-400">To</label>
            <input
              type="date"
              value={dateRange.to}
              onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))}
              className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 dark:bg-slate-700"
            />
          </div>
          {(dateRange.from || dateRange.to) && (
            <button
              onClick={() => setDateRange({ from: '', to: '' })}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Clear dates
            </button>
          )}
        </div>
      </div>

      {/* Export cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {EXPORTS.map(({ key, label, desc, icon, hasDateRange: hdr }) => (
          <div key={key} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 flex flex-col">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{icon}</span>
              <h3 className="font-semibold text-slate-700 dark:text-slate-200">{label}</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 flex-1">{desc}</p>
            {hdr && (dateRange.from || dateRange.to) && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">
                Filtered: {dateRange.from || 'start'} — {dateRange.to || 'now'}
              </p>
            )}
            <button
              onClick={() => handleExport(key)}
              disabled={loading[key]}
              className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-700 dark:text-slate-200 font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading[key] ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Exporting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  Download CSV
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExportData;
