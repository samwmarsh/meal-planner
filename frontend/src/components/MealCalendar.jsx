import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import API_BASE_URL from '../config';
import { useToast } from './ToastContext';

const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

const isSnackType = (type) => type === 'Snacks' || type.startsWith('Snacks-');
const getSnackLabel = (type) => type === 'Snacks' ? 'Snack 1' : 'Snack ' + type.split('-')[1];
const getMealTypeLabel = (type) => isSnackType(type) ? getSnackLabel(type) : type;

const mealTypeBadge = {
  Breakfast: 'bg-amber-100 text-amber-800',
  Lunch:     'bg-green-100 text-green-800',
  Dinner:    'bg-blue-100 text-blue-800',
  Snacks:    'bg-purple-100 text-purple-800',
};
const getBadgeClass = (type) => mealTypeBadge[type] || (isSnackType(type) ? mealTypeBadge['Snacks'] : '');

const mealTypeHeaderBar = {
  Breakfast: 'bg-amber-400',
  Lunch:     'bg-green-400',
  Dinner:    'bg-blue-400',
  Snacks:    'bg-purple-400',
};
const getHeaderBarClass = (type) => mealTypeHeaderBar[type] || (isSnackType(type) ? mealTypeHeaderBar['Snacks'] : '');

// iCal time config
const mealICalTimes = {
  Breakfast: { start: '080000', end: '083000' },
  Lunch:     { start: '123000', end: '133000' },
  Dinner:    { start: '183000', end: '193000' },
  Snacks:    { start: '150000', end: '153000' },
};
const getICalTimes = (type) => {
  if (mealICalTimes[type]) return mealICalTimes[type];
  if (isSnackType(type)) {
    const idx = parseInt(type.split('-')[1]) || 2;
    const mins = (idx - 1) * 30;
    const startH = 15 + Math.floor(mins / 60);
    const startM = mins % 60;
    const endH = startH;
    const endM = startM + 30;
    return {
      start: `${String(startH).padStart(2,'0')}${String(startM).padStart(2,'0')}00`,
      end: `${String(endM >= 60 ? endH + 1 : endH).padStart(2,'0')}${String(endM % 60).padStart(2,'0')}00`,
    };
  }
  return { start: '150000', end: '153000' };
};

// Get next available snack slot for a date
const getNextSnackSlot = (meals, dateKey) => {
  const dayMeals = meals[dateKey] || {};
  if (!dayMeals['Snacks']) return 'Snacks';
  let i = 2;
  while (dayMeals[`Snacks-${i}`]) i++;
  return `Snacks-${i}`;
};

// Check if any snack slot is filled for a day
const hasAnySnack = (meals, dateKey) => {
  const dayMeals = meals[dateKey] || {};
  return Object.keys(dayMeals).some(isSnackType);
};

// Get effective meal slots for a day (fixed types + dynamic snack slots)
const getMealSlotsForDay = (meals, dateKey) => {
  const dayMeals = meals[dateKey] || {};
  const snackSlots = Object.keys(dayMeals).filter(isSnackType).sort((a, b) => {
    const numA = a === 'Snacks' ? 1 : parseInt(a.split('-')[1]) || 0;
    const numB = b === 'Snacks' ? 1 : parseInt(b.split('-')[1]) || 0;
    return numA - numB;
  });
  const snacks = snackSlots.length > 0 ? snackSlots : ['Snacks'];
  return ['Breakfast', 'Lunch', 'Dinner', ...snacks];
};

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year, month) {
  return new Date(year, month, 1).getDay();
}

// Returns Monday of the week containing the given date
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Returns an array of 7 Date objects for Mon–Sun of the week
function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function dateToKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Format date as YYYYMMDD for iCal
function dateToICalDate(dateKey) {
  return dateKey.replace(/-/g, '');
}

// ── Inline TDEE calc (mirrors Dashboard logic) ──────────────────────────────
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

const MealCalendar = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const navigate = useNavigate();
  const toast = useToast();

  // View: 'month' | 'week' | 'day'
  const [view, setView] = useState('week');

  // Month view state
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  // Week view state
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today));

  // Day view state
  const [dayDate, setDayDate] = useState(() => new Date(today));

  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = getFirstDayOfWeek(year, month);

  // meals: { [dateKey]: { Breakfast: { meal_id, meal_name, calories, protein_g, carbs_g, fat_g, servings }, ... } }
  const [meals, setMeals] = useState({});
  // mealOptions: { [type]: [{ id, name, calories, protein_g, carbs_g, fat_g }, ...] }
  const [mealOptions, setMealOptions] = useState({
    Breakfast: [],
    Lunch: [],
    Dinner: [],
    Snacks: [],
  });

  // Copy previous week loading state
  const [copying, setCopying] = useState(false);

  // Template state
  const [templates, setTemplates] = useState([]);
  const [showTemplateSave, setShowTemplateSave] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);

  // Calorie + macro targets from user profile
  const [calorieTarget, setCalorieTarget] = useState(null);
  const [macroTargets, setMacroTargets] = useState(null); // { proteinG, carbsG, fatG }

  // Fetch user profile on mount and compute targets
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${API_BASE_URL}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(profile => {
        if (profile && !profile.error) {
          const weightKg = profile.latest_weight_kg ?? null;
          const target = getCalorieTarget(profile, weightKg);
          if (target) {
            setCalorieTarget(target);
            const proteinPct = parseFloat(profile.protein_pct) || 30;
            const carbsPct = parseFloat(profile.carbs_pct) || 40;
            const fatPct = parseFloat(profile.fat_pct) || 30;
            const proteinG = weightKg ? Math.round(weightKg * 2.0) : Math.round((target * (proteinPct / 100)) / 4);
            const carbsG = Math.round((target * (carbsPct / 100)) / 4);
            const fatG = Math.round((target * (fatPct / 100)) / 9);
            setMacroTargets({ proteinG, carbsG, fatG });
          }
        }
      })
      .catch(() => {/* silent */});
  }, []);

  // Return a subtle background + border class based on how close daily calories are to target
  const getDayCalorieColor = (dateKey) => {
    if (!calorieTarget) return '';
    const totals = getDailyTotals(dateKey);
    if (!totals || totals.calories === 0) return '';
    const ratio = totals.calories / calorieTarget;
    if (ratio >= 0.9 && ratio <= 1.1) return 'bg-green-50 border-green-200';
    if (ratio >= 0.75 && ratio <= 1.25) return 'bg-amber-50 border-amber-200';
    return 'bg-red-50 border-red-200';
  };

  // Contextual popup state: { dateKey, type, x, y } or null
  const [activePopup, setActivePopup] = useState(null);
  const popupRef = useRef(null);

  // Close popup on outside click
  useEffect(() => {
    if (!activePopup) return;
    const handleOutsideClick = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setActivePopup(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [activePopup]);

  // --- Month navigation ---
  const goToPrevMonth = () => {
    setMonth(prev => {
      if (prev === 0) { setYear(y => y - 1); return 11; }
      return prev - 1;
    });
  };
  const goToNextMonth = () => {
    setMonth(prev => {
      if (prev === 11) { setYear(y => y + 1); return 0; }
      return prev + 1;
    });
  };

  // --- Week navigation ---
  const goToPrevWeek = () => {
    setWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };
  const goToNextWeek = () => {
    setWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };
  const goToThisWeek = () => setWeekStart(getWeekStart(today));

  // --- Copy previous week's meals into current week ---
  const copyPreviousWeek = async () => {
    setCopying(true);
    try {
      const prevWeekStart = new Date(weekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekDays = getWeekDays(prevWeekStart);

      // Fetch previous week's meal plans (may span two months)
      const prevStartDate = prevWeekDays[0];
      const prevEndDate = prevWeekDays[6];
      const fetches = [fetchAndMergeMeals(prevStartDate.getFullYear(), prevStartDate.getMonth())];
      if (
        prevStartDate.getMonth() !== prevEndDate.getMonth() ||
        prevStartDate.getFullYear() !== prevEndDate.getFullYear()
      ) {
        fetches.push(fetchAndMergeMeals(prevEndDate.getFullYear(), prevEndDate.getMonth()));
      }
      const results = await Promise.all(fetches);
      const prevMeals = {};
      results.forEach(r => Object.assign(prevMeals, r));

      // Collect meal plans from previous week only
      const plansToCreate = [];
      prevWeekDays.forEach((prevDate, i) => {
        const prevKey = dateToKey(prevDate);
        const currentDate = weekDays[i];
        const currentKey = dateToKey(currentDate);
        const dayMeals = prevMeals[prevKey];
        if (!dayMeals) return;
        Object.entries(dayMeals).forEach(([mealType, entry]) => {
          plansToCreate.push({ date: currentKey, meal_type: mealType, ...entry });
        });
      });

      if (plansToCreate.length === 0) {
        toast('No meals found in previous week', 'info');
        setCopying(false);
        return;
      }

      // Save each meal plan
      const token = localStorage.getItem('token');
      await Promise.all(
        plansToCreate.map(plan => {
          if (plan.recipe_id) {
            return axios.post(
              `${API_BASE_URL}/meal-plans/from-recipe`,
              { date: plan.date, meal_type: plan.meal_type, recipe_id: plan.recipe_id, servings: plan.servings || 1 },
              { headers: { Authorization: `Bearer ${token}` } }
            );
          }
          return axios.post(
            `${API_BASE_URL}/meal-plans`,
            { date: plan.date, meal_type: plan.meal_type, meal_id: plan.meal_id || null, servings: plan.servings || 1 },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        })
      );

      // Re-fetch current week to refresh the view
      const currentWeekDays = getWeekDays(weekStart);
      const startDate = currentWeekDays[0];
      const endDate = currentWeekDays[6];
      const refreshFetches = [fetchAndMergeMeals(startDate.getFullYear(), startDate.getMonth())];
      if (
        startDate.getMonth() !== endDate.getMonth() ||
        startDate.getFullYear() !== endDate.getFullYear()
      ) {
        refreshFetches.push(fetchAndMergeMeals(endDate.getFullYear(), endDate.getMonth()));
      }
      const refreshResults = await Promise.all(refreshFetches);
      const merged = {};
      refreshResults.forEach(r => Object.assign(merged, r));
      setMeals(merged);
    } catch (err) {
      console.error('Failed to copy previous week:', err);
      toast('Failed to copy previous week meals', 'error');
    } finally {
      setCopying(false);
    }
  };

  // --- Templates ---
  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_BASE_URL}/meal-plan-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTemplates(res.data);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const saveAsTemplate = async () => {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    try {
      const token = localStorage.getItem('token');
      const currentWeekDays = getWeekDays(weekStart);
      const slots = [];
      currentWeekDays.forEach((date, dayOffset) => {
        const dateKey = dateToKey(date);
        const dayMeals = meals[dateKey];
        if (!dayMeals) return;
        Object.entries(dayMeals).forEach(([mealType, entry]) => {
          slots.push({
            day_offset: dayOffset,
            meal_type: mealType,
            meal_id: entry.meal_id || null,
            recipe_id: entry.recipe_id || null,
            servings: entry.servings || 1,
          });
        });
      });
      if (slots.length === 0) {
        toast('No meals in current week to save', 'error');
        setSavingTemplate(false);
        return;
      }
      await axios.post(
        `${API_BASE_URL}/meal-plan-templates`,
        { name: templateName.trim(), slots },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast(`Template "${templateName.trim()}" saved`);
      setTemplateName('');
      setShowTemplateSave(false);
      fetchTemplates();
    } catch (err) {
      console.error('Failed to save template:', err);
      toast('Failed to save template', 'error');
    } finally {
      setSavingTemplate(false);
    }
  };

  const applyTemplate = async (templateId) => {
    setApplyingTemplate(true);
    try {
      const token = localStorage.getItem('token');
      const weekStartStr = dateToKey(weekStart);
      await axios.post(
        `${API_BASE_URL}/meal-plan-templates/${templateId}/apply`,
        { weekStart: weekStartStr },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Refresh current week
      const currentWeekDays = getWeekDays(weekStart);
      const startDate = currentWeekDays[0];
      const endDate = currentWeekDays[6];
      const refreshFetches = [fetchAndMergeMeals(startDate.getFullYear(), startDate.getMonth())];
      if (startDate.getMonth() !== endDate.getMonth() || startDate.getFullYear() !== endDate.getFullYear()) {
        refreshFetches.push(fetchAndMergeMeals(endDate.getFullYear(), endDate.getMonth()));
      }
      const refreshResults = await Promise.all(refreshFetches);
      const merged = {};
      refreshResults.forEach(r => Object.assign(merged, r));
      setMeals(merged);
      toast('Template applied to current week');
    } catch (err) {
      console.error('Failed to apply template:', err);
      toast('Failed to apply template', 'error');
    } finally {
      setApplyingTemplate(false);
    }
  };

  const deleteTemplate = async (templateId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/meal-plan-templates/${templateId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchTemplates();
      toast('Template deleted');
    } catch (err) {
      console.error('Failed to delete template:', err);
      toast('Failed to delete template', 'error');
    }
  };

  // --- Day navigation ---
  const goToPrevDay = () => {
    setDayDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      return d;
    });
  };
  const goToNextDay = () => {
    setDayDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 1);
      return d;
    });
  };
  const goToToday = () => setDayDate(new Date(today));

  // Load meal options on mount
  useEffect(() => {
    axios.get(`${API_BASE_URL}/meals`).then(res => {
      const grouped = { Breakfast: [], Lunch: [], Dinner: [], Snacks: [] };
      res.data.forEach(meal => {
        if (grouped[meal.type]) {
          grouped[meal.type].push({
            id: meal.id,
            name: meal.name,
            calories: meal.calories,
            protein_g: parseFloat(meal.protein_g),
            carbs_g: parseFloat(meal.carbs_g),
            fat_g: parseFloat(meal.fat_g),
          });
        }
      });
      setMealOptions(grouped);
    });
  }, []);

  // Helper: fetch meal plans for a year+month combo and merge into state
  const fetchAndMergeMeals = (fetchYear, fetchMonth) => {
    const token = localStorage.getItem('token');
    return axios
      .get(`${API_BASE_URL}/meal-plans`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { year: fetchYear, month: String(fetchMonth + 1).padStart(2, '0') },
      })
      .then(res => {
        const loaded = {};
        res.data.forEach(plan => {
          const dateKey = plan.date.slice(0, 10);
          if (!loaded[dateKey]) loaded[dateKey] = {};
          if (plan.meal_id || plan.recipe_id) {
            loaded[dateKey][plan.meal_type] = {
              meal_id: plan.meal_id || null,
              recipe_id: plan.recipe_id || null,
              meal_name: plan.meal_name,
              calories: plan.calories !== null ? Number(plan.calories) : 0,
              protein_g: plan.protein_g !== null ? parseFloat(plan.protein_g) : 0,
              carbs_g: plan.carbs_g !== null ? parseFloat(plan.carbs_g) : 0,
              fat_g: plan.fat_g !== null ? parseFloat(plan.fat_g) : 0,
              servings: plan.servings !== null ? parseFloat(plan.servings) : 1,
            };
          }
        });
        return loaded;
      });
  };

  // Load meal plans for month view
  useEffect(() => {
    if (view !== 'month') return;
    fetchAndMergeMeals(year, month).then(loaded => setMeals(loaded));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, view]);

  // Load meal plans for week view (may span two months)
  useEffect(() => {
    if (view !== 'week') return;
    const weekDays = getWeekDays(weekStart);
    const startDate = weekDays[0];
    const endDate = weekDays[6];

    const fetches = [];
    fetches.push(fetchAndMergeMeals(startDate.getFullYear(), startDate.getMonth()));
    // If week spans two months, fetch the second one too
    if (
      startDate.getMonth() !== endDate.getMonth() ||
      startDate.getFullYear() !== endDate.getFullYear()
    ) {
      fetches.push(fetchAndMergeMeals(endDate.getFullYear(), endDate.getMonth()));
    }

    Promise.all(fetches).then(results => {
      const merged = {};
      results.forEach(r => Object.assign(merged, r));
      setMeals(merged);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, view]);

  // Load meal plans for day view (may need adjacent month if near boundary)
  useEffect(() => {
    if (view !== 'day') return;
    fetchAndMergeMeals(dayDate.getFullYear(), dayDate.getMonth()).then(loaded =>
      setMeals(loaded)
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayDate, view]);

  const saveMealPlan = (dateKey, type, meal_id, servings) => {
    const token = localStorage.getItem('token');
    axios.post(
      `${API_BASE_URL}/meal-plans`,
      { date: dateKey, meal_type: type, meal_id: meal_id || null, servings },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  };

  // Called to remove a meal slot
  const handleMealChange = (dateKey, type, meal_id, servings) => {
    const optionsKey = isSnackType(type) ? 'Snacks' : type;
    const mealObj = mealOptions[optionsKey].find(m => m.id === meal_id);
    if (!meal_id || !mealObj) {
      setMeals(prev => {
        const dayMeals = { ...(prev[dateKey] || {}) };
        delete dayMeals[type];
        return { ...prev, [dateKey]: dayMeals };
      });
      saveMealPlan(dateKey, type, null, 1);
    } else {
      const srv = parseFloat(servings) || 1;
      setMeals(prev => ({
        ...prev,
        [dateKey]: {
          ...(prev[dateKey] || {}),
          [type]: {
            meal_id: mealObj.id,
            meal_name: mealObj.name,
            calories: Math.round(mealObj.calories * srv),
            protein_g: parseFloat((mealObj.protein_g * srv).toFixed(1)),
            carbs_g: parseFloat((mealObj.carbs_g * srv).toFixed(1)),
            fat_g: parseFloat((mealObj.fat_g * srv).toFixed(1)),
            servings: srv,
          },
        },
      }));
      saveMealPlan(dateKey, type, mealObj.id, srv);
    }
  };

  // Navigate to recipe library for adding a meal to a slot
  const navigateToAddMeal = (dateKey, type) => {
    let url = `/recipes?addTo=${dateKey}&mealType=${type}`;
    // Pass remaining calorie budget so recipe library can sort by fit
    if (calorieTarget) {
      const totals = getDailyTotals(dateKey);
      const usedCal = totals ? totals.calories : 0;
      const remainCal = Math.max(0, calorieTarget - usedCal);
      url += `&remainCal=${remainCal}`;
      if (macroTargets) {
        const usedP = totals ? totals.protein_g : 0;
        const usedC = totals ? totals.carbs_g : 0;
        const usedF = totals ? totals.fat_g : 0;
        url += `&remainP=${Math.max(0, Math.round(macroTargets.proteinG - usedP))}`;
        url += `&remainC=${Math.max(0, Math.round(macroTargets.carbsG - usedC))}`;
        url += `&remainF=${Math.max(0, Math.round(macroTargets.fatG - usedF))}`;
      }
    }
    navigate(url);
  };

  // Open the contextual popup for a filled slot
  const openPopup = (e, dateKey, type) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setActivePopup({
      dateKey,
      type,
      x: rect.left + window.scrollX,
      y: rect.bottom + window.scrollY + 6,
    });
  };

  // Compute daily totals for a dateKey
  const getDailyTotals = (dateKey) => {
    const dayMeals = meals[dateKey];
    if (!dayMeals) return null;
    const entries = Object.values(dayMeals);
    if (entries.length === 0) return null;
    return entries.reduce(
      (acc, m) => ({
        calories: acc.calories + (m.calories || 0),
        protein_g: parseFloat((acc.protein_g + (m.protein_g || 0)).toFixed(1)),
        carbs_g: parseFloat((acc.carbs_g + (m.carbs_g || 0)).toFixed(1)),
        fat_g: parseFloat((acc.fat_g + (m.fat_g || 0)).toFixed(1)),
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
  };

  // Compute monthly summary
  const getWeeklySummary = () => {
    let totalCal = 0;
    let totalProtein = 0;
    let daysWithData = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const totals = getDailyTotals(dateKey);
      if (totals) {
        totalCal += totals.calories;
        totalProtein += totals.protein_g;
        daysWithData++;
      }
    }
    return { totalCal, totalProtein: parseFloat(totalProtein.toFixed(1)), daysWithData };
  };

  // --- iCal export ---
  const buildICalString = (dateKeys) => {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Meal Planner//EN',
    ];

    dateKeys.forEach(dateKey => {
      const dayMeals = meals[dateKey];
      if (!dayMeals) return;
      const icalDate = dateToICalDate(dateKey);
      Object.keys(dayMeals).forEach(type => {
        const entry = dayMeals[type];
        if (!entry) return;
        const times = getICalTimes(type);
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${dateKey}-${type.toLowerCase()}@meal-planner`);
        lines.push(`DTSTART:${icalDate}T${times.start}`);
        lines.push(`DTEND:${icalDate}T${times.end}`);
        lines.push(`SUMMARY:${entry.meal_name}`);
        lines.push(`DESCRIPTION:Calories: ${entry.calories} | Protein: ${entry.protein_g}g | Carbs: ${entry.carbs_g}g | Fat: ${entry.fat_g}g`);
        lines.push('END:VEVENT');
      });
    });

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  };

  const triggerICalDownload = (icsContent, filename) => {
    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportICal = () => {
    let dateKeys = [];
    let filename = 'meal-plan.ics';

    if (view === 'month') {
      for (let d = 1; d <= daysInMonth; d++) {
        dateKeys.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
      filename = `meal-plan-${year}-${String(month + 1).padStart(2, '0')}.ics`;
    } else if (view === 'week') {
      dateKeys = getWeekDays(weekStart).map(d => dateToKey(d));
      filename = `meal-plan-week-${dateToKey(weekStart)}.ics`;
    } else if (view === 'day') {
      dateKeys = [dateToKey(dayDate)];
      filename = `meal-plan-${dateToKey(dayDate)}.ics`;
    }

    const icsContent = buildICalString(dateKeys);
    triggerICalDownload(icsContent, filename);
  };

  // --- Month view helpers ---
  const days = [];
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const isTodayKey = (dateKey) => dateKey === dateToKey(today);

  const weeklySummary = getWeeklySummary();

  // --- Week view ---
  const weekDays = getWeekDays(weekStart);

  // --- Contextual popup component ---
  const renderPopup = () => {
    if (!activePopup) return null;
    const { dateKey, type, x, y } = activePopup;
    const entry = meals[dateKey]?.[type];
    if (!entry) return null;

    return (
      <div
        ref={popupRef}
        className="fixed z-50 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700"
        style={{
          left: x,
          top: y,
          maxWidth: 220,
          minWidth: 180,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-3 pt-3 pb-2">
          {/* Meal name */}
          <div className="text-sm font-semibold text-slate-800 leading-tight mb-1">
            {entry.meal_name}
          </div>
          {/* Macros */}
          <div className="text-xs text-slate-500 space-y-0.5 mb-3">
            <div>{entry.calories} cal</div>
            <div>{entry.protein_g}g protein &middot; {entry.carbs_g}g carbs &middot; {entry.fat_g}g fat</div>
          </div>
          {/* Action buttons */}
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => { setActivePopup(null); navigate(`/recipes/${entry.recipe_id}`); }}
              disabled={!entry.recipe_id}
              className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                entry.recipe_id
                  ? 'text-blue-600 hover:bg-blue-50'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              View Recipe
            </button>
            <button
              onClick={() => {
                setActivePopup(null);
                navigateToAddMeal(dateKey, type);
              }}
              className="w-full text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-blue-400 transition-colors text-left"
            >
              Change
            </button>
            <button
              onClick={() => {
                setActivePopup(null);
                handleMealChange(dateKey, type, null, 1);
              }}
              className="w-full text-xs font-medium px-2.5 py-1.5 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 hover:border-red-400 transition-colors text-left"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    );
  };

  // --- Shared view switcher + export header ---
  const ViewSwitcherAndExport = () => (
    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
      {/* Pill toggle */}
      <div className="flex rounded-lg border border-slate-300 overflow-hidden">
        {['month', 'week', 'day'].map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 text-sm font-medium capitalize transition-colors
              ${view === v
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 border-l border-slate-300 first:border-l-0 hover:bg-slate-50'
              }`}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {/* Export button */}
      <button
        onClick={handleExportICal}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 hover:border-blue-400 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Export .ics
      </button>
    </div>
  );

  // --- Render Month View ---
  const renderMonthView = () => (
    <>
      {/* Month navigation */}
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={goToPrevMonth}
          className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 hover:border-blue-400 transition-colors"
        >
          &larr; Prev
        </button>
        <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 min-w-40 text-center">
          {new Date(year, month).toLocaleString('default', { month: 'long' })} {year}
        </h2>
        <button
          onClick={goToNextMonth}
          className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 hover:border-blue-400 transition-colors"
        >
          Next &rarr;
        </button>
      </div>

      {/* Calendar grid */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-x-auto">
        <div className="min-w-[500px]">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="py-1.5 md:py-2 text-center text-[10px] md:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((day, idx) => {
            if (!day) {
              return <div key={`blank-${idx}`} className="min-h-32 border-b border-r border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900" />;
            }
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const todayCell = isTodayKey(dateKey);
            const dailyTotals = getDailyTotals(dateKey);
            const macroColor = !todayCell ? getDayCalorieColor(dateKey) : '';
            return (
              <div
                key={day}
                className={`min-h-24 md:min-h-32 border-b border-r border-slate-100 dark:border-slate-700 p-1 md:p-2 ${todayCell ? 'bg-blue-50 dark:bg-blue-900/30' : macroColor || 'bg-white dark:bg-slate-800'}`}
              >
                <div className={`text-sm font-semibold mb-1 w-7 h-7 flex items-center justify-center rounded-full ${todayCell ? 'bg-blue-600 text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {getMealSlotsForDay(meals, dateKey).map(type => {
                    const entry = meals[dateKey]?.[type];
                    if (entry) {
                      return (
                        <div
                          key={type}
                          className={`text-xs rounded px-1.5 py-0.5 font-medium cursor-pointer hover:opacity-80 transition-opacity ${getBadgeClass(type)}`}
                          title={`${getMealTypeLabel(type)}: ${entry.meal_name} — click for options`}
                          onClick={(e) => openPopup(e, dateKey, type)}
                        >
                          <div className="truncate">
                            <span className="opacity-70">{isSnackType(type) ? 'S' : type[0]}:</span> {entry.meal_name}
                          </div>
                          <div className="opacity-70">
                            {entry.calories}cal &middot; {entry.protein_g}g P
                          </div>
                        </div>
                      );
                    }
                    // Empty slot: show + button on hover
                    return (
                      <button
                        key={type}
                        onClick={() => navigateToAddMeal(dateKey, type)}
                        className="w-full text-left text-xs rounded px-1.5 py-0.5 border border-dashed border-transparent text-slate-300 hover:border-slate-300 hover:text-slate-400 transition-colors"
                        title={`Add ${getMealTypeLabel(type)}`}
                      >
                        <span className="opacity-0 group-hover:opacity-100">+ {isSnackType(type) ? 'S' : type[0]}</span>
                        <span className="sr-only">Add {getMealTypeLabel(type)}</span>
                      </button>
                    );
                  })}
                  {hasAnySnack(meals, dateKey) && (
                    <button
                      onClick={() => navigateToAddMeal(dateKey, getNextSnackSlot(meals, dateKey))}
                      className="w-full text-left text-xs rounded px-1.5 py-0.5 text-purple-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                      title="Add another snack"
                    >
                      + Snack
                    </button>
                  )}
                </div>
                {dailyTotals && (
                  <div className="mt-1 text-[10px] text-slate-500 leading-tight">
                    <span className="font-medium">{dailyTotals.calories}cal</span>
                    {calorieTarget && (
                      <span className={`ml-0.5 font-semibold ${
                        dailyTotals.calories > calorieTarget * 1.1 ? 'text-red-500' :
                        dailyTotals.calories >= calorieTarget * 0.9 ? 'text-green-600' :
                        'text-amber-500'
                      }`}>
                        ({dailyTotals.calories > calorieTarget ? '+' : ''}{dailyTotals.calories - calorieTarget})
                      </span>
                    )}
                    <br/>{dailyTotals.protein_g}P · {dailyTotals.carbs_g}C · {dailyTotals.fat_g}F
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* Monthly summary bar */}
      {weeklySummary.daysWithData > 0 && (
        <div className="mt-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 px-4 md:px-6 py-4">
          <div className="flex flex-wrap gap-6 items-center">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">This month:</span>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium text-slate-800 dark:text-slate-200">{weeklySummary.totalCal}</span> cal total
            </span>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              avg <span className="font-medium text-slate-800 dark:text-slate-200">{Math.round(weeklySummary.totalCal / weeklySummary.daysWithData)}</span> cal/day
            </span>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium text-slate-800 dark:text-slate-200">{weeklySummary.totalProtein}g</span> protein total
            </span>
          </div>
        </div>
      )}
    </>
  );

  // --- Render Week View ---
  const renderWeekView = () => {
    const weekEnd = weekDays[6];
    const weekLabel = (() => {
      const startStr = weekDays[0].toLocaleDateString('default', { month: 'short', day: 'numeric' });
      const endStr = weekEnd.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${startStr} – ${endStr}`;
    })();

    return (
      <>
        {/* Week navigation */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <button
            onClick={goToPrevWeek}
            className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 hover:border-blue-400 transition-colors"
          >
            &larr; Prev
          </button>
          <h2 className="text-lg md:text-xl font-bold text-slate-700 dark:text-slate-200 text-center flex-1 min-w-0">
            {weekLabel}
          </h2>
          <button
            onClick={goToNextWeek}
            className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 hover:border-blue-400 transition-colors"
          >
            Next &rarr;
          </button>
        </div>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={goToThisWeek}
            className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 hover:border-blue-400 transition-colors"
          >
            This week
          </button>
          <button
            onClick={copyPreviousWeek}
            disabled={copying}
            className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 hover:border-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {copying ? 'Copying...' : 'Copy Previous Week'}
          </button>
        </div>

        {/* Templates bar */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setShowTemplateSave(s => !s)}
            className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 hover:border-blue-400 transition-colors"
          >
            Save as Template
          </button>
          {templates.length > 0 && (
            <div className="relative inline-block">
              <select
                disabled={applyingTemplate}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  if (confirm('Apply this template to the current week? Existing meals in those slots will be overwritten.')) {
                    applyTemplate(val);
                  }
                  e.target.value = '';
                }}
                className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 hover:border-blue-400 transition-colors cursor-pointer disabled:opacity-50"
                defaultValue=""
              >
                <option value="" disabled>{applyingTemplate ? 'Applying...' : 'Apply Template'}</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          {templates.length > 0 && (
            <div className="relative inline-block">
              <select
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  const tpl = templates.find(t => String(t.id) === val);
                  if (tpl && confirm(`Delete template "${tpl.name}"?`)) {
                    deleteTemplate(val);
                  }
                  e.target.value = '';
                }}
                className="px-3 py-1.5 text-sm font-medium bg-white border border-red-200 rounded-lg text-red-600 hover:bg-red-50 hover:border-red-400 transition-colors cursor-pointer"
                defaultValue=""
              >
                <option value="" disabled>Delete Template</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Save template inline form */}
        {showTemplateSave && (
          <div className="flex items-center gap-2 mb-4 bg-white border border-slate-200 rounded-lg px-4 py-3">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveAsTemplate()}
              placeholder="Template name..."
              className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-400"
              autoFocus
            />
            <button
              onClick={saveAsTemplate}
              disabled={savingTemplate || !templateName.trim()}
              className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingTemplate ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => { setShowTemplateSave(false); setTemplateName(''); }}
              className="px-3 py-1.5 text-sm font-medium bg-white border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Week grid */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
          <div className="grid grid-cols-7 min-w-[700px]">
            {weekDays.map(date => {
              const dateKey = dateToKey(date);
              const todayCol = isTodayKey(dateKey);
              const dailyTotals = getDailyTotals(dateKey);
              const shortDay = date.toLocaleDateString('default', { weekday: 'short' });
              const dayNum = date.getDate();

              const macroColor = !todayCol ? getDayCalorieColor(dateKey) : '';

              return (
                <div key={dateKey} className={`border-r border-slate-200 last:border-r-0 flex flex-col ${macroColor}`}>
                  {/* Column header */}
                  <div className={`py-2 px-1 text-center border-b border-slate-200 ${todayCol ? 'bg-blue-600' : 'bg-slate-50'}`}>
                    <div className={`text-xs font-semibold uppercase tracking-wide ${todayCol ? 'text-blue-100' : 'text-slate-500'}`}>
                      {shortDay}
                    </div>
                    <div className={`text-lg font-bold ${todayCol ? 'text-white' : 'text-slate-700'}`}>
                      {dayNum}
                    </div>
                  </div>

                  {/* Meal type rows */}
                  <div className="flex flex-col flex-1 divide-y divide-slate-100">
                    {getMealSlotsForDay(meals, dateKey).map(type => {
                      const entry = meals[dateKey]?.[type];
                      const badge = getBadgeClass(type);
                      const label = isSnackType(type) ? 'S' : type[0];
                      if (entry) {
                        return (
                          <div
                            key={type}
                            className="p-1.5 cursor-pointer hover:bg-blue-50 transition-colors min-h-16"
                            onClick={(e) => openPopup(e, dateKey, type)}
                            title={`${getMealTypeLabel(type)}: ${entry.meal_name} — ${entry.calories}cal · ${entry.protein_g}g P · ${entry.carbs_g}g C · ${entry.fat_g}g F`}
                          >
                            <span className={`text-xs font-semibold px-1 py-0.5 rounded ${badge}`}>
                              {label}
                            </span>
                            <div className="text-xs font-medium text-slate-700 mt-0.5 leading-tight line-clamp-2">
                              {entry.meal_name}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {entry.calories}cal &middot; {entry.protein_g}g P
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={type}
                          className="p-1.5 cursor-pointer hover:bg-slate-50 transition-colors min-h-16 flex flex-col items-center justify-center group"
                          onClick={() => navigateToAddMeal(dateKey, type)}
                          title={`Add ${getMealTypeLabel(type)}`}
                        >
                          <span className={`text-xs font-semibold px-1 py-0.5 rounded ${badge}`}>
                            {label}
                          </span>
                          <div className="text-xs text-slate-300 mt-1 group-hover:text-slate-400 transition-colors">+</div>
                        </div>
                      );
                    })}
                    {/* Add snack button — only when at least one snack exists */}
                    {hasAnySnack(meals, dateKey) && (
                      <div
                        className="p-1.5 cursor-pointer hover:bg-purple-50 transition-colors flex items-center justify-center"
                        onClick={() => navigateToAddMeal(dateKey, getNextSnackSlot(meals, dateKey))}
                        title="Add another snack"
                      >
                        <span className="text-xs text-purple-400 hover:text-purple-600 font-medium">+ Snack</span>
                      </div>
                    )}
                  </div>

                  {/* Daily total footer */}
                  <div
                    className="px-1.5 py-1.5 border-t border-slate-200 bg-slate-50 text-xs text-center space-y-0.5"
                  >
                    {dailyTotals ? (
                      <>
                        <div className="font-medium text-slate-700">
                          {dailyTotals.calories} cal
                          {calorieTarget && (
                            <span className={`ml-1 text-[10px] font-semibold ${
                              dailyTotals.calories > calorieTarget * 1.1 ? 'text-red-500' :
                              dailyTotals.calories >= calorieTarget * 0.9 ? 'text-green-600' :
                              'text-amber-500'
                            }`}>
                              {dailyTotals.calories > calorieTarget ? `+${dailyTotals.calories - calorieTarget}` : `${dailyTotals.calories - calorieTarget}`}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 leading-tight">
                          <span title={macroTargets ? `Target: ${macroTargets.proteinG}g` : ''}>{dailyTotals.protein_g}g P</span>
                          {' · '}
                          <span title={macroTargets ? `Target: ${macroTargets.carbsG}g` : ''}>{dailyTotals.carbs_g}g C</span>
                          {' · '}
                          <span title={macroTargets ? `Target: ${macroTargets.fatG}g` : ''}>{dailyTotals.fat_g}g F</span>
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </>
    );
  };

  // --- Render Day View ---
  const renderDayView = () => {
    const dateKey = dateToKey(dayDate);
    const todayDay = isTodayKey(dateKey);
    const dailyTotals = getDailyTotals(dateKey);
    const dayLabel = dayDate.toLocaleDateString('default', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    return (
      <>
        {/* Day navigation */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <button
            onClick={goToPrevDay}
            className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 hover:border-blue-400 transition-colors"
          >
            &larr; Prev
          </button>
          <h2 className={`text-xl font-bold flex-1 min-w-48 text-center ${todayDay ? 'text-blue-600' : 'text-slate-700'}`}>
            {dayLabel}
          </h2>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 hover:border-blue-400 transition-colors"
          >
            Today
          </button>
          <button
            onClick={goToNextDay}
            className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 hover:border-blue-400 transition-colors"
          >
            Next &rarr;
          </button>
        </div>

        {/* Meal cards */}
        <div className="space-y-3">
          {getMealSlotsForDay(meals, dateKey).map(type => {
            const entry = meals[dateKey]?.[type];
            return (
              <div key={type} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Colour-coded header bar */}
                <div className={`px-4 py-2 ${getHeaderBarClass(type)}`}>
                  <span className="text-sm font-bold text-white">{getMealTypeLabel(type)}</span>
                </div>
                <div className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex-1">
                    {entry ? (
                      <>
                        <div className="text-base font-semibold text-slate-800">{entry.meal_name}</div>
                        <div className="text-sm text-slate-500 mt-1">
                          {entry.calories} cal &middot; {entry.protein_g}g protein &middot; {entry.carbs_g}g carbs &middot; {entry.fat_g}g fat
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-slate-400 italic">Not planned</div>
                    )}
                  </div>
                  {entry ? (
                    <button
                      onClick={(e) => openPopup(e, dateKey, type)}
                      className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 hover:border-blue-400 transition-colors shrink-0"
                    >
                      Options
                    </button>
                  ) : (
                    <button
                      onClick={() => navigateToAddMeal(dateKey, type)}
                      className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 hover:border-blue-400 transition-colors shrink-0"
                    >
                      + Add
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {/* Add snack button — only when at least one snack exists */}
          {hasAnySnack(meals, dateKey) && (
            <button
              onClick={() => navigateToAddMeal(dateKey, getNextSnackSlot(meals, dateKey))}
              className="w-full py-3 text-sm font-medium text-purple-500 hover:text-purple-700 hover:bg-purple-50 bg-white rounded-xl border border-dashed border-purple-300 transition-colors"
            >
              + Add Snack
            </button>
          )}
        </div>

        {/* Daily total card */}
        {dailyTotals && (
          <div className={`mt-4 rounded-xl shadow-sm border px-4 md:px-6 py-4 ${getDayCalorieColor(dateKey) || 'bg-white border-slate-200'}`}>
            <div className="flex flex-wrap gap-x-6 gap-y-2 items-center">
              <span className="text-sm font-semibold text-slate-700">Daily total:</span>
              <span className="text-sm text-slate-600">
                <span className="font-medium text-slate-800">{dailyTotals.calories}</span> cal
                {calorieTarget && (
                  <>
                    <span className="text-slate-400"> / {calorieTarget}</span>
                    <span className={`ml-1 text-xs font-semibold ${
                      dailyTotals.calories > calorieTarget * 1.1 ? 'text-red-500' :
                      dailyTotals.calories >= calorieTarget * 0.9 ? 'text-green-600' :
                      'text-amber-500'
                    }`}>
                      ({dailyTotals.calories > calorieTarget ? '+' : ''}{dailyTotals.calories - calorieTarget})
                    </span>
                  </>
                )}
              </span>
              <span className="text-sm text-slate-600">
                <span className="font-medium text-slate-800">{dailyTotals.protein_g}g</span> protein
                {macroTargets && <span className="text-slate-400 text-xs"> / {macroTargets.proteinG}g</span>}
              </span>
              <span className="text-sm text-slate-600">
                <span className="font-medium text-slate-800">{dailyTotals.carbs_g}g</span> carbs
                {macroTargets && <span className="text-slate-400 text-xs"> / {macroTargets.carbsG}g</span>}
              </span>
              <span className="text-sm text-slate-600">
                <span className="font-medium text-slate-800">{dailyTotals.fat_g}g</span> fat
                {macroTargets && <span className="text-slate-400 text-xs"> / {macroTargets.fatG}g</span>}
              </span>
            </div>
            {calorieTarget && (
              <div className="mt-2 w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    dailyTotals.calories > calorieTarget * 1.1 ? 'bg-red-400' :
                    dailyTotals.calories >= calorieTarget * 0.9 ? 'bg-green-500' :
                    'bg-amber-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.round((dailyTotals.calories / calorieTarget) * 100))}%` }}
                />
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  return (
    <div>
      <ViewSwitcherAndExport />

      {view === 'month' && renderMonthView()}
      {view === 'week' && renderWeekView()}
      {view === 'day' && renderDayView()}

      {renderPopup()}
    </div>
  );
};

export default MealCalendar;
