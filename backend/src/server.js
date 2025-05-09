const express = require('express');
const db = require('./db');
const authRoutes = require('./auth');


const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.json({ status: 'ok', time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed', details: err.message });
  }
});

app.use('/auth', authRoutes); // Routes will be prefixed with /auth


app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
