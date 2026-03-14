const db = require('./db');
const recipes = require('../data/recipes-seed.json');

async function ensureTables() {
  // Create recipe tables if they don't exist (handles existing volumes without init.sql re-run)
  await db.query(`
    CREATE TABLE IF NOT EXISTS recipes (
      id SERIAL PRIMARY KEY,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      servings INTEGER DEFAULT 2,
      prep_time_mins INTEGER DEFAULT 0,
      cook_time_mins INTEGER DEFAULT 0,
      category VARCHAR(20) CHECK (category IN ('Breakfast','Lunch','Dinner','Snacks')),
      dietary_tags TEXT[] DEFAULT '{}',
      calories_per_serving NUMERIC DEFAULT 0,
      protein_per_serving NUMERIC DEFAULT 0,
      carbs_per_serving NUMERIC DEFAULT 0,
      fat_per_serving NUMERIC DEFAULT 0,
      status VARCHAR(20) DEFAULT 'community',
      source_url TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id SERIAL PRIMARY KEY,
      recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
      section VARCHAR(100) DEFAULT 'Ingredients',
      position INTEGER,
      quantity NUMERIC,
      unit VARCHAR(30),
      name VARCHAR(150) NOT NULL,
      notes VARCHAR(200)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS recipe_steps (
      id SERIAL PRIMARY KEY,
      recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
      section VARCHAR(100) DEFAULT 'Method',
      position INTEGER,
      instruction TEXT NOT NULL
    )
  `);
  // Add recipe_id to meal_plans if it doesn't exist (safe migration for existing volumes)
  await db.query(`
    ALTER TABLE meal_plans ADD COLUMN IF NOT EXISTS recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL
  `);
}

async function seedRecipes() {
  // Insert each recipe by title — skips ones that already exist, adds new ones
  let seeded = 0;
  for (const r of recipes) {
    const existing = await db.query('SELECT id FROM recipes WHERE title = $1', [r.title]);
    if (existing.rows.length > 0) continue;

    const { rows } = await db.query(
      `INSERT INTO recipes (title, description, servings, prep_time_mins, cook_time_mins, category,
         dietary_tags, calories_per_serving, protein_per_serving, carbs_per_serving, fat_per_serving, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [r.title, r.description, r.servings, r.prep_time_mins, r.cook_time_mins, r.category,
       r.dietary_tags, r.calories_per_serving, r.protein_per_serving, r.carbs_per_serving,
       r.fat_per_serving, r.status || 'community']
    );
    if (rows.length === 0) continue;
    const recipeId = rows[0].id;
    for (const ing of (r.ingredients || [])) {
      await db.query(
        `INSERT INTO recipe_ingredients (recipe_id,section,position,quantity,unit,name,notes) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [recipeId, ing.section || 'Ingredients', ing.position, ing.quantity, ing.unit, ing.name, ing.notes || '']
      );
    }
    for (const step of (r.steps || [])) {
      await db.query(
        `INSERT INTO recipe_steps (recipe_id,section,position,instruction) VALUES ($1,$2,$3,$4)`,
        [recipeId, step.section || 'Method', step.position, step.instruction]
      );
    }
    seeded++;
  }
  console.log(`[startup-seed] Seeded ${seeded} recipes.`);
}

async function runStartupSeed() {
  try {
    await ensureTables();
    await seedRecipes();
    console.log('[startup-seed] Done.');
  } catch (err) {
    console.error('[startup-seed] Error:', err.message);
  }
}

module.exports = runStartupSeed;
