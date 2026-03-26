/**
 * Recipe Scraper — seeds recipes from URLs into the database.
 *
 * Parsing strategy (in order):
 *   1. schema.org Recipe JSON-LD  — covers BBC Good Food, AllRecipes, Tasty, WP Recipe Maker blogs
 *   2. WP Recipe Maker CSS classes — fallback for WPRM pages without clean JSON-LD
 *   3. Basic heuristics            — last resort structural parse
 *
 * Usage:
 *   node scripts/scrape-recipes.js                  # scrape all URLs in RECIPE_URLS below
 *   node scripts/scrape-recipes.js <url> [<url>...]  # scrape specific URLs
 *
 * Requires: npm install node-fetch cheerio
 * (These are dev-only deps — not in the main backend package.json)
 *
 * Run AFTER the recipe tables have been created in the database.
 * Set DATABASE_URL in your .env before running.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { load: cheerioLoad } = require('cheerio');

// ─── Curated recipe URLs ──────────────────────────────────────────────────────
// Add BBC Good Food or other recipe URLs here. All use schema.org Recipe JSON-LD.
const RECIPE_URLS = [
  // High protein / meal prep — BBC Good Food
  'https://www.bbcgoodfood.com/recipes/chicken-meal-prep-bowls',
  'https://www.bbcgoodfood.com/recipes/high-protein-overnight-oats',
  'https://www.bbcgoodfood.com/recipes/turkey-meatballs',
  'https://www.bbcgoodfood.com/recipes/salmon-traybake',
  'https://www.bbcgoodfood.com/recipes/greek-chicken-traybake',
  'https://www.bbcgoodfood.com/recipes/beef-broccoli',
  'https://www.bbcgoodfood.com/recipes/red-lentil-dhal',
  'https://www.bbcgoodfood.com/recipes/tuna-pasta-bake',
  'https://www.bbcgoodfood.com/recipes/egg-muffins',
  // Add more URLs here as needed
];

// ─── DB connection ────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── Scraper ──────────────────────────────────────────────────────────────────
async function scrapeUrl(url) {
  console.log(`\nFetching: ${url}`);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MealPlannerBot/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return parseRecipe(html, url);
}

function parseRecipe(html, sourceUrl) {
  const $ = cheerioLoad(html);

  // Strategy 1: schema.org JSON-LD
  let recipe = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (recipe) return;
    try {
      const data = JSON.parse($(el).html());
      const candidates = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
      for (const item of candidates) {
        if (item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))) {
          recipe = item;
          break;
        }
      }
    } catch {}
  });

  if (recipe) {
    console.log(`  ✓ Found schema.org Recipe JSON-LD`);
    return normaliseJsonLd(recipe, sourceUrl);
  }

  // Strategy 2: WP Recipe Maker CSS classes
  const wprmTitle = $('.wprm-recipe-name').first().text().trim();
  if (wprmTitle) {
    console.log(`  ✓ Found WP Recipe Maker markup`);
    return parseWprm($, sourceUrl);
  }

  // Strategy 3: Give up cleanly
  throw new Error('No recognised recipe markup found on this page. Try a different URL.');
}

function normaliseJsonLd(r, sourceUrl) {
  const title = r.name || 'Untitled Recipe';
  const description = Array.isArray(r.description) ? r.description.join(' ') : r.description || '';
  const servings = parseInt(r.recipeYield) || parseInt(String(r.recipeYield).match(/\d+/)?.[0]) || 4;
  const prepTime = parseDuration(r.prepTime);
  const cookTime = parseDuration(r.cookTime);
  const category = inferCategory(r.recipeCategory, title);

  // Dietary tags
  const tags = [];
  const suitableFor = [].concat(r.suitableForDiet || []).map(s => s.toLowerCase());
  if (suitableFor.some(s => s.includes('vegan'))) tags.push('vegan', 'vegetarian', 'dairy-free');
  if (suitableFor.some(s => s.includes('vegetarian'))) tags.push('vegetarian');
  if (suitableFor.some(s => s.includes('gluten'))) tags.push('gluten-free');

  // Macros from nutrition
  const nutrition = r.nutrition || {};
  const calories = parseInt(nutrition.calories) || 0;
  const protein = parseFloat(nutrition.proteinContent) || 0;
  const carbs = parseFloat(nutrition.carbohydrateContent) || 0;
  const fat = parseFloat(nutrition.fatContent) || 0;

  // Ingredients
  const ingredients = [].concat(r.recipeIngredient || []).map((raw, i) => {
    return parseIngredientString(raw, i + 1);
  });

  // Steps
  const instructions = [].concat(r.recipeInstructions || []);
  const steps = [];
  let pos = 1;
  for (const inst of instructions) {
    if (inst['@type'] === 'HowToSection') {
      const sectionName = inst.name || 'Method';
      for (const step of [].concat(inst.itemListElement || [])) {
        steps.push({ section: sectionName, position: pos++, instruction: step.text || step.name || '' });
      }
    } else if (inst['@type'] === 'HowToStep') {
      steps.push({ section: 'Method', position: pos++, instruction: inst.text || inst.name || '' });
    } else if (typeof inst === 'string') {
      steps.push({ section: 'Method', position: pos++, instruction: inst });
    }
  }

  return { title, description, servings, prepTime, cookTime, category, tags, calories, protein, carbs, fat, ingredients, steps, sourceUrl };
}

function parseWprm($, sourceUrl) {
  const title = $('.wprm-recipe-name').first().text().trim();
  const description = $('.wprm-recipe-summary').first().text().trim();
  const servings = parseInt($('.wprm-recipe-servings').first().text()) || 4;

  const ingredients = [];
  $('.wprm-recipe-ingredient').each((i, el) => {
    const amount = $(el).find('.wprm-recipe-ingredient-amount').text().trim();
    const unit = $(el).find('.wprm-recipe-ingredient-unit').text().trim();
    const name = $(el).find('.wprm-recipe-ingredient-name').text().trim();
    const notes = $(el).find('.wprm-recipe-ingredient-notes').text().trim();
    if (name) ingredients.push({ section: 'Ingredients', position: i + 1, quantity: parseFloat(amount) || null, unit, name, notes });
  });

  const steps = [];
  $('.wprm-recipe-instruction-text').each((i, el) => {
    steps.push({ section: 'Method', position: i + 1, instruction: $(el).text().trim() });
  });

  return { title, description, servings, prepTime: 0, cookTime: 0, category: inferCategory('', title), tags: [], calories: 0, protein: 0, carbs: 0, fat: 0, ingredients, steps, sourceUrl };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseDuration(iso) {
  if (!iso) return 0;
  const match = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  return (parseInt(match[1] || 0) * 60) + parseInt(match[2] || 0);
}

function inferCategory(schemaCategory, title) {
  const text = (String(schemaCategory) + ' ' + title).toLowerCase();
  if (text.includes('breakfast') || text.includes('oat') || text.includes('egg') || text.includes('pancake')) return 'Breakfast';
  if (text.includes('lunch') || text.includes('salad') || text.includes('sandwich') || text.includes('soup')) return 'Lunch';
  if (text.includes('snack') || text.includes('bar') || text.includes('smoothie')) return 'Snacks';
  return 'Dinner';
}

function parseIngredientString(raw, position) {
  // Try to extract quantity, unit and name from strings like "500g chicken breast" or "2 tbsp olive oil"
  const match = raw.match(/^([\d./½¼¾⅓⅔]+)?\s*(g|kg|ml|l|tbsp|tsp|cup|cups|oz|lb|lbs|cloves?|bunch|handful|large|medium|small|can|cans|)\s+(.+)$/i);
  if (match) {
    const qty = match[1] ? eval(match[1].replace('½','0.5').replace('¼','0.25').replace('¾','0.75')) : null;
    return { section: 'Ingredients', position, quantity: qty, unit: match[2] || '', name: match[3].trim(), notes: '' };
  }
  return { section: 'Ingredients', position, quantity: null, unit: '', name: raw.trim(), notes: '' };
}

// ─── DB insert ────────────────────────────────────────────────────────────────
async function insertRecipe(r) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO recipes (title, description, servings, prep_time_mins, cook_time_mins, category,
         dietary_tags, calories_per_serving, protein_per_serving, carbs_per_serving, fat_per_serving,
         status, source_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'community',$12)
       ON CONFLICT (source_url) DO UPDATE SET title=EXCLUDED.title, updated_at=NOW()
       RETURNING id`,
      [r.title, r.description, r.servings, r.prepTime, r.cookTime, r.category,
       r.tags, r.calories, r.protein, r.carbs, r.fat, r.sourceUrl]
    );
    const recipeId = rows[0].id;

    // Clear old ingredients/steps if updating
    await client.query('DELETE FROM recipe_ingredients WHERE recipe_id=$1', [recipeId]);
    await client.query('DELETE FROM recipe_steps WHERE recipe_id=$1', [recipeId]);

    for (const ing of r.ingredients) {
      await client.query(
        'INSERT INTO recipe_ingredients (recipe_id,section,position,quantity,unit,name,notes) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [recipeId, ing.section, ing.position, ing.quantity, ing.unit, ing.name, ing.notes || '']
      );
    }

    for (const step of r.steps) {
      await client.query(
        'INSERT INTO recipe_steps (recipe_id,section,position,instruction) VALUES ($1,$2,$3,$4)',
        [recipeId, step.section, step.position, step.instruction]
      );
    }

    await client.query('COMMIT');
    console.log(`  ✓ Saved: "${r.title}" (id: ${recipeId}, ${r.ingredients.length} ingredients, ${r.steps.length} steps)`);
    return recipeId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // If CLI args are provided, use those URLs directly
  if (process.argv.slice(2).length) {
    const urls = process.argv.slice(2);
    console.log(`Scraping ${urls.length} recipe(s) from CLI args...\n`);
    let ok = 0, fail = 0;
    for (const url of urls) {
      try {
        const recipe = await scrapeUrl(url);
        await insertRecipe(recipe);
        ok++;
      } catch (err) {
        console.error(`  ✗ Failed: ${err.message}`);
        fail++;
      }
    }
    console.log(`\nDone: ${ok} succeeded, ${fail} failed.`);
    await pool.end();
    return;
  }

  // Try to load scrape-urls.json for richer URL definitions with extra_tags
  const jsonPath = path.join(__dirname, 'scrape-urls.json');
  let urlEntries = null;
  if (fs.existsSync(jsonPath)) {
    try {
      urlEntries = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      console.log(`Loaded ${urlEntries.length} URL(s) from scrape-urls.json\n`);
    } catch (err) {
      console.warn(`Warning: could not parse scrape-urls.json (${err.message}), falling back to hardcoded URLs.\n`);
    }
  }

  if (urlEntries && Array.isArray(urlEntries)) {
    let ok = 0, fail = 0;
    for (const entry of urlEntries) {
      try {
        const recipe = await scrapeUrl(entry.url);
        // Apply extra_tags from the JSON entry
        if (Array.isArray(entry.extra_tags)) {
          for (const tag of entry.extra_tags) {
            if (!recipe.tags.includes(tag)) {
              recipe.tags.push(tag);
            }
          }
        }
        // Apply category_hint if the scraper inferred a generic category
        if (entry.category_hint && (!recipe.category || recipe.category === 'Dinner')) {
          recipe.category = entry.category_hint;
        }
        await insertRecipe(recipe);
        ok++;
      } catch (err) {
        console.error(`  ✗ Failed (${entry.url}): ${err.message}`);
        fail++;
      }
    }
    console.log(`\nDone: ${ok} succeeded, ${fail} failed.`);
  } else {
    // Fall back to hardcoded RECIPE_URLS array
    const urls = RECIPE_URLS;
    console.log(`Scraping ${urls.length} recipe(s) from hardcoded list...\n`);
    let ok = 0, fail = 0;
    for (const url of urls) {
      try {
        const recipe = await scrapeUrl(url);
        await insertRecipe(recipe);
        ok++;
      } catch (err) {
        console.error(`  ✗ Failed: ${err.message}`);
        fail++;
      }
    }
    console.log(`\nDone: ${ok} succeeded, ${fail} failed.`);
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
