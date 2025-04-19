require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());
app.set('trust proxy', 1);

// Load environment variables
const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';
const PORT = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Routes
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const userCheck = await pool.query('SELECT username FROM users WHERE username = $1', [username]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hashedPassword]);

    const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/save-results', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const decoded = jwt.verify(token, SECRET_KEY);
    const username = decoded.username;
    const { section, score, total, timestamp } = req.body;

    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    const user_id = userResult.rows[0]?.id;
    if (!user_id) {
      return res.status(404).json({ error: 'User not found' });
    }

    await pool.query(
      'INSERT INTO results (user_id, section, score, total, timestamp) VALUES ($1, $2, $3, $4, $5)',
      [user_id, section, score, total, timestamp]
    );

    res.json({ message: 'Results saved successfully' });
  } catch (error) {
    console.error('Error saving results:', error);
    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({ error: 'Invalid token' });
    } else {
      res.status(500).json({ error: 'Failed to save results' });
    }
  }
});

app.get('/get-results', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const decoded = jwt.verify(token, SECRET_KEY);
    const username = decoded.username;

    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    const user_id = userResult.rows[0]?.id;
    if (!user_id) {
      return res.status(404).json({ error: 'User not found' });
    }

    const results = await pool.query(
      'SELECT section, score, total, timestamp FROM results WHERE user_id = $1 ORDER BY timestamp DESC',
      [user_id]
    );

    res.json(results.rows);
  } catch (error) {
    console.error('Error reading results:', error);
    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({ error: 'Invalid token' });
    } else {
      res.status(500).json({ error: 'Failed to read results' });
    }
  }
});

app.get('/verify-token', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    jwt.verify(token, SECRET_KEY);
    res.json({ valid: true });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.use(express.static(__dirname));

// Initialize database schema
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS results (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        section INTEGER NOT NULL,
        score INTEGER NOT NULL,
        total INTEGER NOT NULL,
        timestamp TIMESTAMP NOT NULL
      );
    `);
    console.log('Database schema initialized');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
}

// Start server
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}).catch(err => console.error('Server startup failed:', err));
