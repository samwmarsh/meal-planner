# SPEC.md — Meal Planner Feature Specification

This is the living spec for the meal planner app. Claude uses this as the source of truth when planning and building. Edit freely.

---

## Vision

A personal meal planning and health tracking app. Users plan their weekly meals from a shared recipe library, track macros/calories against their goals, generate a consolidated shopping list, and log workouts, sleep, and daily weight — all running locally via Docker.

---

## Infrastructure

- **Environment:** Local Docker (docker-compose)
- **Services:** PostgreSQL · Node.js/Express API · React/Vite frontend · nginx (reverse proxy + static files)
- **API base path:** `/api` (proxied by nginx)
- **Auth:** JWT in `Authorization: Bearer` header

---

## Features

---

### 1. Authentication & Accounts

- [x] Register (username + password)
- [x] Login / JWT auth
- [ ] Logout (clear token client-side)
- [ ] Persistent login ("remember me" — 30-day token)
- [ ] Change password
- [ ] Delete account

---

### 2. Recipe Library

#### 2a. Recipe Data Model

Each recipe contains:
- Title, description, servings count
- Prep time, cook time, total time
- Meal category: `Breakfast | Snack | Lunch | Dinner`
- Dietary tags: `vegan | vegetarian | gluten-free | dairy-free | nut-free | pcos-friendly | etc.`
- Allergen flags
- Ingredients list: each entry has `{ quantity, unit, name, notes }`
- Method: ordered sections (e.g. "Cake", "Frosting") each with ordered steps
- Macros per serving: `{ calories, protein_g, carbs_g, fat_g }`
- Source URL (if imported)
- Author (user who added it)
- Status: `community | personal | pending_approval`

#### 2b. Recipe Scaling

- Servings adjuster (slider or input) multiplies all ingredient quantities in real time
- Macro totals update accordingly

#### 2c. Step-Level Quantity Annotations

When displaying a recipe step, annotate ingredient quantities inline:
- Each step that uses an ingredient shows the exact amount: *"Add the eggs"* → *"Add 2 medium eggs"*
- If an ingredient is split across multiple steps within a section, annotate remaining: *"Add 200g sugar (400g remaining for step 7)"*
- Implementation: after scraping/import, run an LLM pass that maps ingredient quantities to the steps that reference them, storing the mapping in the DB

#### 2d. Recipe Import (URL Scraping)

Users paste a URL; the app fetches and parses the recipe automatically.

**Parsing strategy (in priority order):**
1. **schema.org Recipe JSON-LD** — extract `<script type="application/ld+json">` with `@type: "Recipe"`. Covers most major food blogs (WP Recipe Maker, Tasty Recipes, BBC Good Food, AllRecipes, etc.)
2. **WP Recipe Maker CSS classes** — fallback for WPRM pages without clean JSON-LD (`wprm-recipe-ingredient`, `wprm-recipe-instruction-text`, etc.)
3. **Generic heuristics** — ingredient-like patterns (`\d+g`, `\d+ tbsp`), `<ol>` blocks for method steps
4. **LLM extraction** — last resort: pass raw page text to Claude and ask it to extract the recipe structure

After extraction:
- Present parsed recipe to user for review/edit before saving
- Run step-level quantity annotation pass (see 2c)
- Auto-detect meal category from recipe title/tags if possible
- Optionally look up ingredient macros via nutritional DB (see section 5)

#### 2e. Recipe Submission Flow

- **Personal recipes:** user adds directly, immediately available to them only, no approval needed
- **Community submission:** user submits for admin approval; visible to all once approved
- **Admin approval queue:** admins can approve, reject (with reason), or edit before approving
- Approved community recipes are shared across all accounts (read-only; users can fork to personal)

---

### 3. Meal Calendar

- [x] Monthly calendar view
- [x] Weekly view — 7-day grid, each day column shows all meal slots with full detail
- [x] Day view — single day, all slots expanded, easiest for editing
- [x] View switcher UI (Month / Week / Day toggle)
- [x] Navigate between weeks/months/days
- [x] Each day shows all four mealtimes: Breakfast · Snack · Lunch · Dinner
- [x] Each mealtime slot: select a meal, set serving count
- [x] Each meal slot displays: `calories · protein · carbs · fat`
- [x] Daily totals row: sum of all meals for the day
- [x] Weekly/monthly totals summary
- [ ] Colour coding: green/amber/red based on proximity to daily calorie/macro goals (requires health goals)
- [ ] Copy previous week — one-click duplicate of last week's plan
- [ ] Meal plan templates — save a week as a named template, reuse any time
- [x] Clear a meal slot (× button in modal)
- [x] **iCal export** — download `.ics` file of the current view's meals for import into Google Calendar, Apple Calendar, etc. Each meal = one calendar event with mealtime as start time (Breakfast 08:00, Lunch 12:30, Dinner 18:30, Snacks 15:00), title = meal name, description = macros

---

### 4. Health Goals & BMR/TDEE

Users configure a profile used to calculate targets:

**Profile inputs:**
- Date of birth / age
- Sex
- Height
- Current weight (syncs from daily log)
- Activity level: `sedentary | lightly active | moderately active | very active | athlete`
- Goal: `lose fat | maintain | build muscle | body recomposition`
- Goal pace: `slow (–250 kcal) | moderate (–500 kcal) | aggressive (–750 kcal)` (or equivalent surplus)
- Custom macro split (optional override): protein % · carbs % · fat %

**Calculations:**
- **BMR** via Mifflin-St Jeor equation
- **TDEE** = BMR × activity multiplier
- **Calorie target** = TDEE ± goal adjustment
- **Protein target** (minimum): 1.6–2.2g per kg bodyweight (adjustable)
- **Training day vs. rest day targets** (optional toggle)

**Display:**
- Dashboard card: today's targets vs. actual (calories, protein, carbs, fat)
- Progress ring or bar per macro
- Remaining to hit for the day

---

### 5. Nutritional Database Integration

- Ingredient lookup against **USDA FoodData Central** (free API) or **Open Food Facts** (open source)
- When adding/importing a recipe, attempt to auto-resolve each ingredient's macro profile per 100g
- Users can manually override if lookup is incorrect
- Enables accurate per-recipe macro calculation without manual entry

---

### 6. Workout, Sleep & Daily Tracking

#### 6a. Daily Log
Each day, users can log:
- **Weight** (kg/lbs) — populates progress chart, feeds into TDEE recalculation
- **Sleep** (hours + optional quality rating 1–5)
- **Water intake** (ml / glasses)
- **Notes** (free text)

#### 6b. Workout Tracking
- Exercise library (name, category: weights / cardio / bodyweight, muscle groups)
- Log a workout: date, exercises, sets × reps × weight (or duration for cardio)
- Workout templates (save common sessions)
- Progressive overload view: see previous session's numbers while logging
- Calorie burn estimate (rough) — adjusts day's net calories

#### 6c. Progress Charts
- Weight over time (line chart)
- Calorie intake vs. target over time
- Protein/carbs/fat trends
- Workout volume over time
- Sleep duration trend

---

### 7. Shopping List

#### 7a. Plan View (existing `/shopping-list` page)

Generated from the current week's meal plan:

- **Ingredient consolidation:** same ingredient across multiple recipes is summed (e.g. `5 eggs` not `2 + 3`)
- **Unit normalisation:** convert compatible units before summing (e.g. `200ml + 0.5L = 700ml`)
- **Multi-use expansion:** tap ingredient to see which recipes/days use it and scaled quantities
- **"Save for Shopping" button** — snapshots the current ingredient list into a saved shopping trip (stored server-side)
- **Export:** share as plain text or copy to clipboard

#### 7b. Active Shopping Trip (`/shopping-list/active` or modal overlay)

A persistent, check-off-as-you-go view of a saved trip:

- **Item rows:** ingredient name + quantity + unit, tap to check off (strikethrough + muted style)
- **Progress bar / counter:** "12 of 18 items" — updates live as you check
- **Grouped by category:** Produce · Dairy · Meat & Fish · Bakery · Dry Goods · Frozen · Other (auto-assigned at save time; overridable)
- **Add custom item:** freetext row for things not in the plan (e.g. household items)
- **Uncheck all / reset** — start the trip over without losing the list
- **Complete trip** — archives the list; returns to plan view
- **One active trip at a time** — saving a new one prompts "replace active list?"

#### 7b. Data Model additions

```sql
CREATE TABLE shopping_trips (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE,
  name VARCHAR(100),          -- e.g. "Week of 17 Mar"
  status VARCHAR(20) DEFAULT 'active',   -- 'active' | 'completed'
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE TABLE shopping_trip_items (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES shopping_trips(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  quantity NUMERIC,
  unit VARCHAR(30),
  category VARCHAR(50) DEFAULT 'Other',  -- Produce | Dairy | Meat & Fish | Bakery | Dry Goods | Frozen | Other
  checked BOOLEAN DEFAULT false,
  custom BOOLEAN DEFAULT false,          -- true if manually added by user
  position INTEGER
);
```

---

### 8. UI / UX

- [ ] Responsive layout (desktop + mobile)
- [x] Burger menu navigation
- [x] Light theme
- [ ] Dark mode toggle
- [ ] Loading states / skeletons
- [ ] Toast notifications (success / error / info)
- [ ] Mobile-first calendar (swipe between days/weeks)
- [ ] PWA manifest + service worker (installable on phone, works offline for viewing)

---

## Prioritised Backlog

1. ✅ **Docker local setup**
2. ✅ **Macro/calorie display on calendar** — per meal + daily + weekly totals
3. ✅ **Calendar view switching** — Month / Week / Day toggle + navigation
4. ✅ **iCal export** — .ics download for Google/Apple Calendar
5. ✅ **Shopping list** — generated from week's meals, weekly macro totals, copy to clipboard, aggregated ingredient list with multi-use expansion
6. ✅ **Health goals & TDEE calculator** — profile setup, BMR/TDEE, calorie/macro targets; split into Profile/Goals/Log pages
7. ✅ **UI polish pass 1** — card-based meal picker with macros, shopping list empty state, profile redesign
8. ✅ **Recipe library** — full data model, CRUD, seed recipes, meal picker integration
9. ✅ **Recipe import (URL scraping)** — paste URL → schema.org parse → save → available in meal picker; edit modal to fix category/fields post-import
10. ✅ **Daily weight log** — dedicated `/log` page, kg/lbs/st+lbs toggle, 60-day history
11. ✅ **Recipe step ingredient annotations** — parse ingredient refs from step text, show per-step usage badges + "Xg remaining" tracking; reparse endpoint
12. ✅ **User unit preferences** — weight unit (kg/lbs/st+lbs) and height unit (cm/ft+in) persisted server-side; Preferences card on Profile page auto-saves on change
13. ✅ **Goal-based macro presets** — switching goal auto-applies sensible protein/carbs/fat split; macro display as read-only tiles (not editable inputs)
14. ✅ **Recipe slug URLs** — `/recipes/:id-slug-title` format; RecipeDetail extracts ID from slug
15. **Create recipe from scratch** — form to manually enter title, category, description, servings, timings, macros, ingredients (add/remove rows), method steps
16. **Active shopping trip** — "Save for Shopping" snapshots the week's ingredient list; `/shopping-list/active` lets you check off items in-store, add custom items, group by category, and complete/archive the trip
17. **UI polish pass 2** — production-ready feel throughout:
   - Toast notifications (replace inline success/error text)
   - Loading skeletons instead of plain "Loading…" text
   - Responsive/mobile layout improvements
   - Dashboard home page (today's macro summary card, recent weight, quick-add shortcuts)
   - Delete recipe button
   - Shopping list unit normalisation (200ml + 0.5L → 700ml)
18. **Progress charts** — weight trend, calorie intake vs target, macro breakdown over time
19. **Full daily log** — sleep hours/quality and water intake (fields exist in DB, UI only shows weight)
20. **Calendar macro colour coding** — green/amber/red cells based on proximity to daily targets
21. **Meal plan templates + copy previous week**
22. **Workout tracking** — exercise log, sets/reps, templates
23. **Admin approval queue** — community recipe submissions
24. **PWA** — installable, works offline for viewing

---

## API Design

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | No | Register |
| POST | /api/auth/login | No | Login → JWT |
| GET | /api/health | No | Health check |
| GET | /api/recipes | No | List recipes (filter: type, tags, status) |
| GET | /api/recipes/:id | No | Get recipe detail |
| POST | /api/recipes | Yes | Add personal recipe |
| POST | /api/recipes/import | Yes | Import recipe from URL |
| POST | /api/recipes/:id/submit | Yes | Submit personal recipe for community approval |
| PUT | /api/recipes/:id | Yes | Edit own recipe |
| DELETE | /api/recipes/:id | Yes | Delete own recipe |
| GET | /api/admin/recipes/pending | Admin | Approval queue |
| PUT | /api/admin/recipes/:id/approve | Admin | Approve submission |
| PUT | /api/admin/recipes/:id/reject | Admin | Reject with reason |
| GET | /api/meal-plans | Yes | Get meal plan for week/month |
| POST | /api/meal-plans | Yes | Save/update meal slot |
| DELETE | /api/meal-plans/:id | Yes | Clear meal slot |
| GET | /api/meal-plans/templates | Yes | List saved templates |
| POST | /api/meal-plans/templates | Yes | Save current week as template |
| GET | /api/shopping-list | Yes | Generate shopping list for week |
| GET | /api/profile | Yes | Get health profile |
| PUT | /api/profile | Yes | Update health profile + goals |
| GET | /api/logs/daily | Yes | Get daily logs (date range) |
| POST | /api/logs/daily | Yes | Add/update daily log entry |
| GET | /api/workouts | Yes | List workout logs |
| POST | /api/workouts | Yes | Add workout log |
| GET | /api/exercises | Yes | Exercise library |
| POST | /api/exercises | Yes | Add exercise |
| GET | /api/nutrition/lookup | Yes | Ingredient macro lookup |

---

## Data Model

```sql
-- Users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user',          -- 'user' | 'admin'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Health profile
CREATE TABLE user_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  date_of_birth DATE,
  sex VARCHAR(10),
  height_cm NUMERIC,
  activity_level VARCHAR(30),
  goal VARCHAR(30),
  goal_pace VARCHAR(20),
  protein_pct NUMERIC DEFAULT 30,
  carbs_pct NUMERIC DEFAULT 40,
  fat_pct NUMERIC DEFAULT 30,
  weight_unit VARCHAR(10) DEFAULT 'kg',
  height_unit VARCHAR(10) DEFAULT 'cm',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Recipes
CREATE TABLE recipes (
  id SERIAL PRIMARY KEY,
  author_id INTEGER REFERENCES users(id),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  servings INTEGER,
  prep_time_mins INTEGER,
  cook_time_mins INTEGER,
  category VARCHAR(20) CHECK (category IN ('Breakfast','Snack','Lunch','Dinner')),
  dietary_tags TEXT[],                      -- e.g. ['vegan','gluten-free','pcos-friendly']
  calories_per_serving NUMERIC,
  protein_per_serving NUMERIC,
  carbs_per_serving NUMERIC,
  fat_per_serving NUMERIC,
  status VARCHAR(20) DEFAULT 'personal',   -- 'personal' | 'pending' | 'community'
  source_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Recipe ingredients
CREATE TABLE recipe_ingredients (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
  section VARCHAR(100),                    -- e.g. 'Cake', 'Frosting'
  position INTEGER,
  quantity NUMERIC,
  unit VARCHAR(30),
  name VARCHAR(100) NOT NULL,
  notes VARCHAR(200)
);

-- Recipe method steps
CREATE TABLE recipe_steps (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
  section VARCHAR(100),
  position INTEGER,
  instruction TEXT NOT NULL,
  ingredient_refs JSONB DEFAULT '[]'       -- [{ingredient_id, name, quantity, unit}] parsed at import
);

-- Meal plans
CREATE TABLE meal_plans (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  meal_type VARCHAR(20) NOT NULL,          -- Breakfast | Snack | Lunch | Dinner
  recipe_id INTEGER REFERENCES recipes(id),
  servings NUMERIC DEFAULT 1,
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, date, meal_type)
);

-- Meal plan templates
CREATE TABLE meal_plan_templates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slots JSONB NOT NULL,                    -- array of {day_offset, meal_type, recipe_id, servings}
  created_at TIMESTAMP DEFAULT NOW()
);

-- Daily logs (weight, sleep, water)
CREATE TABLE daily_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  weight_kg NUMERIC,
  sleep_hours NUMERIC,
  sleep_quality SMALLINT CHECK (sleep_quality BETWEEN 1 AND 5),
  water_ml INTEGER,
  notes TEXT,
  UNIQUE(user_id, date)
);

-- Exercise library
CREATE TABLE exercises (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(30),                    -- 'weights' | 'cardio' | 'bodyweight'
  muscle_groups TEXT[]
);

-- Workout logs
CREATE TABLE workout_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  name VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Workout sets
CREATE TABLE workout_sets (
  id SERIAL PRIMARY KEY,
  workout_log_id INTEGER REFERENCES workout_logs(id) ON DELETE CASCADE,
  exercise_id INTEGER REFERENCES exercises(id),
  set_number INTEGER,
  reps INTEGER,
  weight_kg NUMERIC,
  duration_secs INTEGER,                   -- for cardio
  distance_m NUMERIC                       -- for cardio
);
```

---

## Non-Goals (for now)

- Native mobile app (PWA covers mobile use)
- Social features (following, sharing meal plans publicly)
- Full recipe step-by-step cooking mode / timers
- Barcode scanning
- Integration with wearables (Fitbit, Apple Health)
- Calorie burn from fitness trackers
- Grocery store price tracking

---

## Notes & Ideas

<!-- Free-form — dump ideas here -->

- Consider caching scraped recipes (avoid re-fetching the same URL)
- For unit normalisation in shopping list: build a simple unit conversion map (g↔kg, ml↔L, tsp↔tbsp↔cup)
- The LLM step-annotation pass could be done async after import, with a "processing" state shown to user
- Admin role could start as a simple `role = 'admin'` flag on the users table, no separate admin app needed
