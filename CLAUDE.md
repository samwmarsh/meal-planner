# CLAUDE.md — Meal Planner

This file is automatically loaded by Claude Code. It provides project context, conventions, and working instructions.

## Project Overview

A personal meal planning app. Users can register/login, view a monthly calendar, and assign meals (Breakfast, Lunch, Dinner, Snacks) to each day.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, React Router v7, FullCalendar, Axios |
| Backend | Node.js, Express 4 |
| Database | PostgreSQL 16 |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Dev environment | Docker + docker-compose |

## Running Locally

```bash
# Start everything (first time: builds images)
docker compose up --build

# Start in background
docker compose up -d

# Stop
docker compose down

# Wipe DB data too
docker compose down -v
```

App runs at http://localhost (nginx on port 80).
- Frontend → http://localhost
- Backend API → http://localhost/api
- DB → localhost:5432 (for direct access)

## Project Structure

```
meal-planner/
├── backend/          # Express API (src/server.js, src/auth.js, src/db.js)
├── frontend/         # React/Vite app (src/)
├── nginx/            # Reverse proxy config
├── db/               # SQL init scripts
├── CLAUDE.md         # This file
├── AGENTS.md         # Agentic loop definitions
├── SPEC.md           # Feature specs and requirements
└── docker-compose.yml
```

## Environment Variables

Copy `.env.example` to `.env` and fill in values before running.

Required:
- `JWT_SECRET` — secret for signing tokens (generate a long random string)
- `DB_PASSWORD` — PostgreSQL password
- `DB_USER` — PostgreSQL user (default: mealplanner)
- `DB_NAME` — database name (default: mealplanner)

## Key Conventions

- Backend routes: REST, JSON, all API routes served under `/api/` via nginx proxy
- Auth: JWT in `Authorization: Bearer <token>` header; stored in localStorage on client
- DB queries: use parameterized queries (`$1, $2`) — never string interpolation
- CORS: configured via `ALLOWED_ORIGINS` env var (comma-separated list)
- SSL: only enabled for DB when `NODE_ENV=production`

## Database Schema

```sql
users        (id, username, password_hash, created_at)
meals        (id, name, type)                          -- type: Breakfast|Lunch|Dinner|Snacks
meal_plans   (user_id, date, meal_type, meal_name, last_updated)
             UNIQUE(user_id, date, meal_type)
```

## Known Issues / Tech Debt

- `auth.js` has its own DB pool (duplicate of `db.js`) — should be consolidated
- JWT expiry is `1h` in auth.js but `7d` in `generateToken` in middleware/auth.js — needs unifying
- `generateToken` in middleware/auth.js is defined but never used by login flow
- Frontend has `bcrypt` and `bcryptjs` as dependencies — these should only be in backend
- No error handling on `/meals` and `/meal-plans` GET endpoints (unhandled promise rejections)

## Critical Patterns — Read Before Coding

### Date handling (PostgreSQL + node-postgres)
- `pg` returns `DATE` columns as plain `'YYYY-MM-DD'` strings (type parser set in `db.js`)
- `TIMESTAMP` columns come back as JS `Date` objects
- Never do `new Date(row.someDate + 'T00:00:00')` without first ensuring `row.someDate` is a string
- Safe pattern: `const ds = typeof d === 'string' ? d.slice(0,10) : d.toISOString().slice(0,10)`

### Nutrition values
- All macro values stored **per serving** in the DB (`calories_per_serving`, `protein_per_serving`, etc.)
- UI must always label macros as either "per serving" OR "for N servings" — never just show scaled values under a "per serving" label
- When the servings adjuster changes `servings`, scale ALL displayed values: ingredients AND macros

### Recipe import
- `source_url` is stored on every imported recipe — always display it as a link in `RecipeDetail`
- `serving_weight_g` (if added) should be populated from `nutrition.servingSize` in schema.org data

### Mandatory QA before every deploy
After any backend change: hit the affected endpoint with curl and verify the response is correct JSON (not a 500).
After any frontend change: open the page in browser and navigate around it — especially test the empty state, the loading state, and any form submission.
Check console errors and network tab before calling something done.

## Spec & Agents

See `SPEC.md` for features and requirements.
See `AGENTS.md` for the review/build/QA agentic loop instructions.
