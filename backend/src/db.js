const { Pool, types } = require('pg');

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Date objects.
// Without this, node-postgres returns Date objects which shift by timezone when
// concatenated with 'T00:00:00' and cause "Invalid time value" errors.
types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(process.env.DB_SSL === 'true' && {
    ssl: { rejectUnauthorized: false }
  })
});

module.exports = {
  query: (text, params) => pool.query(text, params)
};
