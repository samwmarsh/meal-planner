-- Meal Planner — initial schema
-- This file runs automatically when the PostgreSQL container starts for the first time.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meals (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('Breakfast', 'Lunch', 'Dinner', 'Snacks')),
  calories INTEGER DEFAULT 0,
  protein_g NUMERIC(6,1) DEFAULT 0,
  carbs_g NUMERIC(6,1) DEFAULT 0,
  fat_g NUMERIC(6,1) DEFAULT 0,
  serving_size_g INTEGER DEFAULT 100
);

CREATE TABLE IF NOT EXISTS meal_plans (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  meal_type VARCHAR(20) NOT NULL,
  meal_id INTEGER REFERENCES meals(id) ON DELETE SET NULL,
  servings NUMERIC(4,2) DEFAULT 1,
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, date, meal_type)
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  date_of_birth DATE,
  sex VARCHAR(10),
  height_cm NUMERIC,
  activity_level VARCHAR(30) DEFAULT 'moderately active',
  goal VARCHAR(30) DEFAULT 'maintain',
  goal_pace VARCHAR(20) DEFAULT 'moderate',
  protein_pct NUMERIC DEFAULT 30,
  carbs_pct NUMERIC DEFAULT 40,
  fat_pct NUMERIC DEFAULT 30,
  dietary_requirement VARCHAR(50),
  weight_unit VARCHAR(10) DEFAULT 'kg',
  height_unit VARCHAR(10) DEFAULT 'cm',
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  weight_kg NUMERIC,
  sleep_hours NUMERIC,
  sleep_quality SMALLINT CHECK (sleep_quality BETWEEN 1 AND 5),
  water_ml INTEGER,
  steps INTEGER,
  notes TEXT,
  UNIQUE(user_id, date)
);

-- Dev seed user (username: sam, password: sam, admin role)
INSERT INTO users (username, password_hash, role) VALUES
  ('sam', '$2b$10$9GxSG8o/SOd6F9P/6PRqIOSQoeSPeEPAqQdjtakrKL.92mMkSokja', 'admin')
ON CONFLICT DO NOTHING;

-- Sample meal library
INSERT INTO meals (name, type, calories, protein_g, carbs_g, fat_g) VALUES
  ('Oatmeal', 'Breakfast', 150, 5.0, 27.0, 3.0),
  ('Scrambled Eggs', 'Breakfast', 200, 14.0, 2.0, 15.0),
  ('Greek Yogurt & Berries', 'Breakfast', 180, 15.0, 22.0, 4.0),
  ('Avocado Toast', 'Breakfast', 280, 8.0, 30.0, 15.0),
  ('Caesar Salad', 'Lunch', 350, 8.0, 20.0, 28.0),
  ('Chicken Sandwich', 'Lunch', 450, 35.0, 45.0, 12.0),
  ('Tomato Soup', 'Lunch', 120, 3.0, 18.0, 4.0),
  ('Grain Bowl', 'Lunch', 420, 18.0, 55.0, 12.0),
  ('Grilled Chicken & Veg', 'Dinner', 380, 45.0, 15.0, 12.0),
  ('Pasta Bolognese', 'Dinner', 520, 28.0, 65.0, 15.0),
  ('Salmon & Roasted Veg', 'Dinner', 420, 40.0, 20.0, 18.0),
  ('Stir Fry', 'Dinner', 380, 25.0, 40.0, 12.0),
  ('Apple & Peanut Butter', 'Snacks', 200, 5.0, 25.0, 10.0),
  ('Protein Bar', 'Snacks', 220, 20.0, 25.0, 8.0),
  ('Mixed Nuts', 'Snacks', 180, 5.0, 8.0, 16.0),
  ('Hummus & Veg', 'Snacks', 150, 6.0, 18.0, 7.0)
ON CONFLICT DO NOTHING;

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
  image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add recipe_id to meal_plans (after recipes table exists)
ALTER TABLE meal_plans ADD COLUMN IF NOT EXISTS recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
  section VARCHAR(100) DEFAULT 'Ingredients',
  position INTEGER,
  quantity NUMERIC,
  unit VARCHAR(30),
  name VARCHAR(150) NOT NULL,
  notes VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS shopping_trips (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE,
  name VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shopping_trip_items (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES shopping_trips(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  quantity NUMERIC,
  unit VARCHAR(30),
  category VARCHAR(50) DEFAULT 'Other',
  checked BOOLEAN DEFAULT false,
  custom BOOLEAN DEFAULT false,
  position INTEGER
);

CREATE TABLE IF NOT EXISTS recipe_steps (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
  section VARCHAR(100) DEFAULT 'Method',
  position INTEGER,
  instruction TEXT NOT NULL,
  ingredient_refs JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS meal_plan_templates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slots JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_reviews (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(recipe_id, user_id)
);

CREATE TABLE IF NOT EXISTS exercises (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(30),
  muscle_groups TEXT[]
);

CREATE TABLE IF NOT EXISTS workout_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  name VARCHAR(100),
  notes TEXT,
  strava_activity_id BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strava_connections (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  strava_athlete_id BIGINT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workout_sets (
  id SERIAL PRIMARY KEY,
  workout_log_id INTEGER REFERENCES workout_logs(id) ON DELETE CASCADE,
  exercise_id INTEGER REFERENCES exercises(id),
  set_number INTEGER,
  reps INTEGER,
  weight_kg NUMERIC,
  duration_secs INTEGER,
  distance_m NUMERIC
);

CREATE TABLE IF NOT EXISTS workout_templates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  exercises JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_collections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_collection_items (
  id SERIAL PRIMARY KEY,
  collection_id INTEGER REFERENCES recipe_collections(id) ON DELETE CASCADE,
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(collection_id, recipe_id)
);

-- Seed common exercises
INSERT INTO exercises (name, category, muscle_groups) VALUES
  ('Bench Press', 'Strength', ARRAY['Chest', 'Triceps', 'Shoulders']),
  ('Incline Bench Press', 'Strength', ARRAY['Chest', 'Shoulders']),
  ('Squat', 'Strength', ARRAY['Quads', 'Glutes', 'Hamstrings']),
  ('Deadlift', 'Strength', ARRAY['Back', 'Glutes', 'Hamstrings']),
  ('Overhead Press', 'Strength', ARRAY['Shoulders', 'Triceps']),
  ('Barbell Row', 'Strength', ARRAY['Back', 'Biceps']),
  ('Dumbbell Curl', 'Strength', ARRAY['Biceps']),
  ('Tricep Pushdown', 'Strength', ARRAY['Triceps']),
  ('Lateral Raise', 'Strength', ARRAY['Shoulders']),
  ('Leg Press', 'Strength', ARRAY['Quads', 'Glutes']),
  ('Romanian Deadlift', 'Strength', ARRAY['Hamstrings', 'Glutes']),
  ('Cable Row', 'Strength', ARRAY['Back', 'Biceps']),
  ('Lat Pulldown', 'Strength', ARRAY['Back', 'Biceps']),
  ('Pull-ups', 'Bodyweight', ARRAY['Back', 'Biceps']),
  ('Plank', 'Bodyweight', ARRAY['Core']),
  ('Lunges', 'Bodyweight', ARRAY['Quads', 'Glutes']),
  ('Push-ups', 'Bodyweight', ARRAY['Chest', 'Triceps']),
  ('Dips', 'Bodyweight', ARRAY['Chest', 'Triceps']),
  ('Running', 'Cardio', ARRAY['Legs', 'Cardio']),
  ('Cycling', 'Cardio', ARRAY['Legs', 'Cardio']),
  ('Swimming', 'Cardio', ARRAY['Full Body']),
  ('Rowing Machine', 'Cardio', ARRAY['Full Body']),
  ('Elliptical', 'Cardio', ARRAY['Full Body']),
  ('Jump Rope', 'Cardio', ARRAY['Full Body']),
  ('Walking', 'Cardio', ARRAY['Legs']),
  ('HIIT', 'Cardio', ARRAY['Full Body'])
ON CONFLICT DO NOTHING;
