const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { authenticateToken } = require('./middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (!/[A-Z]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one uppercase letter.' });
  }
  if (!/[a-z]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one lowercase letter.' });
  }
  if (!/[0-9]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one number.' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
      [username, hashedPassword]
    );
    res.status(201).json({ message: 'User registered' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already taken.' });
    }
    res.status(500).json({ error: 'Error registering user.' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password, remember } = req.body;
  try {
    const result = await db.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    const user = result.rows[0];
    if (user && await bcrypt.compare(password, user.password_hash)) {
      const expiresIn = remember ? '30d' : '7d';
      const token = jwt.sign({ id: user.id, role: user.role || 'user' }, JWT_SECRET, { expiresIn });
      res.json({ token });
    } else {
      res.status(401).send('Invalid credentials');
    }
  } catch (err) {
    res.status(500).send('Error logging in');
  }
});

router.put('/change-password', authenticateToken, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }
  if (new_password.length < 8 || !/[A-Z]/.test(new_password) || !/[a-z]/.test(new_password) || !/[0-9]/.test(new_password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters with uppercase, lowercase, and a number.' });
  }
  try {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

    const hashedPassword = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, req.user.id]);
    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Error changing password.' });
  }
});

router.delete('/account', authenticateToken, async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password is required to delete account.' });
  }
  try {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Password is incorrect.' });

    await db.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ message: 'Account deleted successfully.' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Error deleting account.' });
  }
});

module.exports = router;
