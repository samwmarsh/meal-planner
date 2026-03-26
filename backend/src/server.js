require('dotenv').config();

const express = require('express');
const cors = require('cors');
const db = require('./db');
const runStartupSeed = require('./startup-seed');
const authRoutes = require('./auth');
const { authenticateToken } = require('./middleware/auth');

// Admin-only middleware — must come after authenticateToken
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost').split(',');
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());

runStartupSeed().catch(err => console.error('[startup-seed] Failed:', err.message));

app.get('/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.json({ status: 'ok', time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed', details: err.message });
  }
});

app.get('/meals', async (req, res) => {
  try {
    const { type } = req.query;
    let query = 'SELECT * FROM meals';
    let params = [];
    if (type) {
      query += ' WHERE type = $1';
      params.push(type);
    }
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch meals', details: err.message });
  }
});

// Get meal plans for a user and month
app.get('/meal-plans', authenticateToken, async (req, res) => {
  try {
    const { year, month } = req.query;
    const userId = req.user.id;
    const lastDay = new Date(year, month, 0).getDate(); // month is 1-based here
    const start = `${year}-${month}-01`;
    const end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    const { rows } = await db.query(
      `SELECT mp.id, mp.user_id, mp.date, mp.meal_type, mp.meal_id, mp.recipe_id, mp.servings,
              COALESCE(m.name, r.title) AS meal_name,
              ROUND(COALESCE(m.calories, r.calories_per_serving) * mp.servings) AS calories,
              ROUND(COALESCE(m.protein_g, r.protein_per_serving) * mp.servings, 1) AS protein_g,
              ROUND(COALESCE(m.carbs_g, r.carbs_per_serving) * mp.servings, 1) AS carbs_g,
              ROUND(COALESCE(m.fat_g, r.fat_per_serving) * mp.servings, 1) AS fat_g
       FROM meal_plans mp
       LEFT JOIN meals m ON mp.meal_id = m.id
       LEFT JOIN recipes r ON mp.recipe_id = r.id
       WHERE mp.user_id = $1 AND mp.date BETWEEN $2 AND $3`,
      [userId, start, end]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch meal plans', details: err.message });
  }
});

// Save/update a meal plan
app.post('/meal-plans', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { date, meal_type, meal_id, servings = 1 } = req.body;
    await db.query(
      `INSERT INTO meal_plans (user_id, date, meal_type, meal_id, servings, last_updated)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, date, meal_type)
       DO UPDATE SET meal_id = EXCLUDED.meal_id, servings = EXCLUDED.servings, last_updated = NOW()`,
      [userId, date, meal_type, meal_id, servings]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save meal plan', details: err.message });
  }
});

// Add a recipe to a meal plan slot
app.post('/meal-plans/from-recipe', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { date, meal_type, recipe_id, servings = 1 } = req.body;
    if (!date || !meal_type || !recipe_id) {
      return res.status(400).json({ error: 'date, meal_type and recipe_id are required' });
    }
    await db.query(
      `INSERT INTO meal_plans (user_id, date, meal_type, recipe_id, meal_id, servings, last_updated)
       VALUES ($1, $2, $3, $4, NULL, $5, NOW())
       ON CONFLICT (user_id, date, meal_type)
       DO UPDATE SET recipe_id = EXCLUDED.recipe_id, meal_id = NULL, servings = EXCLUDED.servings, last_updated = NOW()`,
      [userId, date, meal_type, recipe_id, servings]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save meal plan', details: err.message });
  }
});

// Get shopping list (meals planned for a given week)
app.get('/shopping-list', authenticateToken, async (req, res) => {
  try {
    const { weekStart } = req.query;
    const userId = req.user.id;

    if (!weekStart) {
      return res.status(400).json({ error: 'weekStart query parameter is required (YYYY-MM-DD)' });
    }

    // Build the 7-day range Mon–Sun
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const toISO = (d) => d.toISOString().slice(0, 10);
    const startStr = toISO(start);
    const endStr = toISO(end);

    const { rows } = await db.query(
      `SELECT mp.date,
              mp.meal_type,
              mp.servings,
              mp.recipe_id,
              COALESCE(m.name, r.title) AS meal_name,
              ROUND(COALESCE(m.calories, r.calories_per_serving) * mp.servings) AS calories,
              ROUND(COALESCE(m.protein_g, r.protein_per_serving) * mp.servings, 1) AS protein_g,
              ROUND(COALESCE(m.carbs_g, r.carbs_per_serving) * mp.servings, 1) AS carbs_g,
              ROUND(COALESCE(m.fat_g, r.fat_per_serving) * mp.servings, 1) AS fat_g
       FROM meal_plans mp
       LEFT JOIN meals m ON mp.meal_id = m.id
       LEFT JOIN recipes r ON mp.recipe_id = r.id
       WHERE mp.user_id = $1 AND mp.date BETWEEN $2 AND $3
         AND (mp.meal_id IS NOT NULL OR mp.recipe_id IS NOT NULL)
       ORDER BY mp.date, mp.meal_type`,
      [userId, startStr, endStr]
    );

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const meals = rows.map((row) => {
      const dateStr = typeof row.date === 'string' ? row.date.slice(0, 10) : row.date.toISOString().slice(0, 10);
      const localDate = new Date(dateStr + 'T00:00:00');
      return {
        date: toISO(localDate),
        day: dayNames[localDate.getDay()],
        meal_type: row.meal_type,
        meal_name: row.meal_name,
        servings: parseFloat(row.servings),
        calories: parseFloat(row.calories) || 0,
        protein_g: parseFloat(row.protein_g) || 0,
        carbs_g: parseFloat(row.carbs_g) || 0,
        fat_g: parseFloat(row.fat_g) || 0,
      };
    });

    const totals = meals.reduce(
      (acc, m) => {
        acc.calories += m.calories;
        acc.protein_g += m.protein_g;
        acc.carbs_g += m.carbs_g;
        acc.fat_g += m.fat_g;
        return acc;
      },
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );

    totals.calories = Math.round(totals.calories);
    totals.protein_g = Math.round(totals.protein_g * 10) / 10;
    totals.carbs_g = Math.round(totals.carbs_g * 10) / 10;
    totals.fat_g = Math.round(totals.fat_g * 10) / 10;

    // Ingredient aggregation for recipe-based meal plans
    const { rows: ingRows } = await db.query(
      `SELECT ri.name, ri.quantity, ri.unit, ri.section, ri.notes,
              r.title AS recipe_title, r.servings AS recipe_servings,
              mp.date, mp.meal_type, mp.servings
       FROM recipe_ingredients ri
       JOIN recipes r ON r.id = ri.recipe_id
       JOIN meal_plans mp ON mp.recipe_id = ri.recipe_id
       WHERE mp.user_id = $1 AND mp.date BETWEEN $2 AND $3 AND mp.recipe_id IS NOT NULL
       ORDER BY ri.name, mp.date, ri.section`,
      [userId, startStr, endStr]
    );

    // ── Unit normalisation ──────────────────────────────────────────────
    // Convert compatible units to a canonical base unit before aggregation,
    // then convert back to the most readable unit for display.
    const unitGroups = {
      // mass → canonical: g
      g:  { canonical: 'g', factor: 1 },
      kg: { canonical: 'g', factor: 1000 },
      // volume → canonical: ml
      ml: { canonical: 'ml', factor: 1 },
      l:  { canonical: 'ml', factor: 1000 },
      // small volume → canonical: tsp
      tsp:  { canonical: 'tsp', factor: 1 },
      tbsp: { canonical: 'tsp', factor: 3 },
      cup:  { canonical: 'tsp', factor: 48 },  // 16 tbsp × 3 tsp
    };

    function normaliseUnit(unit) {
      const lower = (unit || '').toLowerCase().trim();
      const group = unitGroups[lower];
      if (!group) return { canonical: unit || '', factor: 1 };
      return group;
    }

    function readableQuantity(qty, canonicalUnit) {
      if (qty == null) return { quantity: null, unit: canonicalUnit };
      if (canonicalUnit === 'g' && qty >= 1000) {
        return { quantity: Math.round((qty / 1000) * 100) / 100, unit: 'kg' };
      }
      if (canonicalUnit === 'ml' && qty >= 1000) {
        return { quantity: Math.round((qty / 1000) * 100) / 100, unit: 'L' };
      }
      if (canonicalUnit === 'tsp' && qty >= 48) {
        return { quantity: Math.round((qty / 48) * 100) / 100, unit: 'cup' };
      }
      if (canonicalUnit === 'tsp' && qty >= 3) {
        return { quantity: Math.round((qty / 3) * 100) / 100, unit: 'tbsp' };
      }
      return { quantity: Math.round(qty * 100) / 100, unit: canonicalUnit };
    }

    // ── Ingredient name normalisation ─────────────────────────────────
    // Strip prep instructions and normalise plurals so similar ingredients
    // (e.g. "garlic cloves crushed" and "garlic clove finely grated") merge.
    const prepPhrases = [
      'drained and rinsed', 'finely grated', 'finely chopped', 'finely diced',
      'finely sliced', 'roughly chopped', 'roughly torn', 'thinly sliced',
      'sliced into strips', 'cut into chunks', 'cut into pieces',
      'to taste', 'to serve',
      'crushed', 'diced', 'minced', 'sliced', 'chopped', 'grated',
      'peeled', 'trimmed', 'halved', 'quartered', 'deseeded', 'torn',
      'drained', 'rinsed', 'optional', 'fresh', 'dried',
    ];
    // Build a single regex that strips any of these phrases (globally)
    const prepRegex = new RegExp(
      '\\b(' + prepPhrases.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi'
    );

    const pluralRules = [
      [/leaves$/i, 'leaf'],
      [/ves$/i, 've'],          // halves → halve (rare, but safe)
      [/ies$/i, 'y'],           // berries → berry
      [/ses$/i, 'se'],          // purses → purse  (avoids stripping 'es' from 'ses')
      [/ches$/i, 'ch'],         // peaches → peach
      [/shes$/i, 'sh'],         // radishes → radish
      [/sses$/i, 'ss'],        // grasses → grass
      [/breasts$/i, 'breast'],
      [/thighs$/i, 'thigh'],
      [/cloves$/i, 'clove'],
      [/s$/i, ''],              // generic trailing s
    ];

    function normaliseIngredientName(name) {
      let n = (name || '').toLowerCase();
      // Strip prep phrases
      n = n.replace(prepRegex, '');
      // Strip leading/trailing commas, dashes, whitespace
      n = n.replace(/^[\s,\-]+|[\s,\-]+$/g, '');
      // Collapse internal whitespace
      n = n.replace(/\s{2,}/g, ' ');
      // Normalise plurals (apply first matching rule to each word)
      n = n.split(' ').map(word => {
        for (const [pattern, replacement] of pluralRules) {
          if (pattern.test(word)) return word.replace(pattern, replacement);
        }
        return word;
      }).join(' ');
      return n.trim();
    }

    // Aggregate by (normalised name, canonical unit)
    const ingMap = new Map();
    for (const row of ingRows) {
      const { canonical, factor } = normaliseUnit(row.unit);
      const normName = normaliseIngredientName(row.name);
      const key = `${normName}||${canonical}`;
      const hasQty = row.quantity != null && parseFloat(row.quantity) > 0;
      const rawQty = hasQty ? parseFloat(row.quantity) : null;
      const recipeServings = parseFloat(row.recipe_servings) || 1;
      const mealPlanServings = parseFloat(row.servings) || 1;
      const scaledQty = rawQty != null ? rawQty * factor * (mealPlanServings / recipeServings) : null;
      const dateStr2 = typeof row.date === 'string' ? row.date.slice(0, 10) : row.date.toISOString().slice(0, 10);
      const localDate = new Date(dateStr2 + 'T00:00:00');
      const use = {
        recipe: row.recipe_title,
        date: toISO(localDate),
        day: dayNames[localDate.getDay()],
        meal_type: row.meal_type,
        quantity: rawQty,
        scaledQuantity: scaledQty,
        unit: row.unit || '',
      };
      if (ingMap.has(key)) {
        const entry = ingMap.get(key);
        if (scaledQty != null) entry.totalQuantity = (entry.totalQuantity || 0) + scaledQty;
        entry.uses.push(use);
      } else {
        ingMap.set(key, {
          name: row.name,
          totalQuantity: scaledQty,   // null if no numeric quantity (in canonical units)
          canonicalUnit: canonical,
          section: row.section || 'Ingredients',
          uses: [use],
        });
      }
    }

    const ingredients = Array.from(ingMap.values())
      .map(entry => {
        const { quantity: displayQty, unit: displayUnit } = readableQuantity(entry.totalQuantity, entry.canonicalUnit);
        return {
          name: entry.name,
          totalQuantity: displayQty,
          unit: displayUnit,
          section: entry.section,
          uses: entry.uses,
          multipleUses: entry.uses.length > 1,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ week: startStr, meals, totals, ingredients });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shopping list', details: err.message });
  }
});

// ── Shopping Trips ────────────────────────────────────────────────────────────

// Auto-categorise an ingredient name into a shopping aisle
const CATEGORY_KEYWORDS = {
  'Meat & Fish': ['chicken','beef','pork','lamb','mince','steak','salmon','prawn','shrimp','fish','bacon','sausage','turkey','cod','tuna','ham','chorizo'],
  'Dairy': ['milk','cheese','cream','butter','yogurt','yoghurt','egg','eggs','crème','creme','soured cream'],
  'Produce': ['onion','garlic','pepper','tomato','potato','carrot','lettuce','spinach','avocado','lemon','lime','ginger','chilli','cucumber','mushroom','courgette','broccoli','celery','coriander','parsley','basil','mint','thyme','rosemary'],
  'Bakery': ['bread','roll','bun','tortilla','wrap','naan','pitta','croissant','bagel','flour','yeast'],
  'Dry Goods': ['rice','pasta','noodle','lentil','chickpea','bean','oat','cereal','sugar','stock','sauce','oil','vinegar','soy','spice','paprika','cumin','curry','mustard','honey','peanut butter','coconut milk','passata','chopped tomatoes','worcestershire'],
  'Frozen': ['frozen','ice cream'],
};

function categoriseIngredient(name) {
  const lower = (name || '').toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return 'Other';
}

// Get active shopping trip
app.get('/shopping-trips/active', authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM shopping_trips WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (rows.length === 0) return res.json(null);
    const trip = rows[0];
    const { rows: items } = await db.query(
      'SELECT * FROM shopping_trip_items WHERE trip_id = $1 ORDER BY category, position', [trip.id]
    );
    res.json({ ...trip, items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trip', details: err.message });
  }
});

// Save a new shopping trip from current week's ingredients
app.post('/shopping-trips', authenticateToken, async (req, res) => {
  try {
    const { name, weekStart, items } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'items array is required' });

    // Mark any existing active trip as completed
    await db.query(
      `UPDATE shopping_trips SET status = 'completed', completed_at = NOW()
       WHERE user_id = $1 AND status = 'active'`,
      [req.user.id]
    );

    const { rows } = await db.query(
      `INSERT INTO shopping_trips (user_id, week_start, name, status)
       VALUES ($1, $2, $3, 'active') RETURNING *`,
      [req.user.id, weekStart || null, name || 'Shopping List']
    );
    const trip = rows[0];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await db.query(
        `INSERT INTO shopping_trip_items (trip_id, name, quantity, unit, category, checked, custom, position)
         VALUES ($1, $2, $3, $4, $5, false, $6, $7)`,
        [trip.id, item.name, item.quantity ?? null, item.unit || null,
         item.category || categoriseIngredient(item.name), item.custom || false, i + 1]
      );
    }

    const { rows: savedItems } = await db.query(
      'SELECT * FROM shopping_trip_items WHERE trip_id = $1 ORDER BY category, position', [trip.id]
    );
    res.status(201).json({ ...trip, items: savedItems });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create trip', details: err.message });
  }
});

// Toggle item checked state
app.patch('/shopping-trips/items/:itemId', authenticateToken, async (req, res) => {
  try {
    const { checked } = req.body;
    const { rows } = await db.query(
      `UPDATE shopping_trip_items SET checked = $1
       WHERE id = $2 AND trip_id IN (SELECT id FROM shopping_trips WHERE user_id = $3)
       RETURNING *`,
      [checked, req.params.itemId, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update item', details: err.message });
  }
});

// Add custom item to active trip
app.post('/shopping-trips/active/items', authenticateToken, async (req, res) => {
  try {
    const { name, quantity, unit, category } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const { rows: trips } = await db.query(
      `SELECT id FROM shopping_trips WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [req.user.id]
    );
    if (trips.length === 0) return res.status(404).json({ error: 'No active trip' });

    const tripId = trips[0].id;
    const { rows: maxPos } = await db.query(
      'SELECT COALESCE(MAX(position), 0) + 1 AS pos FROM shopping_trip_items WHERE trip_id = $1', [tripId]
    );

    const { rows } = await db.query(
      `INSERT INTO shopping_trip_items (trip_id, name, quantity, unit, category, checked, custom, position)
       VALUES ($1, $2, $3, $4, $5, false, true, $6) RETURNING *`,
      [tripId, name, quantity ?? null, unit || null,
       category || categoriseIngredient(name), maxPos[0].pos]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add item', details: err.message });
  }
});

// Complete active trip
app.post('/shopping-trips/active/complete', authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE shopping_trips SET status = 'completed', completed_at = NOW()
       WHERE user_id = $1 AND status = 'active' RETURNING *`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No active trip' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to complete trip', details: err.message });
  }
});

app.use('/auth', authRoutes); // Routes will be prefixed with /auth

// Get user profile (with latest weight from daily_logs)
app.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await db.query(
      `SELECT up.user_id, up.date_of_birth, up.sex, up.height_cm, up.activity_level,
              up.goal, up.goal_pace, up.protein_pct, up.carbs_pct, up.fat_pct,
              up.dietary_requirement, up.weight_unit, up.height_unit, up.updated_at,
              dl.weight_kg AS latest_weight_kg
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN LATERAL (
         SELECT weight_kg FROM daily_logs
         WHERE user_id = u.id AND weight_kg IS NOT NULL
         ORDER BY date DESC
         LIMIT 1
       ) dl ON true
       WHERE u.id = $1`,
      [userId]
    );
    res.json(rows[0] || { user_id: userId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile', details: err.message });
  }
});

// Upsert user profile
app.put('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      date_of_birth,
      sex,
      height_cm,
      activity_level,
      goal,
      goal_pace,
      protein_pct,
      carbs_pct,
      fat_pct,
      dietary_requirement,
      weight_unit,
      height_unit,
    } = req.body;
    const { rows } = await db.query(
      `INSERT INTO user_profiles
         (user_id, date_of_birth, sex, height_cm, activity_level, goal, goal_pace, protein_pct, carbs_pct, fat_pct, dietary_requirement, weight_unit, height_unit, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         date_of_birth  = EXCLUDED.date_of_birth,
         sex            = EXCLUDED.sex,
         height_cm      = EXCLUDED.height_cm,
         activity_level = EXCLUDED.activity_level,
         goal           = EXCLUDED.goal,
         goal_pace      = EXCLUDED.goal_pace,
         protein_pct    = EXCLUDED.protein_pct,
         carbs_pct      = EXCLUDED.carbs_pct,
         fat_pct        = EXCLUDED.fat_pct,
         dietary_requirement = EXCLUDED.dietary_requirement,
         weight_unit    = EXCLUDED.weight_unit,
         height_unit    = EXCLUDED.height_unit,
         updated_at     = NOW()
       RETURNING *`,
      [
        userId,
        date_of_birth || null,
        sex || null,
        height_cm || null,
        activity_level || 'moderately active',
        goal || 'maintain',
        goal_pace || 'moderate',
        protein_pct ?? 30,
        carbs_pct ?? 40,
        fat_pct ?? 30,
        dietary_requirement || null,
        weight_unit || 'kg',
        height_unit || 'cm',
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save profile', details: err.message });
  }
});

// Daily log — get entries for a date range
app.get('/logs/daily', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { from, to } = req.query;
    let query = 'SELECT * FROM daily_logs WHERE user_id = $1';
    const params = [userId];
    if (from) { params.push(from); query += ` AND date >= $${params.length}`; }
    if (to)   { params.push(to);   query += ` AND date <= $${params.length}`; }
    query += ' ORDER BY date DESC';
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs', details: err.message });
  }
});

// Daily log — upsert an entry (weight, sleep, water, notes)
app.post('/logs/daily', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { date, weight_kg, sleep_hours, sleep_quality, water_ml, notes } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required' });
    const { rows } = await db.query(
      `INSERT INTO daily_logs (user_id, date, weight_kg, sleep_hours, sleep_quality, water_ml, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, date) DO UPDATE SET
         weight_kg     = COALESCE(EXCLUDED.weight_kg,     daily_logs.weight_kg),
         sleep_hours   = COALESCE(EXCLUDED.sleep_hours,   daily_logs.sleep_hours),
         sleep_quality = COALESCE(EXCLUDED.sleep_quality, daily_logs.sleep_quality),
         water_ml      = COALESCE(EXCLUDED.water_ml,      daily_logs.water_ml),
         notes         = COALESCE(EXCLUDED.notes,         daily_logs.notes)
       RETURNING *`,
      [userId, date, weight_kg ?? null, sleep_hours ?? null, sleep_quality ?? null, water_ml ?? null, notes ?? null]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save log', details: err.message });
  }
});

// List recipes
app.get('/recipes', async (req, res) => {
  try {
    const { category, search, tags, ingredient } = req.query;
    let query = `SELECT DISTINCT r.id, r.title, r.description, r.servings, r.prep_time_mins, r.cook_time_mins,
                        r.category, r.dietary_tags, r.calories_per_serving, r.protein_per_serving,
                        r.carbs_per_serving, r.fat_per_serving, r.status, r.source_url, r.image_url, r.created_at
                 FROM recipes r`;
    const params = [];
    if (ingredient) {
      query += ` JOIN recipe_ingredients ri ON ri.recipe_id = r.id`;
    }
    query += ` WHERE 1=1`;
    if (category) { params.push(category); query += ` AND r.category = $${params.length}`; }
    if (search) { params.push(`%${search.toLowerCase()}%`); query += ` AND LOWER(r.title) LIKE $${params.length}`; }
    if (ingredient) { params.push(`%${ingredient.toLowerCase()}%`); query += ` AND LOWER(ri.name) LIKE $${params.length}`; }
    query += ' ORDER BY r.created_at DESC';
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recipes', details: err.message });
  }
});

// Batch average ratings for all recipes (avoids N+1)
app.get('/recipes/ratings', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT recipe_id,
              COUNT(*)::int AS count,
              ROUND(AVG(rating)::numeric, 1)::float AS average_rating
       FROM recipe_reviews
       GROUP BY recipe_id`
    );
    const ratings = {};
    for (const r of rows) {
      ratings[r.recipe_id] = { average_rating: r.average_rating, count: r.count };
    }
    res.json(ratings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ratings', details: err.message });
  }
});

// Create a new recipe from scratch
app.post('/recipes', authenticateToken, async (req, res) => {
  try {
    const {
      title, description, servings, prep_time_mins, cook_time_mins, category,
      dietary_tags, calories_per_serving, protein_per_serving, carbs_per_serving,
      fat_per_serving, source_url, image_url, ingredients = [], steps = []
    } = req.body;

    if (!title) return res.status(400).json({ error: 'title is required' });

    const { rows: recipeRows } = await db.query(
      `INSERT INTO recipes (title, description, servings, prep_time_mins, cook_time_mins, category,
         dietary_tags, calories_per_serving, protein_per_serving, carbs_per_serving, fat_per_serving,
         status, source_url, image_url, author_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'personal',$12,$13,$14)
       RETURNING id`,
      [title, description || null, servings || 1, prep_time_mins || 0, cook_time_mins || 0,
       category || 'Dinner', dietary_tags || [], calories_per_serving || 0,
       protein_per_serving || 0, carbs_per_serving || 0, fat_per_serving || 0,
       source_url || null, image_url || null, req.user.id]
    );
    const recipeId = recipeRows[0].id;

    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      await db.query(
        `INSERT INTO recipe_ingredients (recipe_id, section, position, quantity, unit, name, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [recipeId, ing.section || 'Ingredients', ing.position || i + 1,
         ing.quantity || null, ing.unit || null, ing.name, ing.notes || '']
      );
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await db.query(
        `INSERT INTO recipe_steps (recipe_id, section, position, instruction)
         VALUES ($1,$2,$3,$4)`,
        [recipeId, step.section || 'Method', step.position || i + 1, step.instruction]
      );
    }

    await reparsStepIngredients(recipeId);

    const { rows: fullRecipe } = await db.query('SELECT * FROM recipes WHERE id = $1', [recipeId]);
    const { rows: savedIngredients } = await db.query(
      'SELECT * FROM recipe_ingredients WHERE recipe_id = $1 ORDER BY section, position', [recipeId]
    );
    const { rows: savedSteps } = await db.query(
      'SELECT * FROM recipe_steps WHERE recipe_id = $1 ORDER BY section, position', [recipeId]
    );
    res.status(201).json({ ...fullRecipe[0], ingredients: savedIngredients, steps: savedSteps });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create recipe', details: err.message });
  }
});

// Submit personal recipe for community approval
app.post('/recipes/:id/submit', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query('SELECT author_id, status FROM recipes WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Recipe not found' });
    if (rows[0].author_id !== req.user.id) return res.status(403).json({ error: 'You can only submit your own recipes' });
    if (rows[0].status !== 'personal') return res.status(400).json({ error: 'Only personal recipes can be submitted for approval' });
    await db.query(`UPDATE recipes SET status = 'pending', updated_at = NOW() WHERE id = $1`, [id]);
    res.json({ message: 'Recipe submitted for community approval' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit recipe', details: err.message });
  }
});

// Get single recipe with ingredients and steps
app.get('/recipes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: recipeRows } = await db.query('SELECT * FROM recipes WHERE id = $1', [id]);
    if (recipeRows.length === 0) return res.status(404).json({ error: 'Recipe not found' });
    const recipe = recipeRows[0];
    const { rows: ingredients } = await db.query(
      'SELECT * FROM recipe_ingredients WHERE recipe_id = $1 ORDER BY section, position', [id]
    );
    const { rows: steps } = await db.query(
      'SELECT * FROM recipe_steps WHERE recipe_id = $1 ORDER BY section, position', [id]
    );
    res.json({ ...recipe, ingredients, steps });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recipe', details: err.message });
  }
});

// Update recipe metadata (author or admin only)
app.patch('/recipes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await db.query('SELECT author_id FROM recipes WHERE id = $1', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Recipe not found' });
    if (existing[0].author_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only edit your own recipes' });
    }
    const { title, category, description, servings, prep_time_mins, cook_time_mins,
            calories_per_serving, protein_per_serving, carbs_per_serving, fat_per_serving, image_url, dietary_tags } = req.body;
    const { rows } = await db.query(
      `UPDATE recipes SET
         title                = COALESCE($1, title),
         category             = COALESCE($2, category),
         description          = COALESCE($3, description),
         servings             = COALESCE($4, servings),
         prep_time_mins       = COALESCE($5, prep_time_mins),
         cook_time_mins       = COALESCE($6, cook_time_mins),
         calories_per_serving = COALESCE($7, calories_per_serving),
         protein_per_serving  = COALESCE($8, protein_per_serving),
         carbs_per_serving    = COALESCE($9, carbs_per_serving),
         fat_per_serving      = COALESCE($10, fat_per_serving),
         image_url            = COALESCE($11, image_url),
         dietary_tags         = COALESCE($12, dietary_tags),
         updated_at           = NOW()
       WHERE id = $13
       RETURNING *`,
      [title ?? null, category ?? null, description ?? null,
       servings ?? null, prep_time_mins ?? null, cook_time_mins ?? null,
       calories_per_serving ?? null, protein_per_serving ?? null,
       carbs_per_serving ?? null, fat_per_serving ?? null, image_url ?? null,
       dietary_tags ?? null, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Recipe not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update recipe', details: err.message });
  }
});

// Delete a recipe (author only) — cascades to ingredients and steps
app.delete('/recipes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query('SELECT author_id FROM recipes WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Recipe not found' });
    if (rows[0].author_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own recipes' });
    }
    await db.query('DELETE FROM recipe_steps WHERE recipe_id = $1', [id]);
    await db.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [id]);
    await db.query('DELETE FROM recipes WHERE id = $1', [id]);
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete recipe', details: err.message });
  }
});

// ── Recipe import helpers ─────────────────────────────────────────────────────

function extractRecipeImage(schema) {
  if (!schema || !schema.image) return null;
  const img = schema.image;
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) {
    const first = img[0];
    if (typeof first === 'string') return first;
    if (first && first.url) return first.url;
  }
  if (img.url) return img.url;
  return null;
}

function parseISO8601Duration(str) {
  if (!str) return null;
  const m = str.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return null;
  return (parseInt(m[1] || 0) * 60) + parseInt(m[2] || 0);
}

function parseNutritionValue(str) {
  if (!str) return null;
  const n = parseFloat(String(str).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

function mapCategory(recipeCategory) {
  if (!recipeCategory) return 'Dinner';
  const cats = Array.isArray(recipeCategory) ? recipeCategory : [recipeCategory];
  const joined = cats.join(' ').toLowerCase();
  if (joined.includes('breakfast') || joined.includes('brunch')) return 'Breakfast';
  if (joined.includes('lunch') || joined.includes('sandwich')) return 'Lunch';
  if (joined.includes('snack') || joined.includes('appetizer') || joined.includes('starter')) return 'Snacks';
  return 'Dinner';
}

function parseDietaryTags(keywords, category) {
  const tags = [];
  const text = [
    ...(Array.isArray(keywords) ? keywords : [keywords || '']),
    category || '',
  ].join(' ').toLowerCase();
  if (text.includes('vegan')) tags.push('vegan');
  else if (text.includes('vegetarian')) tags.push('vegetarian');
  if (text.includes('gluten-free') || text.includes('gluten free')) tags.push('gluten-free');
  if (text.includes('dairy-free') || text.includes('dairy free')) tags.push('dairy-free');
  if (text.includes('keto')) tags.push('keto');
  if (text.includes('paleo')) tags.push('paleo');
  if (text.includes('low gi') || text.includes('low glycemic') || text.includes('low glycaemic') || text.includes('low-gi') || text.includes('pcos')) tags.push('low-glycemic');
  if (text.includes('high protein') || text.includes('high-protein') || text.includes('protein rich')) tags.push('high-protein');
  if (text.includes('low carb') || text.includes('low-carb')) tags.push('low-carb');
  return tags;
}

function parseIngredient(str) {
  if (!str) return { quantity: null, unit: null, name: str, notes: '' };
  // Normalise unicode fractions
  let s = str.trim()
    .replace(/½/g, '0.5').replace(/¼/g, '0.25').replace(/¾/g, '0.75')
    .replace(/⅓/g, '0.333').replace(/⅔/g, '0.667')
    .replace(/⅛/g, '0.125').replace(/⅜/g, '0.375').replace(/⅝/g, '0.625').replace(/⅞/g, '0.875');

  // Strip "to taste", "to serve", "as needed", "for garnish" from the string (save for notes)
  const trailingPhrases = /,?\s*(to taste|to serve|as needed|for garnish|for serving|optional|or to taste)\s*$/i;
  let extraNotes = '';
  const trailingMatch = s.match(trailingPhrases);
  if (trailingMatch) {
    extraNotes = trailingMatch[1];
    s = s.replace(trailingPhrases, '').trim();
  }

  // Handle parenthetical quantities: "1 (400g) tin" → extract but keep outer quantity
  // Also "1 (14oz) can" pattern
  const parenQty = s.match(/^(\d+(?:\.\d+)?)\s*\((\d+(?:\.\d+)?)\s*(g|kg|ml|l|oz|lb|lbs)\)\s*/i);
  if (parenQty) {
    // Keep the outer quantity and unit (e.g., "1 tin"), store paren info in notes
    const parenNote = `${parenQty[2]}${parenQty[3]}`;
    s = s.replace(parenQty[0], parenQty[1] + ' ');
    extraNotes = extraNotes ? `${parenNote}, ${extraNotes}` : parenNote;
  }

  // Handle "a pinch of", "a splash of", "a handful of"
  const nonNumeric = s.match(/^(a|an)\s+(pinch|splash|handful|dash|drizzle|knob|sprig|bunch)\s+(?:of\s+)?/i);
  if (nonNumeric) {
    const unit = nonNumeric[2].toLowerCase();
    const name = s.slice(nonNumeric[0].length).replace(/^,\s*/, '').trim();
    return { quantity: 1, unit, name: name || str, notes: extraNotes };
  }

  // Fix stuck number+unit patterns: "400g" → "400 g", "250ml" → "250 ml"
  s = s.replace(/^(\d+(?:\.\d+)?)(g|kg|ml|l|oz|lb|lbs|cup|cups|tbsp|tsp|can|cans|tin|tins)\b/i, '$1 $2');
  // Fix stuck number+word: "1small" → "1 small"
  s = s.replace(/^(\d+(?:\.\d+)?)([a-zA-Z])/, '$1 $2');

  const UNITS = ['g','kg','ml','l','oz','lb','lbs','cup','cups','tbsp','tsp','tablespoon',
                 'tablespoons','teaspoon','teaspoons','piece','pieces','clove','cloves',
                 'slice','slices','bunch','handful','pinch','can','cans','tin','tins',
                 'pouch','packet','bag','jar','bottle','sprig','sprigs','head','heads',
                 'stalk','stalks','rasher','rashers','fillet','fillets'];

  const SIZE_WORDS = new Set(['large', 'small', 'medium', 'big', 'thin', 'thick', 'heaped', 'level', 'rounded', 'generous']);

  const tokens = s.split(/\s+/);
  let quantity = null;
  let unit = null;
  let nameStart = 0;

  // Handle range quantities: "2-3" → take the lower bound
  if (tokens.length >= 1 && /^\d+(?:\.\d+)?-\d+(?:\.\d+)?$/.test(tokens[0])) {
    quantity = parseFloat(tokens[0].split('-')[0]);
    nameStart = 1;
  }
  // Handle mixed numbers e.g. "1 1/2"
  else if (tokens.length >= 2 && /^\d+$/.test(tokens[0]) && /^\d+\/\d+$/.test(tokens[1])) {
    const [num, den] = tokens[1].split('/');
    quantity = parseInt(tokens[0]) + parseInt(num) / parseInt(den);
    nameStart = 2;
  } else if (/^[\d./]+$/.test(tokens[0])) {
    if (tokens[0].includes('/')) {
      const [num, den] = tokens[0].split('/');
      quantity = parseFloat(num) / parseFloat(den);
    } else {
      quantity = parseFloat(tokens[0]);
    }
    nameStart = 1;
  }

  // Check for unit
  if (nameStart < tokens.length) {
    const nextToken = tokens[nameStart].toLowerCase();
    if (UNITS.includes(nextToken)) {
      unit = nextToken;
      nameStart++;
    } else {
      // Check for "NNNunit" pattern in the token (e.g., "400g")
      const attached = nextToken.match(/^(\d+(?:\.\d+)?)(g|kg|ml|l|oz|lb|lbs)$/i);
      if (attached && quantity == null) {
        quantity = parseFloat(attached[1]);
        unit = attached[2].toLowerCase();
        nameStart++;
      }
    }
  }

  // Move size descriptors (large, small, medium) to notes
  if (nameStart < tokens.length && SIZE_WORDS.has(tokens[nameStart].toLowerCase())) {
    const sizeWord = tokens[nameStart];
    nameStart++;
    extraNotes = extraNotes ? `${sizeWord}, ${extraNotes}` : sizeWord;
  }

  // Strip leading "of" from name: "of salt" → "salt"
  if (nameStart < tokens.length && tokens[nameStart].toLowerCase() === 'of') {
    nameStart++;
  }

  // Strip trailing parenthetical from name: "stock (about 2 cups)" → "stock"
  let name = tokens.slice(nameStart).join(' ').replace(/^,\s*/, '').replace(/\s*\(.*?\)\s*$/, '').trim() || str;

  return { quantity: quantity || null, unit: unit || null, name, notes: extraNotes };
}

// For a step instruction, find which ingredients are referenced and at what quantity.
// Returns [{ingredient_id, name, quantity, unit}]
function parseIngredientRefs(instruction, ingredients) {
  const UNITS = ['g','kg','ml','l','oz','lb','lbs','cup','cups','tbsp','tsp',
                 'tablespoon','tablespoons','teaspoon','teaspoons',
                 'clove','cloves','piece','pieces','slice','slices','pinch'];
  const text = instruction.toLowerCase();
  const refs = [];
  const seen = new Set();

  // Common cooking/recipe words that should never match as ingredient identifiers
  const STOP_WORDS = new Set([
    'about','with','from','into','over','onto','until','after','before',
    'through','around','between','under','above','below','along','across',
    'each','every','some','more','most','other','another','such','than',
    'well','then','just','also','very','often','still','even','back',
    'only','made','make','will','been','being','have','were','does',
    'this','that','they','them','their','what','when','which','where',
    'would','could','should','these','those','while','there','here',
    'serve','served','serving','cook','cooked','cooking','bake','baked',
    'heat','heated','leave','warm','cool','cold','rest','apart','keep',
    'chop','chopped','dice','diced','mince','minced','grate','grated',
    'finely','roughly','thinly','thickly','fresh','dried','large','small',
    'medium','thick','thin','long','half','whole','full','good','nice',
    'skinless','boneless','strips','strip','fingers','finger','pieces',
    'alternatively','minutes','sauce','spaced','arrange','arranged',
    'cover','covered','place','placed','remove','removed','pour','stir',
    'stirring','mixing','mixed','coating','coated','coat',
    'cut','cuts','slice','sliced','side','sides',
  ]);

  for (const ing of ingredients) {
    if (seen.has(ing.id)) continue;

    // Extract the core ingredient name — strip parenthetical notes and prep instructions
    const nameLower = ing.name.toLowerCase().trim();
    // Remove parenthetical content like "(about 300g)" or "(without palm oil)"
    const nameClean = nameLower.replace(/\(.*?\)/g, '').trim();
    // Remove trailing prep instructions after common indicators
    const coreName = nameClean.replace(/,?\s*(cut |finely |roughly |thinly |to serve|to taste).*$/i, '').trim();

    // Build candidate match terms:
    // 1. Full cleaned name
    // 2. Individual words that are meaningful (>4 chars, not stop words, not units)
    const words = coreName.split(/\s+/).filter(w =>
      w.length > 4 &&
      !STOP_WORDS.has(w) &&
      !UNITS.includes(w) &&
      !/^\d/.test(w)
    );
    const candidates = [coreName];
    if (coreName !== nameLower) candidates.push(nameLower);
    // Only add individual words if they're specific enough (>5 chars and not generic)
    candidates.push(...words.filter(w => w.length > 5));

    let foundIdx = -1;
    for (const candidate of candidates) {
      // Use word boundary matching to avoid partial matches
      const re = new RegExp('\\b' + candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
      const match = text.match(re);
      if (match) { foundIdx = match.index; break; }
    }
    if (foundIdx === -1) continue;

    // Look for a quantity pattern in the 50 chars before the ingredient mention
    const before = text.substring(Math.max(0, foundIdx - 50), foundIdx);

    // Match patterns like: 250g  /  250 g  /  1/2 tsp  /  0.5 kg
    const qtyRe = /([\d]+(?:[./][\d]+)?)\s*(g|kg|ml|l|oz|lb|lbs|cups?|tbsp|tsp|tablespoons?|teaspoons?|cloves?|pieces?|slices?|pinch)?\s*$/i;
    const qtyMatch = before.match(qtyRe);

    let quantity = null;
    let unit = ing.unit || null;

    if (qtyMatch) {
      const qStr = qtyMatch[1];
      if (qStr.includes('/')) {
        const [num, den] = qStr.split('/');
        quantity = parseFloat(num) / parseFloat(den);
      } else {
        quantity = parseFloat(qStr);
      }
      if (qtyMatch[2]) unit = qtyMatch[2].toLowerCase();
    }

    refs.push({ ingredient_id: ing.id, name: ing.name, quantity, unit });
    seen.add(ing.id);
  }

  return refs;
}

// Populate ingredient_refs for all steps of a recipe (called after ingredients+steps inserted)
async function reparsStepIngredients(recipeId) {
  const { rows: ingredients } = await db.query(
    'SELECT id, name, quantity, unit FROM recipe_ingredients WHERE recipe_id = $1 ORDER BY position', [recipeId]
  );
  const { rows: steps } = await db.query(
    'SELECT id, instruction FROM recipe_steps WHERE recipe_id = $1', [recipeId]
  );
  for (const step of steps) {
    const refs = parseIngredientRefs(step.instruction, ingredients);
    await db.query(
      'UPDATE recipe_steps SET ingredient_refs = $1 WHERE id = $2',
      [JSON.stringify(refs), step.id]
    );
  }
}

function extractRecipeSchema(html) {
  const scripts = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try { scripts.push(JSON.parse(m[1])); } catch { /* skip malformed */ }
  }
  for (const obj of scripts) {
    // Handle @graph array
    const items = obj['@graph'] ? obj['@graph'] : [obj];
    for (const item of (Array.isArray(items) ? items : [items])) {
      const type = item['@type'];
      const types = Array.isArray(type) ? type : [type];
      if (types.includes('Recipe')) return item;
    }
  }
  return null;
}

async function fetchHTML(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MealPlanner/1.0)' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

// POST /recipes/import — import a recipe from a URL using LD+JSON schema
app.post('/recipes/import', authenticateToken, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'url must start with http:// or https://' });

    let html;
    try {
      html = await fetchHTML(url);
    } catch (err) {
      return res.status(502).json({ error: 'Failed to fetch the page. The site may be blocking requests.' });
    }

    const schema = extractRecipeSchema(html);
    if (!schema) return res.status(422).json({ error: 'No recipe schema found on this page. The site may not support structured data.' });

    const title = schema.name || 'Imported Recipe';
    const description = schema.description || null;
    const servings = parseInt(String(schema.recipeYield || '2').match(/\d+/)?.[0] || '2');
    const prepTimeMins = parseISO8601Duration(schema.prepTime);
    const cookTimeMins = parseISO8601Duration(schema.cookTime);
    const category = mapCategory(schema.recipeCategory);
    const dietaryTags = parseDietaryTags(schema.keywords, schema.recipeCategory);

    const nutrition = schema.nutrition || {};
    const caloriesPerServing = parseNutritionValue(nutrition.calories);
    const proteinPerServing = parseNutritionValue(nutrition.proteinContent);
    const carbsPerServing = parseNutritionValue(nutrition.carbohydrateContent);
    const fatPerServing = parseNutritionValue(nutrition.fatContent);
    const imageUrl = extractRecipeImage(schema);

    const { rows: recipeRows } = await db.query(
      `INSERT INTO recipes (title, description, servings, prep_time_mins, cook_time_mins, category,
         dietary_tags, calories_per_serving, protein_per_serving, carbs_per_serving, fat_per_serving,
         status, source_url, image_url, author_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'imported',$12,$13,$14)
       RETURNING id`,
      [title, description, servings, prepTimeMins || 0, cookTimeMins || 0, category,
       dietaryTags, caloriesPerServing || 0, proteinPerServing || 0,
       carbsPerServing || 0, fatPerServing || 0, url, imageUrl, req.user.id]
    );
    const recipeId = recipeRows[0].id;

    const rawIngredients = Array.isArray(schema.recipeIngredient) ? schema.recipeIngredient : [];
    for (let i = 0; i < rawIngredients.length; i++) {
      const parsed = parseIngredient(rawIngredients[i]);
      await db.query(
        `INSERT INTO recipe_ingredients (recipe_id, section, position, quantity, unit, name, notes)
         VALUES ($1,'Ingredients',$2,$3,$4,$5,'')`,
        [recipeId, i + 1, parsed.quantity, parsed.unit, parsed.name]
      );
    }

    const rawSteps = Array.isArray(schema.recipeInstructions) ? schema.recipeInstructions : [];
    let pos = 1;
    for (const step of rawSteps) {
      if (typeof step === 'string') {
        await db.query(
          `INSERT INTO recipe_steps (recipe_id, section, position, instruction) VALUES ($1,'Method',$2,$3)`,
          [recipeId, pos++, step]
        );
      } else if (step['@type'] === 'HowToStep') {
        await db.query(
          `INSERT INTO recipe_steps (recipe_id, section, position, instruction) VALUES ($1,'Method',$2,$3)`,
          [recipeId, pos++, step.text || step.name || '']
        );
      } else if (step['@type'] === 'HowToSection') {
        const sectionName = step.name || 'Method';
        const subSteps = Array.isArray(step.itemListElement) ? step.itemListElement : [];
        let subPos = 1;
        for (const sub of subSteps) {
          await db.query(
            `INSERT INTO recipe_steps (recipe_id, section, position, instruction) VALUES ($1,$2,$3,$4)`,
            [recipeId, sectionName, subPos++, sub.text || sub.name || '']
          );
        }
      }
    }

    // Parse ingredient references into steps
    await reparsStepIngredients(recipeId);

    // Return full recipe
    const { rows: fullRecipe } = await db.query('SELECT * FROM recipes WHERE id = $1', [recipeId]);
    const { rows: ingredients } = await db.query(
      'SELECT * FROM recipe_ingredients WHERE recipe_id = $1 ORDER BY section, position', [recipeId]
    );
    const { rows: steps } = await db.query(
      'SELECT * FROM recipe_steps WHERE recipe_id = $1 ORDER BY section, position', [recipeId]
    );
    res.status(201).json({ ...fullRecipe[0], ingredients, steps });
  } catch (err) {
    res.status(500).json({ error: 'Failed to import recipe', details: err.message });
  }
});

// ── Recipe Reviews ───────────────────────────────────────────────────────────

// Get reviews for a recipe (with username)
app.get('/recipes/:id/reviews', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `SELECT rr.id, rr.recipe_id, rr.user_id, rr.rating, rr.comment,
              rr.created_at, rr.updated_at, u.username
       FROM recipe_reviews rr
       JOIN users u ON u.id = rr.user_id
       WHERE rr.recipe_id = $1
       ORDER BY rr.created_at DESC`,
      [id]
    );
    // Also compute average rating
    const avg = rows.length > 0
      ? parseFloat((rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(1))
      : null;
    res.json({ reviews: rows, average_rating: avg, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reviews', details: err.message });
  }
});

// Add or update a review (one per user per recipe)
app.post('/recipes/:id/reviews', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating must be between 1 and 5' });
    }
    // Verify recipe exists
    const { rows: recipe } = await db.query('SELECT id FROM recipes WHERE id = $1', [id]);
    if (recipe.length === 0) return res.status(404).json({ error: 'Recipe not found' });

    const { rows } = await db.query(
      `INSERT INTO recipe_reviews (recipe_id, user_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (recipe_id, user_id) DO UPDATE SET
         rating = EXCLUDED.rating,
         comment = EXCLUDED.comment,
         updated_at = NOW()
       RETURNING *`,
      [id, req.user.id, rating, comment || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save review', details: err.message });
  }
});

// Delete own review
app.delete('/recipes/:id/reviews', authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM recipe_reviews WHERE recipe_id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Review not found' });
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete review', details: err.message });
  }
});

// Re-parse ingredient refs for an existing recipe (e.g. after editing ingredients)
app.post('/recipes/:id/reparse-steps', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query('SELECT id FROM recipes WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Recipe not found' });
    await reparsStepIngredients(id);
    const { rows: steps } = await db.query(
      'SELECT * FROM recipe_steps WHERE recipe_id = $1 ORDER BY section, position', [id]
    );
    res.json({ steps });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reparse steps', details: err.message });
  }
});

// Admin: bulk reparse all recipe ingredients with improved parser
app.post('/admin/reparse-ingredients', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { rows: ingredients } = await db.query(
      `SELECT ri.id, ri.quantity, ri.unit, ri.name, ri.notes,
              CONCAT_WS(' ', ri.quantity, ri.unit, ri.name) AS original_text
       FROM recipe_ingredients ri
       ORDER BY ri.id`
    );
    let updated = 0;
    for (const ing of ingredients) {
      // Reconstruct the original ingredient string and re-parse it
      const parts = [];
      if (ing.quantity) parts.push(String(ing.quantity));
      if (ing.unit) parts.push(ing.unit);
      parts.push(ing.name);
      if (ing.notes) parts.push(ing.notes);
      const raw = parts.join(' ');
      const parsed = parseIngredient(raw);
      // Only update if parsing produced different results
      if (parsed.quantity !== parseFloat(ing.quantity) || parsed.unit !== ing.unit || parsed.name !== ing.name) {
        await db.query(
          `UPDATE recipe_ingredients SET quantity = $1, unit = $2, name = $3, notes = COALESCE(NULLIF($4, ''), notes) WHERE id = $5`,
          [parsed.quantity, parsed.unit, parsed.name, parsed.notes || '', ing.id]
        );
        updated++;
      }
    }
    // Also reparse step ingredient refs for all recipes
    const { rows: recipes } = await db.query('SELECT id FROM recipes');
    for (const r of recipes) {
      await reparsStepIngredients(r.id);
    }
    res.json({ message: `Reparsed ${updated} ingredients across ${recipes.length} recipes` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reparse ingredients', details: err.message });
  }
});

// ── Meal plan templates ──────────────────────────────────────────────────────

// List user's templates
app.get('/meal-plan-templates', authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, created_at FROM meal_plan_templates WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch templates', details: err.message });
  }
});

// Save a week as a template
app.post('/meal-plan-templates', authenticateToken, async (req, res) => {
  try {
    const { name, slots } = req.body;
    if (!name || !slots || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ error: 'name and slots[] are required' });
    }
    const { rows } = await db.query(
      'INSERT INTO meal_plan_templates (user_id, name, slots) VALUES ($1, $2, $3) RETURNING id, name, created_at',
      [req.user.id, name.trim(), JSON.stringify(slots)]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save template', details: err.message });
  }
});

// Apply a template to a target week
app.post('/meal-plan-templates/:id/apply', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { weekStart } = req.body;
    if (!weekStart) return res.status(400).json({ error: 'weekStart is required' });

    const { rows } = await db.query(
      'SELECT slots FROM meal_plan_templates WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Template not found' });

    const slots = rows[0].slots;
    const baseDate = new Date(weekStart + 'T00:00:00');

    for (const slot of slots) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + slot.day_offset);
      const dateStr = d.toISOString().slice(0, 10);

      if (slot.recipe_id) {
        await db.query(
          `INSERT INTO meal_plans (user_id, date, meal_type, recipe_id, servings, last_updated)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (user_id, date, meal_type)
           DO UPDATE SET meal_id = NULL, recipe_id = EXCLUDED.recipe_id, servings = EXCLUDED.servings, last_updated = NOW()`,
          [req.user.id, dateStr, slot.meal_type, slot.recipe_id, slot.servings || 1]
        );
      } else if (slot.meal_id) {
        await db.query(
          `INSERT INTO meal_plans (user_id, date, meal_type, meal_id, servings, last_updated)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (user_id, date, meal_type)
           DO UPDATE SET recipe_id = NULL, meal_id = EXCLUDED.meal_id, servings = EXCLUDED.servings, last_updated = NOW()`,
          [req.user.id, dateStr, slot.meal_type, slot.meal_id, slot.servings || 1]
        );
      }
    }

    res.json({ success: true, applied: slots.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to apply template', details: err.message });
  }
});

// Delete a template
app.delete('/meal-plan-templates/:id', authenticateToken, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM meal_plan_templates WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Template not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete template', details: err.message });
  }
});

// ── Workout Tracking ──────────────────────────────────────────────

// List exercises (optional ?category= filter)
app.get('/exercises', async (req, res) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM exercises ORDER BY name';
    let params = [];
    if (category) {
      query = 'SELECT * FROM exercises WHERE category = $1 ORDER BY name';
      params.push(category);
    }
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch exercises', details: err.message });
  }
});

// Create exercise
app.post('/exercises', authenticateToken, async (req, res) => {
  try {
    const { name, category, muscle_groups } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows } = await db.query(
      'INSERT INTO exercises (name, category, muscle_groups) VALUES ($1, $2, $3) RETURNING *',
      [name, category || null, muscle_groups || []]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create exercise', details: err.message });
  }
});

// List user's workout logs (with sets), optional ?from=&to= date range
app.get('/workouts', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { from, to } = req.query;
    let dateFilter = '';
    const params = [userId];
    if (from && to) {
      dateFilter = ' AND wl.date BETWEEN $2 AND $3';
      params.push(from, to);
    }
    const { rows: logs } = await db.query(
      `SELECT wl.id, wl.date, wl.name, wl.notes, wl.created_at
       FROM workout_logs wl
       WHERE wl.user_id = $1${dateFilter}
       ORDER BY wl.date DESC, wl.created_at DESC`,
      params
    );
    if (logs.length === 0) return res.json([]);
    const logIds = logs.map(l => l.id);
    const { rows: sets } = await db.query(
      `SELECT ws.*, e.name AS exercise_name, e.category AS exercise_category
       FROM workout_sets ws
       LEFT JOIN exercises e ON ws.exercise_id = e.id
       WHERE ws.workout_log_id = ANY($1)
       ORDER BY ws.workout_log_id, ws.set_number`,
      [logIds]
    );
    const setsByLog = {};
    for (const s of sets) {
      if (!setsByLog[s.workout_log_id]) setsByLog[s.workout_log_id] = [];
      setsByLog[s.workout_log_id].push(s);
    }
    const result = logs.map(l => ({ ...l, sets: setsByLog[l.id] || [] }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch workouts', details: err.message });
  }
});

// Create workout log with sets
app.post('/workouts', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { date, name, notes, sets } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required' });
    const { rows } = await db.query(
      'INSERT INTO workout_logs (user_id, date, name, notes) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, date, name || null, notes || null]
    );
    const log = rows[0];
    if (sets && sets.length > 0) {
      for (const s of sets) {
        await db.query(
          `INSERT INTO workout_sets (workout_log_id, exercise_id, set_number, reps, weight_kg, duration_secs, distance_m)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [log.id, s.exercise_id, s.set_number, s.reps || null, s.weight_kg || null, s.duration_secs || null, s.distance_m || null]
        );
      }
    }
    // Return the full log with sets
    const { rows: allSets } = await db.query(
      `SELECT ws.*, e.name AS exercise_name, e.category AS exercise_category
       FROM workout_sets ws LEFT JOIN exercises e ON ws.exercise_id = e.id
       WHERE ws.workout_log_id = $1 ORDER BY ws.set_number`,
      [log.id]
    );
    res.status(201).json({ ...log, sets: allSets });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create workout', details: err.message });
  }
});

// Delete own workout
app.delete('/workouts/:id', authenticateToken, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM workout_logs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Workout not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete workout', details: err.message });
  }
});

// List user's workout templates
app.get('/workout-templates', authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM workout_templates WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch workout templates', details: err.message });
  }
});

// Save workout template
app.post('/workout-templates', authenticateToken, async (req, res) => {
  try {
    const { name, exercises } = req.body;
    if (!name || !exercises) return res.status(400).json({ error: 'name and exercises are required' });
    const { rows } = await db.query(
      'INSERT INTO workout_templates (user_id, name, exercises) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, name, JSON.stringify(exercises)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save workout template', details: err.message });
  }
});

// Delete workout template
app.delete('/workout-templates/:id', authenticateToken, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM workout_templates WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Template not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete workout template', details: err.message });
  }
});

// ── Strava Integration ───────────────────────────────────────────────

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const STRAVA_REDIRECT_URI = process.env.STRAVA_REDIRECT_URI || 'http://localhost/api/strava/callback';

// Helper: refresh Strava access token if expired
async function refreshStravaToken(conn) {
  if (Date.now() / 1000 < conn.expires_at - 60) return conn; // still valid
  try {
    const resp = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: conn.refresh_token,
      }),
    });
    if (!resp.ok) throw new Error('Strava token refresh failed');
    const data = await resp.json();
    await db.query(
      `UPDATE strava_connections SET access_token = $1, refresh_token = $2, expires_at = $3 WHERE user_id = $4`,
      [data.access_token, data.refresh_token, data.expires_at, conn.user_id]
    );
    return { ...conn, access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at };
  } catch (err) {
    console.error('[strava] Token refresh error:', err.message);
    throw err;
  }
}

// Map Strava activity type to exercise name
function stravaTypeToExercise(type) {
  const map = {
    Run: 'Running',
    Ride: 'Cycling',
    Swim: 'Swimming',
    Walk: 'Walking',
    Hike: 'Walking',
    VirtualRide: 'Cycling',
    VirtualRun: 'Running',
  };
  return map[type] || null;
}

// GET /strava/auth-url — returns the Strava OAuth authorization URL
app.get('/strava/auth-url', authenticateToken, (req, res) => {
  if (!STRAVA_CLIENT_ID) {
    return res.json({ available: false });
  }
  const url = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(STRAVA_REDIRECT_URI)}&scope=activity:read_all&state=${req.user.id}`;
  res.json({ available: true, url });
});

// GET /strava/callback — handles OAuth callback from Strava
app.get('/strava/callback', async (req, res) => {
  const { code, state } = req.query;
  const userId = Number(state);
  if (!code || !userId) {
    return res.redirect('/workouts?strava=error');
  }
  try {
    const resp = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    });
    if (!resp.ok) {
      console.error('[strava] Token exchange failed:', resp.status);
      return res.redirect('/workouts?strava=error');
    }
    const data = await resp.json();
    await db.query(
      `INSERT INTO strava_connections (user_id, strava_athlete_id, access_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         strava_athlete_id = EXCLUDED.strava_athlete_id,
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expires_at = EXCLUDED.expires_at`,
      [userId, data.athlete?.id, data.access_token, data.refresh_token, data.expires_at]
    );
    res.redirect('/workouts?strava=connected');
  } catch (err) {
    console.error('[strava] Callback error:', err.message);
    res.redirect('/workouts?strava=error');
  }
});

// GET /strava/status — returns connection status for current user
app.get('/strava/status', authenticateToken, async (req, res) => {
  if (!STRAVA_CLIENT_ID) {
    return res.json({ available: false, connected: false });
  }
  try {
    const { rows } = await db.query(
      'SELECT strava_athlete_id, created_at FROM strava_connections WHERE user_id = $1',
      [req.user.id]
    );
    res.json({
      available: true,
      connected: rows.length > 0,
      athlete_id: rows[0]?.strava_athlete_id || null,
      connected_at: rows[0]?.created_at || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check Strava status', details: err.message });
  }
});

// POST /strava/sync — fetches recent activities from Strava and imports as workout_logs
app.post('/strava/sync', authenticateToken, async (req, res) => {
  try {
    const { rows: connRows } = await db.query(
      'SELECT * FROM strava_connections WHERE user_id = $1',
      [req.user.id]
    );
    if (connRows.length === 0) {
      return res.status(400).json({ error: 'Strava not connected' });
    }

    let conn = connRows[0];
    conn = await refreshStravaToken(conn);

    // Fetch last 30 days of activities
    const after = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    const activitiesResp = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`,
      { headers: { Authorization: `Bearer ${conn.access_token}` } }
    );
    if (!activitiesResp.ok) {
      const errText = await activitiesResp.text();
      console.error('[strava] Activities fetch failed:', activitiesResp.status, errText);
      return res.status(502).json({ error: 'Failed to fetch Strava activities' });
    }
    const activities = await activitiesResp.json();

    let imported = 0;
    let skipped = 0;
    let stepsTotal = 0;
    const dailySteps = {}; // date -> estimated steps

    for (const act of activities) {
      // Skip already imported
      const existing = await db.query(
        'SELECT id FROM workout_logs WHERE user_id = $1 AND strava_activity_id = $2',
        [req.user.id, act.id]
      );
      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }

      // Determine exercise
      const exerciseName = stravaTypeToExercise(act.type);
      let exerciseId = null;
      if (exerciseName) {
        const exRow = await db.query('SELECT id FROM exercises WHERE name = $1', [exerciseName]);
        if (exRow.rows.length > 0) {
          exerciseId = exRow.rows[0].id;
        }
      }
      // Fallback: use HIIT for unmapped types
      if (!exerciseId) {
        const exRow = await db.query("SELECT id FROM exercises WHERE name = 'HIIT'");
        if (exRow.rows.length > 0) exerciseId = exRow.rows[0].id;
      }

      const actDate = act.start_date_local ? act.start_date_local.slice(0, 10) : act.start_date.slice(0, 10);
      const durationSecs = Math.round(act.moving_time || act.elapsed_time || 0);
      const distanceM = act.distance ? Math.round(act.distance) : null;

      // Create workout_log
      const { rows: logRows } = await db.query(
        `INSERT INTO workout_logs (user_id, date, name, notes, strava_activity_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [req.user.id, actDate, act.name || act.type, `Imported from Strava (${act.type})`, act.id]
      );
      const logId = logRows[0].id;

      // Create workout_set
      if (exerciseId) {
        await db.query(
          `INSERT INTO workout_sets (workout_log_id, exercise_id, set_number, duration_secs, distance_m)
           VALUES ($1, $2, 1, $3, $4)`,
          [logId, exerciseId, durationSecs, distanceM]
        );
      }

      // Estimate steps for walking/running activities (~1300 steps per km)
      if (['Run', 'Walk', 'Hike', 'VirtualRun'].includes(act.type) && distanceM) {
        const steps = Math.round((distanceM / 1000) * 1300);
        dailySteps[actDate] = (dailySteps[actDate] || 0) + steps;
        stepsTotal += steps;
      }

      imported++;
    }

    // Update daily_logs with estimated steps
    for (const [dateStr, steps] of Object.entries(dailySteps)) {
      await db.query(
        `INSERT INTO daily_logs (user_id, date, steps)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, date)
         DO UPDATE SET steps = COALESCE(daily_logs.steps, 0) + $3`,
        [req.user.id, dateStr, steps]
      );
    }

    res.json({ imported, skipped, estimated_steps: stepsTotal });
  } catch (err) {
    console.error('[strava] Sync error:', err.message);
    res.status(500).json({ error: 'Strava sync failed', details: err.message });
  }
});

// DELETE /strava/disconnect — removes the connection
app.delete('/strava/disconnect', authenticateToken, async (req, res) => {
  try {
    await db.query('DELETE FROM strava_connections WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disconnect Strava', details: err.message });
  }
});

// ── Recipe Collections ──────────────────────────────────────────────────────

// List user's collections with recipe count
app.get('/collections', authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT rc.id, rc.name, rc.created_at, COUNT(rci.id)::int AS recipe_count
       FROM recipe_collections rc
       LEFT JOIN recipe_collection_items rci ON rci.collection_id = rc.id
       WHERE rc.user_id = $1
       GROUP BY rc.id
       ORDER BY rc.name`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch collections', details: err.message });
  }
});

// Get a single collection with its recipes
app.get('/collections/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: colRows } = await db.query(
      'SELECT * FROM recipe_collections WHERE id = $1 AND user_id = $2', [id, req.user.id]
    );
    if (colRows.length === 0) return res.status(404).json({ error: 'Collection not found' });
    const { rows: recipes } = await db.query(
      `SELECT r.id, r.title, r.description, r.category, r.servings, r.image_url,
              r.calories_per_serving, r.protein_per_serving, r.carbs_per_serving, r.fat_per_serving,
              r.dietary_tags, r.prep_time_mins, r.cook_time_mins, rci.added_at
       FROM recipe_collection_items rci
       JOIN recipes r ON r.id = rci.recipe_id
       WHERE rci.collection_id = $1
       ORDER BY rci.added_at DESC`,
      [id]
    );
    res.json({ ...colRows[0], recipes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch collection', details: err.message });
  }
});

// Create a collection
app.post('/collections', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Collection name is required' });
    const { rows } = await db.query(
      'INSERT INTO recipe_collections (user_id, name) VALUES ($1, $2) RETURNING *',
      [req.user.id, name.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create collection', details: err.message });
  }
});

// Delete a collection
app.delete('/collections/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await db.query(
      'DELETE FROM recipe_collections WHERE id = $1 AND user_id = $2', [id, req.user.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Collection not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete collection', details: err.message });
  }
});

// Add recipe to collection
app.post('/collections/:id/recipes', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { recipe_id } = req.body;
    // Verify collection belongs to user
    const { rows: colRows } = await db.query(
      'SELECT id FROM recipe_collections WHERE id = $1 AND user_id = $2', [id, req.user.id]
    );
    if (colRows.length === 0) return res.status(404).json({ error: 'Collection not found' });
    await db.query(
      'INSERT INTO recipe_collection_items (collection_id, recipe_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, recipe_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add recipe to collection', details: err.message });
  }
});

// Remove recipe from collection
app.delete('/collections/:id/recipes/:recipeId', authenticateToken, async (req, res) => {
  try {
    const { id, recipeId } = req.params;
    // Verify collection belongs to user
    const { rows: colRows } = await db.query(
      'SELECT id FROM recipe_collections WHERE id = $1 AND user_id = $2', [id, req.user.id]
    );
    if (colRows.length === 0) return res.status(404).json({ error: 'Collection not found' });
    await db.query(
      'DELETE FROM recipe_collection_items WHERE collection_id = $1 AND recipe_id = $2',
      [id, recipeId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove recipe from collection', details: err.message });
  }
});

// Get which collections a recipe is in (for the bookmark UI)
app.get('/recipes/:id/collections', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `SELECT rc.id, rc.name, (rci.id IS NOT NULL) AS in_collection
       FROM recipe_collections rc
       LEFT JOIN recipe_collection_items rci ON rci.collection_id = rc.id AND rci.recipe_id = $1
       WHERE rc.user_id = $2
       ORDER BY rc.name`,
      [id, req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recipe collections', details: err.message });
  }
});

// ── Admin: Recipe approval queue ────────────────────────────────────────────
app.get('/admin/recipes/pending', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT r.*, u.username AS author_name
       FROM recipes r
       LEFT JOIN users u ON u.id = r.author_id
       WHERE r.status = 'pending'
       ORDER BY r.created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending recipes', details: err.message });
  }
});

app.put('/admin/recipes/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `UPDATE recipes SET status = 'community', updated_at = NOW() WHERE id = $1 AND status = 'pending' RETURNING id, title`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Recipe not found or not pending' });
    res.json({ message: 'Recipe approved', recipe: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve recipe', details: err.message });
  }
});

app.put('/admin/recipes/:id/reject', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const { rows } = await db.query(
      `UPDATE recipes SET status = 'personal', updated_at = NOW() WHERE id = $1 AND status = 'pending' RETURNING id, title`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Recipe not found or not pending' });
    res.json({ message: 'Recipe rejected', recipe: rows[0], reason: reason || 'No reason given' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject recipe', details: err.message });
  }
});

// ── Data Export (CSV) ────────────────────────────────────────────────────────

// CSV helper — escapes fields and joins into a CSV row
function csvEscape(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
function csvRow(fields) { return fields.map(csvEscape).join(',') + '\n'; }

function setCsvHeaders(res, filename) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
}

// Export meal plans
app.get('/export/meal-plans', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const from = req.query.from || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const { rows } = await db.query(
      `SELECT mp.date, mp.meal_type, COALESCE(m.name, r.title) AS meal_name, mp.servings,
              ROUND(COALESCE(m.calories, r.calories_per_serving) * mp.servings) AS calories,
              ROUND(COALESCE(m.protein_g, r.protein_per_serving) * mp.servings, 1) AS protein_g,
              ROUND(COALESCE(m.carbs_g, r.carbs_per_serving) * mp.servings, 1) AS carbs_g,
              ROUND(COALESCE(m.fat_g, r.fat_per_serving) * mp.servings, 1) AS fat_g
       FROM meal_plans mp
       LEFT JOIN meals m ON mp.meal_id = m.id
       LEFT JOIN recipes r ON mp.recipe_id = r.id
       WHERE mp.user_id = $1 AND mp.date BETWEEN $2 AND $3
       ORDER BY mp.date, mp.meal_type`,
      [userId, from, to]
    );
    setCsvHeaders(res, `meal-plans-${from}-to-${to}.csv`);
    res.write(csvRow(['Date', 'Meal Type', 'Meal Name', 'Servings', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)']));
    for (const r of rows) {
      const d = typeof r.date === 'string' ? r.date.slice(0, 10) : r.date.toISOString().slice(0, 10);
      res.write(csvRow([d, r.meal_type, r.meal_name, r.servings, r.calories, r.protein_g, r.carbs_g, r.fat_g]));
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to export meal plans', details: err.message });
  }
});

// Export recipes
app.get('/export/recipes', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await db.query(
      `SELECT title, category, servings, prep_time_mins, cook_time_mins,
              calories_per_serving, protein_per_serving, carbs_per_serving, fat_per_serving,
              dietary_tags, source_url, status, created_at
       FROM recipes WHERE author_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    setCsvHeaders(res, 'recipes.csv');
    res.write(csvRow(['Title', 'Category', 'Servings', 'Prep Time (min)', 'Cook Time (min)',
      'Calories/Serving', 'Protein/Serving', 'Carbs/Serving', 'Fat/Serving', 'Dietary Tags', 'Source URL', 'Status', 'Created']));
    for (const r of rows) {
      const d = r.created_at ? r.created_at.toISOString().slice(0, 10) : '';
      res.write(csvRow([r.title, r.category, r.servings, r.prep_time_mins, r.cook_time_mins,
        r.calories_per_serving, r.protein_per_serving, r.carbs_per_serving, r.fat_per_serving,
        (r.dietary_tags || []).join('; '), r.source_url, r.status, d]));
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to export recipes', details: err.message });
  }
});

// Export recipe ingredients
app.get('/export/recipes/ingredients', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await db.query(
      `SELECT r.title AS recipe_title, ri.section, ri.position, ri.quantity, ri.unit, ri.name, ri.notes
       FROM recipe_ingredients ri
       JOIN recipes r ON r.id = ri.recipe_id
       WHERE r.author_id = $1
       ORDER BY r.title, ri.section, ri.position`,
      [userId]
    );
    setCsvHeaders(res, 'recipe-ingredients.csv');
    res.write(csvRow(['Recipe Title', 'Section', 'Position', 'Quantity', 'Unit', 'Ingredient Name', 'Notes']));
    for (const r of rows) {
      res.write(csvRow([r.recipe_title, r.section, r.position, r.quantity, r.unit, r.name, r.notes]));
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to export ingredients', details: err.message });
  }
});

// Export daily logs
app.get('/export/daily-logs', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    let query = 'SELECT date, weight_kg, sleep_hours, sleep_quality, water_ml, steps, notes FROM daily_logs WHERE user_id = $1';
    const params = [userId];
    if (req.query.from) { params.push(req.query.from); query += ` AND date >= $${params.length}`; }
    if (req.query.to) { params.push(req.query.to); query += ` AND date <= $${params.length}`; }
    query += ' ORDER BY date DESC';
    const { rows } = await db.query(query, params);
    setCsvHeaders(res, 'daily-logs.csv');
    res.write(csvRow(['Date', 'Weight (kg)', 'Sleep (hours)', 'Sleep Quality (1-5)', 'Water (ml)', 'Steps', 'Notes']));
    for (const r of rows) {
      const d = typeof r.date === 'string' ? r.date.slice(0, 10) : r.date.toISOString().slice(0, 10);
      res.write(csvRow([d, r.weight_kg, r.sleep_hours, r.sleep_quality, r.water_ml, r.steps, r.notes]));
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to export daily logs', details: err.message });
  }
});

// Export workouts
app.get('/export/workouts', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    let query = `SELECT wl.date, wl.name AS workout_name, e.name AS exercise_name,
                        ws.set_number, ws.reps, ws.weight_kg, ws.duration_secs, ws.distance_m, wl.notes
                 FROM workout_logs wl
                 LEFT JOIN workout_sets ws ON ws.workout_log_id = wl.id
                 LEFT JOIN exercises e ON e.id = ws.exercise_id
                 WHERE wl.user_id = $1`;
    const params = [userId];
    if (req.query.from) { params.push(req.query.from); query += ` AND wl.date >= $${params.length}`; }
    if (req.query.to) { params.push(req.query.to); query += ` AND wl.date <= $${params.length}`; }
    query += ' ORDER BY wl.date DESC, wl.id, ws.set_number';
    const { rows } = await db.query(query, params);
    setCsvHeaders(res, 'workouts.csv');
    res.write(csvRow(['Date', 'Workout Name', 'Exercise', 'Set', 'Reps', 'Weight (kg)', 'Duration (secs)', 'Distance (m)', 'Notes']));
    for (const r of rows) {
      const d = typeof r.date === 'string' ? r.date.slice(0, 10) : r.date.toISOString().slice(0, 10);
      res.write(csvRow([d, r.workout_name, r.exercise_name, r.set_number, r.reps, r.weight_kg, r.duration_secs, r.distance_m, r.notes]));
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to export workouts', details: err.message });
  }
});

// Export all data as zip
app.get('/export/all', authenticateToken, async (req, res) => {
  try {
    const archiver = require('archiver');
    const userId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="meal-planner-export-${today}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    // Helper to build CSV string
    const buildCsv = (headers, rows, rowFn) => {
      let csv = csvRow(headers);
      for (const r of rows) csv += csvRow(rowFn(r));
      return csv;
    };

    // Meal plans (last year)
    const from = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const { rows: mealRows } = await db.query(
      `SELECT mp.date, mp.meal_type, COALESCE(m.name, r.title) AS meal_name, mp.servings,
              ROUND(COALESCE(m.calories, r.calories_per_serving) * mp.servings) AS calories,
              ROUND(COALESCE(m.protein_g, r.protein_per_serving) * mp.servings, 1) AS protein_g,
              ROUND(COALESCE(m.carbs_g, r.carbs_per_serving) * mp.servings, 1) AS carbs_g,
              ROUND(COALESCE(m.fat_g, r.fat_per_serving) * mp.servings, 1) AS fat_g
       FROM meal_plans mp LEFT JOIN meals m ON mp.meal_id = m.id LEFT JOIN recipes r ON mp.recipe_id = r.id
       WHERE mp.user_id = $1 AND mp.date >= $2 ORDER BY mp.date, mp.meal_type`,
      [userId, from]
    );
    archive.append(buildCsv(
      ['Date', 'Meal Type', 'Meal Name', 'Servings', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)'],
      mealRows, r => {
        const d = typeof r.date === 'string' ? r.date.slice(0, 10) : r.date.toISOString().slice(0, 10);
        return [d, r.meal_type, r.meal_name, r.servings, r.calories, r.protein_g, r.carbs_g, r.fat_g];
      }
    ), { name: 'meal-plans.csv' });

    // Recipes
    const { rows: recipeRows } = await db.query(
      `SELECT title, category, servings, prep_time_mins, cook_time_mins, calories_per_serving,
              protein_per_serving, carbs_per_serving, fat_per_serving, dietary_tags, source_url, status, created_at
       FROM recipes WHERE author_id = $1 ORDER BY created_at DESC`, [userId]
    );
    archive.append(buildCsv(
      ['Title', 'Category', 'Servings', 'Prep Time (min)', 'Cook Time (min)', 'Calories/Serving', 'Protein/Serving', 'Carbs/Serving', 'Fat/Serving', 'Dietary Tags', 'Source URL', 'Status', 'Created'],
      recipeRows, r => [r.title, r.category, r.servings, r.prep_time_mins, r.cook_time_mins, r.calories_per_serving, r.protein_per_serving, r.carbs_per_serving, r.fat_per_serving, (r.dietary_tags || []).join('; '), r.source_url, r.status, r.created_at ? r.created_at.toISOString().slice(0, 10) : '']
    ), { name: 'recipes.csv' });

    // Recipe ingredients
    const { rows: ingRows } = await db.query(
      `SELECT r.title AS recipe_title, ri.section, ri.position, ri.quantity, ri.unit, ri.name, ri.notes
       FROM recipe_ingredients ri JOIN recipes r ON r.id = ri.recipe_id WHERE r.author_id = $1
       ORDER BY r.title, ri.section, ri.position`, [userId]
    );
    archive.append(buildCsv(
      ['Recipe Title', 'Section', 'Position', 'Quantity', 'Unit', 'Ingredient Name', 'Notes'],
      ingRows, r => [r.recipe_title, r.section, r.position, r.quantity, r.unit, r.name, r.notes]
    ), { name: 'recipe-ingredients.csv' });

    // Daily logs
    const { rows: logRows } = await db.query(
      'SELECT date, weight_kg, sleep_hours, sleep_quality, water_ml, steps, notes FROM daily_logs WHERE user_id = $1 ORDER BY date DESC', [userId]
    );
    archive.append(buildCsv(
      ['Date', 'Weight (kg)', 'Sleep (hours)', 'Sleep Quality (1-5)', 'Water (ml)', 'Steps', 'Notes'],
      logRows, r => {
        const d = typeof r.date === 'string' ? r.date.slice(0, 10) : r.date.toISOString().slice(0, 10);
        return [d, r.weight_kg, r.sleep_hours, r.sleep_quality, r.water_ml, r.steps, r.notes];
      }
    ), { name: 'daily-logs.csv' });

    // Workouts
    const { rows: workoutRows } = await db.query(
      `SELECT wl.date, wl.name AS workout_name, e.name AS exercise_name,
              ws.set_number, ws.reps, ws.weight_kg, ws.duration_secs, ws.distance_m, wl.notes
       FROM workout_logs wl LEFT JOIN workout_sets ws ON ws.workout_log_id = wl.id
       LEFT JOIN exercises e ON e.id = ws.exercise_id
       WHERE wl.user_id = $1 ORDER BY wl.date DESC, wl.id, ws.set_number`, [userId]
    );
    archive.append(buildCsv(
      ['Date', 'Workout Name', 'Exercise', 'Set', 'Reps', 'Weight (kg)', 'Duration (secs)', 'Distance (m)', 'Notes'],
      workoutRows, r => {
        const d = typeof r.date === 'string' ? r.date.slice(0, 10) : r.date.toISOString().slice(0, 10);
        return [d, r.workout_name, r.exercise_name, r.set_number, r.reps, r.weight_kg, r.duration_secs, r.distance_m, r.notes];
      }
    ), { name: 'workouts.csv' });

    await archive.finalize();
  } catch (err) {
    console.error('[export] Zip error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to export data', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
