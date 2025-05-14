const express = require('express');
const cors = require('cors'); 
const db = require('./db');
const authRoutes = require('./auth');


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

app.use('/auth', authRoutes); // Routes will be prefixed with /auth


app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
