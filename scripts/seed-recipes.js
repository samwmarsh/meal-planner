/**
 * Seeds the curated recipe library from db/recipes-seed.json into the database.
 *
 * Usage:
 *   node scripts/seed-recipes.js
 *
 * Run AFTER the recipe tables exist (i.e. after the full schema migration).
 * Set DATABASE_URL in your .env before running.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const path = require('path');
const recipes = require('../db/recipes-seed.json');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const client = await pool.connect();
  let ok = 0;

  try {
    for (const r of recipes) {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO recipes
           (title, description, servings, prep_time_mins, cook_time_mins, category,
            dietary_tags, calories_per_serving, protein_per_serving, carbs_per_serving,
            fat_per_serving, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          r.title, r.description, r.servings,
          r.prep_time_mins, r.cook_time_mins, r.category,
          r.dietary_tags,
          r.calories_per_serving, r.protein_per_serving,
          r.carbs_per_serving, r.fat_per_serving,
          r.status || 'community',
        ]
      );

      if (rows.length === 0) {
        console.log(`  – Skipped (already exists): "${r.title}"`);
        await client.query('ROLLBACK');
        continue;
      }

      const recipeId = rows[0].id;

      for (const ing of r.ingredients) {
        await client.query(
          `INSERT INTO recipe_ingredients (recipe_id,section,position,quantity,unit,name,notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [recipeId, ing.section, ing.position, ing.quantity, ing.unit, ing.name, ing.notes || '']
        );
      }

      for (const step of r.steps) {
        await client.query(
          `INSERT INTO recipe_steps (recipe_id,section,position,instruction)
           VALUES ($1,$2,$3,$4)`,
          [recipeId, step.section, step.position, step.instruction]
        );
      }

      await client.query('COMMIT');
      console.log(`  ✓ Seeded: "${r.title}" (${r.ingredients.length} ingredients, ${r.steps.length} steps)`);
      ok++;
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }

  console.log(`\nDone: ${ok}/${recipes.length} recipes seeded.`);
  await pool.end();
}

seed();
