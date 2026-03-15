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
      instruction TEXT NOT NULL,
      ingredient_refs JSONB DEFAULT '[]'
    )
  `);
  // Add dietary_requirement to user_profiles if it doesn't exist (safe migration for existing volumes)
  await db.query(`
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS dietary_requirement VARCHAR(50)
  `);
  // Add ingredient_refs to recipe_steps if it doesn't exist (safe migration for existing volumes)
  await db.query(`
    ALTER TABLE recipe_steps ADD COLUMN IF NOT EXISTS ingredient_refs JSONB DEFAULT '[]'
  `);
  // Add recipe_id to meal_plans if it doesn't exist (safe migration for existing volumes)
  await db.query(`
    ALTER TABLE meal_plans ADD COLUMN IF NOT EXISTS recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL
  `);
  // Meal plan templates table
  await db.query(`
    CREATE TABLE IF NOT EXISTS meal_plan_templates (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      slots JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  // Recipe reviews table
  await db.query(`
    CREATE TABLE IF NOT EXISTS recipe_reviews (
      id SERIAL PRIMARY KEY,
      recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(recipe_id, user_id)
    )
  `);
  // Strava OAuth connections
  await db.query(`
    CREATE TABLE IF NOT EXISTS strava_connections (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      strava_athlete_id BIGINT,
      access_token TEXT,
      refresh_token TEXT,
      expires_at BIGINT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  // Add steps column to daily_logs if missing
  await db.query(`
    ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS steps INTEGER
  `);
  // Add strava_activity_id to workout_logs for dedup
  await db.query(`
    ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS strava_activity_id BIGINT
  `);
  // Workout tracking tables
  await db.query(`
    CREATE TABLE IF NOT EXISTS exercises (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      category VARCHAR(30),
      muscle_groups TEXT[]
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS workout_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      name VARCHAR(100),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS workout_sets (
      id SERIAL PRIMARY KEY,
      workout_log_id INTEGER REFERENCES workout_logs(id) ON DELETE CASCADE,
      exercise_id INTEGER REFERENCES exercises(id),
      set_number INTEGER,
      reps INTEGER,
      weight_kg NUMERIC,
      duration_secs INTEGER,
      distance_m NUMERIC
    )
  `);
  // Workout templates table
  await db.query(`
    CREATE TABLE IF NOT EXISTS workout_templates (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      exercises JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
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

async function seedExercises() {
  const exercises = [
    // Strength — barbell / machine
    { name: 'Bench Press', category: 'Strength', muscle_groups: ['Chest', 'Triceps', 'Shoulders'] },
    { name: 'Incline Bench Press', category: 'Strength', muscle_groups: ['Chest', 'Shoulders'] },
    { name: 'Squat', category: 'Strength', muscle_groups: ['Quads', 'Glutes', 'Hamstrings'] },
    { name: 'Deadlift', category: 'Strength', muscle_groups: ['Back', 'Glutes', 'Hamstrings'] },
    { name: 'Overhead Press', category: 'Strength', muscle_groups: ['Shoulders', 'Triceps'] },
    { name: 'Barbell Row', category: 'Strength', muscle_groups: ['Back', 'Biceps'] },
    { name: 'Dumbbell Curl', category: 'Strength', muscle_groups: ['Biceps'] },
    { name: 'Tricep Pushdown', category: 'Strength', muscle_groups: ['Triceps'] },
    { name: 'Lateral Raise', category: 'Strength', muscle_groups: ['Shoulders'] },
    { name: 'Leg Press', category: 'Strength', muscle_groups: ['Quads', 'Glutes'] },
    { name: 'Romanian Deadlift', category: 'Strength', muscle_groups: ['Hamstrings', 'Glutes'] },
    { name: 'Cable Row', category: 'Strength', muscle_groups: ['Back', 'Biceps'] },
    { name: 'Lat Pulldown', category: 'Strength', muscle_groups: ['Back', 'Biceps'] },
    // Bodyweight
    { name: 'Pull-ups', category: 'Bodyweight', muscle_groups: ['Back', 'Biceps'] },
    { name: 'Plank', category: 'Bodyweight', muscle_groups: ['Core'] },
    { name: 'Lunges', category: 'Bodyweight', muscle_groups: ['Quads', 'Glutes'] },
    { name: 'Push-ups', category: 'Bodyweight', muscle_groups: ['Chest', 'Triceps'] },
    { name: 'Dips', category: 'Bodyweight', muscle_groups: ['Chest', 'Triceps'] },
    // Cardio
    { name: 'Running', category: 'Cardio', muscle_groups: ['Legs', 'Cardio'] },
    { name: 'Cycling', category: 'Cardio', muscle_groups: ['Legs', 'Cardio'] },
    { name: 'Swimming', category: 'Cardio', muscle_groups: ['Full Body'] },
    { name: 'Rowing Machine', category: 'Cardio', muscle_groups: ['Full Body'] },
    { name: 'Elliptical', category: 'Cardio', muscle_groups: ['Full Body'] },
    { name: 'Jump Rope', category: 'Cardio', muscle_groups: ['Full Body'] },
    { name: 'Walking', category: 'Cardio', muscle_groups: ['Legs'] },
    { name: 'HIIT', category: 'Cardio', muscle_groups: ['Full Body'] },
  ];
  let seeded = 0;
  for (const e of exercises) {
    const existing = await db.query('SELECT id FROM exercises WHERE name = $1', [e.name]);
    if (existing.rows.length > 0) continue;
    await db.query(
      'INSERT INTO exercises (name, category, muscle_groups) VALUES ($1, $2, $3)',
      [e.name, e.category, e.muscle_groups]
    );
    seeded++;
  }
  if (seeded > 0) console.log(`[startup-seed] Seeded ${seeded} exercises.`);
}

async function runStartupSeed() {
  try {
    await ensureTables();
    await seedRecipes();
    await seedExercises();
    console.log('[startup-seed] Done.');
  } catch (err) {
    console.error('[startup-seed] Error:', err.message);
  }
}

module.exports = runStartupSeed;
