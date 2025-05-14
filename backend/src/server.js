const express = require('express');
const cors = require('cors'); 
const db = require('./db');
const authRoutes = require('./auth');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: 'https://meal-planner-1-lig0.onrender.com',
  credentials: true,
}));
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.json({ status: 'ok', time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed', details: err.message });
  }
});

app.get('/meals', async (req, res) => {
  const { type } = req.query;
  let query = 'SELECT * FROM meals';
  let params = [];
  if (type) {
    query += ' WHERE type = $1';
    params.push(type);
  }
  const { rows } = await db.query(query, params);
  res.json(rows);
});

// Get meal plans for a user and month
app.get('/meal-plans', authenticateToken, async (req, res) => {
  const { year, month } = req.query;
  const userId = req.user.id;
  const lastDay = new Date(year, month, 0).getDate(); // month is 1-based here
  const start = `${year}-${month}-01`;
  const end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
  const { rows } = await db.query(
    'SELECT * FROM meal_plans WHERE user_id = $1 AND date BETWEEN $2 AND $3',
    [userId, start, end]
  );
  res.json(rows);
});

// Save/update a meal plan
app.post('/meal-plans', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { date, meal_type, meal_name } = req.body;
  await db.query(
    `INSERT INTO meal_plans (user_id, date, meal_type, meal_name, last_updated)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, date, meal_type)
     DO UPDATE SET meal_name = EXCLUDED.meal_name, last_updated = NOW()`,
    [userId, date, meal_type, meal_name]
  );
  res.json({ success: true });
});

app.use('/auth', authRoutes); // Routes will be prefixed with /auth


app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
