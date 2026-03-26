import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import API_BASE_URL from '../config';

const CATEGORIES = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Snacks'];
const DIETARY_TAGS = ['vegan', 'vegetarian', 'gluten-free', 'dairy-free', 'keto', 'low-glycemic', 'high-protein', 'low-carb'];
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'rating', label: 'Rating' },
  { value: 'calories', label: 'Calories (low)' },
];
const VIEW_TABS = ['All Recipes', 'This Week', 'Collections'];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const mealTypeBadgeClass = {
  Breakfast: 'bg-amber-100 text-amber-700',
  Lunch:     'bg-green-100 text-green-700',
  Dinner:    'bg-blue-100 text-blue-700',
  Snacks:    'bg-purple-100 text-purple-700',
};

// Return Monday-Sunday range for the current week
const getCurrentWeekRange = () => {
  const today = new Date();
  const day = today.getDay(); // 0=Sun
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = d => d.toISOString().slice(0, 10);
  return { monday, sunday, mondayStr: fmt(monday), sundayStr: fmt(sunday) };
};

const slugify = (title) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Colour bands for the card header — mirrors MealCalendar mealTypeHeaderBar
const categoryHeaderBar = {
  Breakfast: 'bg-amber-400',
  Lunch:     'bg-green-400',
  Dinner:    'bg-blue-400',
  Snacks:    'bg-purple-400',
};

const categoryBadge = {
  Breakfast: 'bg-amber-100 text-amber-800',
  Lunch:     'bg-green-100 text-green-800',
  Dinner:    'bg-blue-100 text-blue-800',
  Snacks:    'bg-purple-100 text-purple-800',
};

const defaultHeaderBar = 'bg-slate-400';
const defaultBadge = 'bg-slate-100 text-slate-700';

// --- Skeleton card ---
const SkeletonCard = () => (
  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-pulse">
    <div className="h-14 bg-slate-200" />
    <div className="p-4 space-y-3">
      <div className="h-4 bg-slate-200 rounded w-3/4" />
      <div className="h-3 bg-slate-200 rounded w-full" />
      <div className="h-3 bg-slate-200 rounded w-5/6" />
      <div className="h-3 bg-slate-200 rounded w-1/2 mt-1" />
      <div className="flex gap-2 mt-2">
        <div className="h-5 bg-slate-200 rounded-full w-16" />
        <div className="h-5 bg-slate-200 rounded-full w-20" />
      </div>
      <div className="h-8 bg-slate-200 rounded-lg mt-2" />
    </div>
  </div>
);

// --- Recipe card ---
const RecipeCard = ({ recipe, addToMode, onSelect, plannedSlots }) => {
  const category = recipe.category || recipe.meal_type || '';
  const headerBarClass = categoryHeaderBar[category] || defaultHeaderBar;
  const badgeClass = categoryBadge[category] || defaultBadge;

  const calories  = recipe.calories_per_serving ?? recipe.calories ?? null;
  const proteinG  = parseFloat(recipe.protein_per_serving ?? recipe.protein_g) || null;
  const carbsG    = parseFloat(recipe.carbs_per_serving   ?? recipe.carbs_g)   || null;
  const fatG      = parseFloat(recipe.fat_per_serving     ?? recipe.fat_g)     || null;

  const hasMacros = calories != null || proteinG != null || carbsG != null || fatG != null;

  const prepTime  = recipe.prep_time_mins ?? recipe.prep_time_minutes ?? null;
  const cookTime  = recipe.cook_time_mins ?? recipe.cook_time_minutes ?? null;
  const servings  = recipe.servings ?? null;

  // Dietary tags — accept array or comma-separated string
  let tags = [];
  if (Array.isArray(recipe.dietary_tags)) {
    tags = recipe.dietary_tags;
  } else if (typeof recipe.dietary_tags === 'string' && recipe.dietary_tags.trim()) {
    tags = recipe.dietary_tags.split(',').map(t => t.trim()).filter(Boolean);
  }

  const description = recipe.description || recipe.notes || '';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow duration-200 flex flex-col">
      {/* Recipe image or colour header band */}
      {recipe.image_url ? (
        <div className="relative">
          <img
            src={recipe.image_url}
            alt={recipe.title}
            className="w-full h-40 object-cover rounded-t-xl"
            loading="lazy"
            onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling && (e.target.nextElementSibling.style.display = 'flex'); }}
          />
          <div className={`${headerBarClass} px-4 py-3 items-center justify-between`} style={{ display: 'none' }}>
            {category ? (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
                {category}
              </span>
            ) : (
              <span />
            )}
          </div>
          {category && (
            <span className={`absolute top-2 left-2 text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass} bg-opacity-90`}>
              {category}
            </span>
          )}
        </div>
      ) : (
        <div className={`${headerBarClass} px-4 py-3 flex items-center justify-between`}>
          {category ? (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
              {category}
            </span>
          ) : (
            <span />
          )}
        </div>
      )}

      {/* Card body */}
      <div className="p-4 flex flex-col flex-1">
        {/* Title */}
        <h3 className="text-base font-bold text-slate-800 leading-snug mb-1">
          {recipe.name || recipe.title || 'Unnamed Recipe'}
        </h3>

        {/* Planned-this-week badges */}
        {plannedSlots && plannedSlots.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {plannedSlots.map((slot, i) => (
              <span
                key={i}
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${mealTypeBadgeClass[slot.meal_type] || (slot.meal_type && slot.meal_type.startsWith('Snacks') ? mealTypeBadgeClass['Snacks'] : 'bg-slate-100 text-slate-600')}`}
              >
                {slot.dayLabel} {slot.meal_type}
              </span>
            ))}
          </div>
        )}

        {/* Description */}
        {description && (
          <p className="text-sm text-slate-500 line-clamp-3 mb-3 leading-relaxed">
            {description}
          </p>
        )}

        {/* Macro row */}
        {hasMacros && (
          <div className="text-xs text-slate-500 mb-3 font-medium">
            {[
              calories != null      && `${Math.round(calories)}cal`,
              proteinG != null      && `${proteinG}g P`,
              carbsG   != null      && `${carbsG}g C`,
              fatG     != null      && `${fatG}g F`,
            ].filter(Boolean).join(' \u00b7 ')}
          </div>
        )}

        {/* Time + servings footer */}
        {(prepTime != null || cookTime != null || servings != null) && (
          <div className="text-xs text-slate-400 flex items-center gap-3 mb-3">
            {(prepTime != null || cookTime != null) && (
              <span className="flex items-center gap-1">
                {/* Clock icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                </svg>
                {[
                  prepTime != null && `${prepTime}m prep`,
                  cookTime != null && `${cookTime}m cook`,
                ].filter(Boolean).join(' + ')}
              </span>
            )}
            {servings != null && (
              <span className="flex items-center gap-1">
                {/* Users icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {servings} serving{servings !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* Dietary tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.map(tag => (
              <span
                key={tag}
                className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Spacer pushes button to bottom */}
        <div className="flex-1" />

        {/* CTA button(s) */}
        {addToMode ? (
          <div className="mt-2 flex gap-2">
            <Link
              to={`/recipes/${recipe.id}-${slugify(recipe.title)}`}
              className="flex-1 block text-center border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium py-2 rounded-lg transition-colors"
            >
              View
            </Link>
            <button
              onClick={() => onSelect(recipe)}
              className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
            >
              Select
            </button>
          </div>
        ) : (
          <Link
            to={`/recipes/${recipe.id}-${slugify(recipe.title)}`}
            className="mt-2 block w-full text-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
          >
            View Recipe
          </Link>
        )}
      </div>
    </div>
  );
};

// --- Main component ---
const RecipeLibrary = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Read URL params
  const addTo    = searchParams.get('addTo')    || '';
  const mealType = searchParams.get('mealType') || '';
  const addToMode = !!(addTo && mealType);
  const remainCal = parseInt(searchParams.get('remainCal')) || null;
  const remainP   = parseInt(searchParams.get('remainP'))   || null;
  const remainC   = parseInt(searchParams.get('remainC'))   || null;
  const remainF   = parseInt(searchParams.get('remainF'))   || null;
  const hasBudget = remainCal !== null;

  // View tab: "All Recipes" or "This Week"
  const [activeView, setActiveView] = useState(searchParams.get('view') || 'All Recipes');

  // Filter state — initialised from URL
  const [searchInput, setSearchInput]   = useState(searchParams.get('search') || '');
  const [ingredientInput, setIngredientInput] = useState(searchParams.get('ingredient') || '');
  const [activeCategory, setActiveCategory] = useState(
    searchParams.get('category') || (addToMode && mealType ? mealType : 'All')
  );
  const [activeTags, setActiveTags] = useState(() => {
    const t = searchParams.get('tags');
    return t ? t.split(',').filter(Boolean) : [];
  });
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || (hasBudget ? 'calories' : 'newest'));
  const [showOverBudget, setShowOverBudget] = useState(!hasBudget); // default: hide over-budget when budget exists

  // Data state
  const [recipes, setRecipes]   = useState([]);
  const [ratings, setRatings]   = useState({});
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  // This Week state
  const [weekMealPlans, setWeekMealPlans] = useState([]);
  const [weekLoading, setWeekLoading] = useState(false);

  // Collections state
  const [userCollections, setUserCollections] = useState([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [activeCollection, setActiveCollection] = useState(null);
  const [collectionRecipes, setCollectionRecipes] = useState([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [creatingCollection, setCreatingCollection] = useState(false);

  // Debounced search terms (avoid a fetch on every keypress)
  const [debouncedSearch, setDebouncedSearch] = useState(searchInput);
  const [debouncedIngredient, setDebouncedIngredient] = useState(ingredientInput);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Sync URL params when filters change
  useEffect(() => {
    const params = {};
    if (debouncedSearch)           params.search   = debouncedSearch;
    if (activeCategory !== 'All')  params.category = activeCategory;
    if (activeView !== 'All Recipes') params.view  = activeView;
    if (addTo)                     params.addTo    = addTo;
    if (mealType)                  params.mealType = mealType;
    setSearchParams(params, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, activeCategory, activeView]);

  // Fetch recipes
  const fetchRecipes = useCallback(() => {
    setLoading(true);
    setError('');

    const params = {};
    if (debouncedSearch)          params.search   = debouncedSearch;
    if (activeCategory !== 'All') params.category = activeCategory;

    const token = localStorage.getItem('token');
    axios
      .get(`${API_BASE_URL}/recipes`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        params,
      })
      .then(res => {
        setRecipes(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        setError('Failed to load recipes. Please try again.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [debouncedSearch, activeCategory]);

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  // Fetch this week's meal plans when "This Week" tab is active
  useEffect(() => {
    if (activeView !== 'This Week') return;

    const token = localStorage.getItem('token');
    if (!token) return;

    setWeekLoading(true);
    const { monday, sunday } = getCurrentWeekRange();

    // The API requires year+month. The week might span two months, so fetch both if needed.
    const monthsToFetch = new Set();
    monthsToFetch.add(`${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}`);
    monthsToFetch.add(`${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}`);

    const requests = [...monthsToFetch].map(ym => {
      const [year, month] = ym.split('-');
      return axios.get(`${API_BASE_URL}/meal-plans`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { year, month },
      }).then(r => r.data).catch(() => []);
    });

    Promise.all(requests)
      .then(results => {
        const allPlans = results.flat();
        // Filter to only this week's date range
        const { mondayStr, sundayStr } = getCurrentWeekRange();
        const weekPlans = allPlans.filter(p => {
          const d = typeof p.date === 'string' ? p.date.slice(0, 10) : p.date;
          return d >= mondayStr && d <= sundayStr;
        });
        setWeekMealPlans(weekPlans);
      })
      .finally(() => setWeekLoading(false));
  }, [activeView]);

  // Fetch collections when "Collections" tab is active
  const fetchCollections = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setCollectionsLoading(true);
    axios.get(`${API_BASE_URL}/collections`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => {
      setUserCollections(res.data || []);
    }).catch(() => {})
    .finally(() => setCollectionsLoading(false));
  }, []);

  useEffect(() => {
    if (activeView !== 'Collections') return;
    fetchCollections();
  }, [activeView, fetchCollections]);

  const handleViewCollection = (col) => {
    setActiveCollection(col);
    setCollectionLoading(true);
    const token = localStorage.getItem('token');
    axios.get(`${API_BASE_URL}/collections/${col.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => {
      setCollectionRecipes(res.data.recipes || []);
    }).catch(() => {})
    .finally(() => setCollectionLoading(false));
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;
    setCreatingCollection(true);
    const token = localStorage.getItem('token');
    try {
      await axios.post(`${API_BASE_URL}/collections`, {
        name: newCollectionName.trim(),
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNewCollectionName('');
      fetchCollections();
    } catch { /* silent */ }
    setCreatingCollection(false);
  };

  const handleDeleteCollection = async (colId) => {
    if (!window.confirm('Delete this collection? Recipes will not be deleted.')) return;
    const token = localStorage.getItem('token');
    try {
      await axios.delete(`${API_BASE_URL}/collections/${colId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (activeCollection && activeCollection.id === colId) {
        setActiveCollection(null);
        setCollectionRecipes([]);
      }
      fetchCollections();
    } catch { /* silent */ }
  };

  // Build a map: recipe_id -> [{ dayLabel, meal_type }]
  const weekRecipeSlots = {};
  if (activeView === 'This Week') {
    for (const plan of weekMealPlans) {
      if (!plan.recipe_id) continue;
      if (!weekRecipeSlots[plan.recipe_id]) weekRecipeSlots[plan.recipe_id] = [];
      const dateStr = typeof plan.date === 'string' ? plan.date.slice(0, 10) : plan.date;
      const dateObj = new Date(dateStr + 'T00:00:00');
      const dayLabel = DAY_LABELS[dateObj.getDay()];
      weekRecipeSlots[plan.recipe_id].push({ dayLabel, meal_type: plan.meal_type });
    }
  }

  // For "This Week", filter recipes to only those with planned slots
  const weekRecipeIds = new Set(Object.keys(weekRecipeSlots).map(Number));
  let displayedRecipes = activeView === 'This Week'
    ? recipes.filter(r => weekRecipeIds.has(r.id))
    : recipes;

  // Dietary tag filtering
  if (activeTags.length > 0) {
    displayedRecipes = displayedRecipes.filter(r => {
      const recipeTags = Array.isArray(r.dietary_tags)
        ? r.dietary_tags
        : typeof r.dietary_tags === 'string' && r.dietary_tags.trim()
          ? r.dietary_tags.split(',').map(t => t.trim())
          : [];
      return activeTags.every(tag => recipeTags.includes(tag));
    });
  }

  // Budget filtering: hide recipes over remaining calories (unless overridden)
  const overBudgetCount = hasBudget && !showOverBudget
    ? displayedRecipes.filter(r => (r.calories_per_serving || 0) > remainCal).length
    : 0;
  if (hasBudget && !showOverBudget) {
    displayedRecipes = displayedRecipes.filter(r => (r.calories_per_serving || 0) <= remainCal);
  }

  const isThisWeekLoading = activeView === 'This Week' && (loading || weekLoading);

  // Handle "Select" in add-to-plan mode — save meal plan then navigate back
  const handleSelect = async (recipe) => {
    const token = localStorage.getItem('token');
    try {
      await axios.post(
        `${API_BASE_URL}/meal-plans/from-recipe`,
        { date: addTo, meal_type: mealType, recipe_id: recipe.id, servings: recipe.servings || 1 },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error('Failed to save meal plan:', err);
    }
    navigate(`/calendar`);
  };

  // Handle category tab click
  const handleCategoryClick = (cat) => {
    setActiveCategory(cat);
  };

  // Handle search input change
  const handleSearchChange = (e) => {
    setSearchInput(e.target.value);
  };

  // Cancel add-to-plan mode
  const handleCancel = () => {
    navigate('/calendar');
  };

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Recipe Library</h1>
          <p className="text-sm text-slate-500 mt-0.5">Browse and discover recipes</p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <Link
            to="/recipes/create"
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 border-2 border-blue-600 text-blue-600 hover:bg-blue-50 text-sm font-semibold rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create
          </Link>
          <Link
            to="/recipes/import"
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Import
          </Link>
        </div>
      </div>

      {/* Add-to-plan banner */}
      {addToMode && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl px-5 py-3 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-teal-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
              </svg>
              <p className="text-sm font-medium text-teal-800 truncate">
                Picking <span className="font-bold">{mealType.startsWith('Snacks-') ? 'Snack ' + mealType.split('-')[1] : mealType}</span> for{' '}
                <span className="font-bold">{addTo}</span> — select a recipe below
              </p>
            </div>
            <button
              onClick={handleCancel}
              className="shrink-0 text-sm font-medium text-teal-700 hover:text-teal-900 border border-teal-300 hover:border-teal-500 bg-white px-3 py-1 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
          {hasBudget && (
            <div className="flex flex-wrap gap-3 text-xs text-teal-700">
              <span>Remaining budget:</span>
              <span className="font-semibold">{remainCal} cal</span>
              {remainP !== null && <span>{remainP}g P</span>}
              {remainC !== null && <span>{remainC}g C</span>}
              {remainF !== null && <span>{remainF}g F</span>}
              <span className="text-teal-500">(sorted by lowest calories first)</span>
            </div>
          )}
        </div>
      )}

      {/* View toggle: All Recipes | This Week */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {VIEW_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveView(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeView === tab
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Collections view */}
      {activeView === 'Collections' && (
        <div className="space-y-5">
          {/* Collection list or single collection view */}
          {activeCollection ? (
            <div className="space-y-5">
              {/* Back to collections + collection name */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setActiveCollection(null); setCollectionRecipes([]); }}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Collections
                </button>
              </div>
              <h2 className="text-xl font-bold text-slate-800">{activeCollection.name}</h2>

              {collectionLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : collectionRecipes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  <p className="text-slate-500 font-medium">No recipes in this collection yet</p>
                  <p className="text-slate-400 text-sm mt-1">Save recipes from the recipe detail page</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {collectionRecipes.map(recipe => (
                    <RecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      addToMode={false}
                      onSelect={() => {}}
                      plannedSlots={null}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Create collection row */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="New collection name..."
                  value={newCollectionName}
                  onChange={e => setNewCollectionName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateCollection()}
                  className="flex-1 max-w-xs border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                />
                <button
                  onClick={handleCreateCollection}
                  disabled={!newCollectionName.trim() || creatingCollection}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  Create Collection
                </button>
              </div>

              {/* Collection cards */}
              {collectionsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : userCollections.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  <p className="text-slate-500 font-medium">No collections yet</p>
                  <p className="text-slate-400 text-sm mt-1">Create a collection to start saving recipes</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {userCollections.map(col => (
                    <div
                      key={col.id}
                      className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow duration-200 cursor-pointer"
                    >
                      <div className="bg-gradient-to-r from-blue-400 to-blue-500 px-4 py-3 flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">{col.recipe_count} recipe{col.recipe_count !== 1 ? 's' : ''}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteCollection(col.id); }}
                          className="text-white/70 hover:text-white transition-colors"
                          title="Delete collection"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                      <div className="p-4" onClick={() => handleViewCollection(col)}>
                        <h3 className="text-base font-bold text-slate-800 mb-1">{col.name}</h3>
                        <p className="text-xs text-slate-400">
                          Created {new Date(col.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Search + category filters */}
      {activeView !== 'Collections' && <div className="space-y-3">
        {/* Search bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search recipes..."
            value={searchInput}
            onChange={handleSearchChange}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Clear search"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => handleCategoryClick(cat)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-blue-400'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Dietary tag filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {DIETARY_TAGS.map(tag => (
            <button
              key={tag}
              onClick={() =>
                setActiveTags(prev =>
                  prev.includes(tag)
                    ? prev.filter(t => t !== tag)
                    : [...prev, tag]
                )
              }
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                activeTags.includes(tag)
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-white border border-slate-300 text-slate-500 hover:bg-slate-50 hover:border-teal-400'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>}

      {/* Error state */}
      {activeView !== 'Collections' && error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Recipe grid */}
      {activeView !== 'Collections' && (
      (isThisWeekLoading || loading) ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : displayedRecipes.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-14 h-14 text-slate-300 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <p className="text-slate-500 font-medium">
            {hasBudget && !showOverBudget && overBudgetCount > 0
              ? `All ${overBudgetCount} matching recipes exceed your remaining ${remainCal} cal budget.`
              : activeView === 'This Week'
                ? 'No recipes planned this week.'
                : 'No recipes found.'}
          </p>
          {hasBudget && !showOverBudget && overBudgetCount > 0 ? (
            <button
              onClick={() => setShowOverBudget(true)}
              className="mt-3 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Show all recipes anyway
            </button>
          ) : (
          <>
            <p className="text-slate-400 text-sm mt-1">
              {activeView === 'This Week'
                ? 'Add recipes to your meal plan from the calendar.'
                : 'Try a different search or category.'}
            </p>
            {(searchInput || activeCategory !== 'All') && (
              <button
                onClick={() => { setSearchInput(''); setActiveCategory('All'); }}
                className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium underline-offset-2 hover:underline"
              >
                Clear filters
              </button>
            )}
          </>
          )}
        </div>
      ) : (
        <>
        {hasBudget && !showOverBudget && overBudgetCount > 0 && (
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4">
            <p className="text-sm text-amber-800">
              {overBudgetCount} recipe{overBudgetCount !== 1 ? 's' : ''} hidden (over {remainCal} cal budget)
            </p>
            <button
              onClick={() => setShowOverBudget(true)}
              className="text-sm font-medium text-amber-700 hover:text-amber-900 underline"
            >
              Show all
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayedRecipes.map(recipe => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              addToMode={addToMode}
              onSelect={handleSelect}
              plannedSlots={weekRecipeSlots[recipe.id] || null}
            />
          ))}
        </div>
        </>
      )
      )}
    </div>
  );
};

export default RecipeLibrary;
