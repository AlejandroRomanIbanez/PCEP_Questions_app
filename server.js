require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

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

function loadQuestions(content) {
    if (!content || typeof content !== 'string') {
        console.error('Invalid content provided to loadQuestions');
        return [];
    }
    const lines = content.split('\n');
    const questions = [];
    let currentQuestion = null;
    let currentSection = '';
    let inCodeBlock = false;
    let explanationLines = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]; // No trim here to preserve code formatting
        if (line.trim().startsWith('#SECTION:')) {
            currentSection = line.substring(line.indexOf(':') + 1).trim();
        } else if (line.trim().startsWith('==QUESTION')) {
            if (currentQuestion) {
                currentQuestion.explanation = explanationLines.join('\n').trim();
                questions.push(currentQuestion);
            }
            currentQuestion = { question: '', options: [], correct: '', explanation: '', section: currentSection };
            explanationLines = [];
        } else if (line.trim().startsWith('[') && currentQuestion) {
            currentQuestion.options.push(line.trim());
        } else if (line.trim().startsWith('CORRECT:') && currentQuestion) {
            currentQuestion.correct = line.substring(line.indexOf(':') + 1).trim();
        } else if (line.trim().startsWith('EXPLANATION:') && currentQuestion) {
            explanationLines.push(line.substring(line.indexOf(':') + 1).trim());
        } else if (currentQuestion) {
            if (explanationLines.length > 0) {
                explanationLines.push(line);
            } else {
                currentQuestion.question += line + '\n';
            }
        }
    }
    if (currentQuestion) {
        currentQuestion.explanation = explanationLines.join('\n').trim();
        questions.push(currentQuestion);
    }
    return questions.map(q => ({ ...q, question: q.question.trim() }));
}


const files = [
    'PCEP-30-02 1.1 fundamental terms an.txt', 'PCEP-30-02 1.2 Python\'s logic and s.txt',
    'PCEP-30-02 1.3 literals, variables,.txt', 'PCEP-30-02 1.4 operators and data t.txt',
    'PCEP-30-02 1.5 InputOutput console.txt', 'PCEP-30-02 2.1 decision-making and.txt',
    'PCEP-30-02 2.2 iterations in Python.txt', 'PCEP-30-02 3.1 collecting and proce.txt',
    'PCEP-30-02 3.2 tuple indexing, slic.txt', 'PCEP-30-02 3.3 working with diction.txt',
    'PCEP-30-02 3.4 working with strings.txt', 'PCEP-30-02 4.1 working with functio.txt',
    'PCEP-30-02 4.2 section, covering pa.txt', 'PCEP-30-02 4.3 Python\'s Built-In Ex.txt',
    'PCEP-30-02 4.4 Basics of Python E.txt'
];

// NEW ENDPOINT: Get questions for a specific section
app.get('/questions/:sectionIndex', (req, res) => {
    try {
        const sectionIndex = parseInt(req.params.sectionIndex, 10);
        if (isNaN(sectionIndex) || sectionIndex < 0 || sectionIndex >= files.length) {
            return res.status(404).json({ error: 'Section not found' });
        }

        const filePath = path.join(__dirname, files[sectionIndex]);
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const allQuestions = loadQuestions(fileContent);

        // Send questions WITHOUT correct answers or explanations
        const questionsForClient = allQuestions.map(q => {
            const { correct, explanation, ...questionData } = q;
            return questionData;
        });

        res.json(questionsForClient);
    } catch (error) {
        console.error('Error loading questions:', error);
        res.status(500).json({ error: 'Failed to load questions' });
    }
});

app.get('/sections', (req, res) => {
    try {
        const descriptions = files.map((fileName, index) => {
            const filePath = path.join(__dirname, fileName);
            // Read only the first line of the file for efficiency
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const firstLine = fileContent.split('\n')[0].trim();
            const description = firstLine.startsWith('#SECTION:') 
                ? firstLine.substring(9).trim() 
                : 'Unnamed Section';
            
            return { index, description };
        });
        res.json(descriptions);
    } catch (error) {
        console.error('Error loading section descriptions:', error);
        res.status(500).json({ error: 'Failed to load section descriptions' });
    }
});


// NEW ENDPOINT: Check a submitted answer
app.post('/check-answer', (req, res) => {
    try {
        const { sectionIndex, questionIndex, userAnswer } = req.body;

        if (isNaN(sectionIndex) || sectionIndex < 0 || sectionIndex >= files.length) {
            return res.status(400).json({ error: 'Invalid section' });
        }

        const filePath = path.join(__dirname, files[sectionIndex]);
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const allQuestions = loadQuestions(fileContent);

        if (isNaN(questionIndex) || questionIndex < 0 || questionIndex >= allQuestions.length) {
            return res.status(400).json({ error: 'Invalid question' });
        }

        const question = allQuestions[questionIndex];
        const isCorrect = question.correct === userAnswer;

        res.json({
            isCorrect,
            correctAnswer: question.correct,
            explanation: question.explanation
        });

    } catch (error) {
        console.error('Error checking answer:', error);
        res.status(500).json({ error: 'Failed to check answer' });
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
