const express = require('express');
const db = require('./db');

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

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
