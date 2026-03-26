/**
 * Recipe Scraper — imports recipes via the app's API endpoint.
 *
 * Uses the backend's POST /recipes/import endpoint (running in Docker)
 * instead of direct DB access. This means:
 *   - No need for DB connection from the host
 *   - Uses the same parsing logic as the web UI
 *   - Recipes get step-level ingredient annotation automatically
 *
 * Usage:
 *   node scripts/scrape-recipes.js                       # import all URLs from scrape-urls.json
 *   node scripts/scrape-recipes.js <url> [<url>...]      # import specific URLs
 *
 * Requires: The app must be running (docker compose up).
 * The script logs in as the 'sam' user to get a JWT token.
 */

const fs = require('fs');
const path = require('path');

const API_URL = process.env.API_URL || 'http://localhost/api';
const USERNAME = process.env.SCRAPER_USER || 'sam';
const PASSWORD = process.env.SCRAPER_PASS || 'sam';

async function login() {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const { token } = await res.json();
  return token;
}

async function importRecipe(url, token) {
  console.log(`\nImporting: ${url}`);
  const res = await fetch(`${API_URL}/recipes/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  const recipe = await res.json();
  console.log(`  ✓ Imported: "${recipe.title}" (id: ${recipe.id}, ${(recipe.ingredients || []).length} ingredients)`);
  return recipe;
}

async function updateTags(recipeId, tags, token) {
  if (!tags || tags.length === 0) return;
  // First get current tags
  const getRes = await fetch(`${API_URL}/recipes/${recipeId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!getRes.ok) return;
  const recipe = await getRes.json();
  const currentTags = recipe.dietary_tags || [];
  const mergedTags = [...new Set([...currentTags, ...tags])];

  await fetch(`${API_URL}/recipes/${recipeId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ dietary_tags: mergedTags }),
  });
  console.log(`  ✓ Tags updated: [${mergedTags.join(', ')}]`);
}

async function main() {
  console.log(`Connecting to API at ${API_URL}...`);

  let token;
  try {
    token = await login();
    console.log('Logged in successfully.\n');
  } catch (err) {
    console.error(`Failed to login: ${err.message}`);
    console.error('Make sure the app is running: docker compose up -d');
    process.exit(1);
  }

  // Determine URLs to import
  let entries = [];

  if (process.argv.slice(2).length) {
    // CLI args: plain URLs
    entries = process.argv.slice(2).map(url => ({ url, extra_tags: [] }));
    console.log(`Importing ${entries.length} recipe(s) from CLI args...\n`);
  } else {
    // Load from scrape-urls.json
    const jsonPath = path.join(__dirname, 'scrape-urls.json');
    if (fs.existsSync(jsonPath)) {
      try {
        entries = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        console.log(`Loaded ${entries.length} URL(s) from scrape-urls.json\n`);
      } catch (err) {
        console.error(`Failed to parse scrape-urls.json: ${err.message}`);
        process.exit(1);
      }
    } else {
      console.error('No scrape-urls.json found and no CLI args provided.');
      process.exit(1);
    }
  }

  let ok = 0, fail = 0;
  for (const entry of entries) {
    const url = typeof entry === 'string' ? entry : entry.url;
    const extraTags = entry.extra_tags || [];
    try {
      const recipe = await importRecipe(url, token);
      if (extraTags.length > 0) {
        await updateTags(recipe.id, extraTags, token);
      }
      ok++;
    } catch (err) {
      console.error(`  ✗ Failed (${url}): ${err.message}`);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} succeeded, ${fail} failed.`);
}

main().catch(e => { console.error(e); process.exit(1); });
