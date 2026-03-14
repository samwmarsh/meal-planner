require('dotenv').config();

const express = require('express');
const cors = require('cors');
const db = require('./db');
const runStartupSeed = require('./startup-seed');
const authRoutes = require('./auth');
const { authenticateToken } = require('./middleware/auth');

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
              r.title AS recipe_title,
              mp.date, mp.meal_type, mp.servings
       FROM recipe_ingredients ri
       JOIN recipes r ON r.id = ri.recipe_id
       JOIN meal_plans mp ON mp.recipe_id = ri.recipe_id
       WHERE mp.user_id = $1 AND mp.date BETWEEN $2 AND $3 AND mp.recipe_id IS NOT NULL
       ORDER BY ri.name, mp.date, ri.section`,
      [userId, startStr, endStr]
    );

    // Aggregate by (name lowercased, unit)
    const ingMap = new Map();
    for (const row of ingRows) {
      const key = `${row.name.toLowerCase()}||${row.unit || ''}`;
      const hasQty = row.quantity != null && parseFloat(row.quantity) > 0;
      const rawQty = hasQty ? parseFloat(row.quantity) : null;
      const scaledQty = rawQty != null ? rawQty * parseFloat(row.servings || 1) : null;
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
          totalQuantity: scaledQty,   // null if no numeric quantity
          unit: row.unit || '',
          section: row.section || 'Ingredients',
          uses: [use],
        });
      }
    }

    const ingredients = Array.from(ingMap.values())
      .map(entry => ({
        ...entry,
        totalQuantity: entry.totalQuantity != null ? Math.round(entry.totalQuantity * 100) / 100 : null,
        multipleUses: entry.uses.length > 1,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ week: startStr, meals, totals, ingredients });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shopping list', details: err.message });
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
              up.weight_unit, up.height_unit, up.updated_at,
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
      weight_unit,
      height_unit,
    } = req.body;
    const { rows } = await db.query(
      `INSERT INTO user_profiles
         (user_id, date_of_birth, sex, height_cm, activity_level, goal, goal_pace, protein_pct, carbs_pct, fat_pct, weight_unit, height_unit, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
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
    const { category, search, tags } = req.query;
    let query = `SELECT id, title, description, servings, prep_time_mins, cook_time_mins,
                        category, dietary_tags, calories_per_serving, protein_per_serving,
                        carbs_per_serving, fat_per_serving, status, source_url, created_at
                 FROM recipes WHERE 1=1`;
    const params = [];
    if (category) { params.push(category); query += ` AND category = $${params.length}`; }
    if (search) { params.push(`%${search.toLowerCase()}%`); query += ` AND LOWER(title) LIKE $${params.length}`; }
    query += ' ORDER BY created_at DESC';
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recipes', details: err.message });
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

// Update recipe metadata
app.patch('/recipes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, category, description, servings, prep_time_mins, cook_time_mins,
            calories_per_serving, protein_per_serving, carbs_per_serving, fat_per_serving } = req.body;
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
         updated_at           = NOW()
       WHERE id = $11
       RETURNING *`,
      [title ?? null, category ?? null, description ?? null,
       servings ?? null, prep_time_mins ?? null, cook_time_mins ?? null,
       calories_per_serving ?? null, protein_per_serving ?? null,
       carbs_per_serving ?? null, fat_per_serving ?? null, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Recipe not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update recipe', details: err.message });
  }
});

// ── Recipe import helpers ─────────────────────────────────────────────────────

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
  return tags;
}

function parseIngredient(str) {
  if (!str) return { quantity: null, unit: null, name: str };
  // Normalise unicode fractions
  const s = str.trim()
    .replace(/½/g, '0.5').replace(/¼/g, '0.25').replace(/¾/g, '0.75')
    .replace(/⅓/g, '0.333').replace(/⅔/g, '0.667');

  const UNITS = ['g','kg','ml','l','oz','lb','lbs','cup','cups','tbsp','tsp','tablespoon',
                 'tablespoons','teaspoon','teaspoons','piece','pieces','clove','cloves',
                 'slice','slices','bunch','handful','pinch','can','cans','tin','tins'];

  const tokens = s.split(/\s+/);
  let quantity = null;
  let unit = null;
  let nameStart = 0;

  // Handle mixed numbers e.g. "1 1/2"
  if (tokens.length >= 2 && /^\d+$/.test(tokens[0]) && /^\d+\/\d+$/.test(tokens[1])) {
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

  if (nameStart < tokens.length && UNITS.includes(tokens[nameStart].toLowerCase())) {
    unit = tokens[nameStart].toLowerCase();
    nameStart++;
  }

  const name = tokens.slice(nameStart).join(' ').replace(/^,\s*/, '') || str;
  return { quantity: quantity || null, unit: unit || null, name };
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

  for (const ing of ingredients) {
    if (seen.has(ing.id)) continue;

    // Build candidate match terms: full name, then each word >3 chars (avoids "the","and" etc)
    const nameLower = ing.name.toLowerCase().trim();
    const words = nameLower.split(/\s+/).filter(w => w.length > 3);
    const candidates = [nameLower, ...words];

    let foundIdx = -1;
    for (const candidate of candidates) {
      const idx = text.indexOf(candidate);
      if (idx !== -1) { foundIdx = idx; break; }
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

    const { rows: recipeRows } = await db.query(
      `INSERT INTO recipes (title, description, servings, prep_time_mins, cook_time_mins, category,
         dietary_tags, calories_per_serving, protein_per_serving, carbs_per_serving, fat_per_serving,
         status, source_url, author_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'imported',$12,$13)
       RETURNING id`,
      [title, description, servings, prepTimeMins || 0, cookTimeMins || 0, category,
       dietaryTags, caloriesPerServing || 0, proteinPerServing || 0,
       carbsPerServing || 0, fatPerServing || 0, url, req.user.id]
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

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
