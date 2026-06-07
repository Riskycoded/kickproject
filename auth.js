const express = require('express');
const crypto = require('crypto');
const User = require('./models/user');
const rateLimiter = require('./rate-limiter');
const { hashPassword } = require('./utils/helpers');

const router = express.Router();

// Session token store (in-memory)
const activeTokens = new Map();

// Helper to compare password against stored hash
function comparePasswords(storedPassword, enteredPassword) {
  if (!storedPassword || !enteredPassword) return false;
  const parts = storedPassword.split(':');
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const enteredHash = crypto.pbkdf2Sync(enteredPassword, salt, 600000, 64, 'sha512').toString('hex');
  
  const hashBuf = Buffer.from(hash, 'hex');
  const enteredHashBuf = Buffer.from(enteredHash, 'hex');
  if (hashBuf.length !== enteredHashBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(hashBuf, enteredHashBuf);
}

// Authorization middleware
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token && activeTokens.has(token)) {
    req.user = activeTokens.get(token);
    return next();
  }

  return res.status(401).json({ error: 'Access denied: Authentication required.' });
}

// User Registration endpoint
router.post('/register', async (req, res) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password) {
    return res.status(400).json({ error: 'Email, username, and password are required' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash the password securely before saving
    const hashedPassword = hashPassword(password);
    const newUser = new User({ email, username, password: hashedPassword });
    await newUser.save();

    // Do not return password field in response
    const userResponse = { _id: newUser._id, email: newUser.email, username: newUser.username };
    res.status(201).json({ error: null, message: 'User registered successfully', user: userResponse });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User Login endpoint (protected by rate limiter: max 10 requests per minute)
router.post('/login', rateLimiter(10, 60 * 1000), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Authentication failed: User not found' });
    }

    // Verify hashed password
    const isPasswordValid = comparePasswords(user.password, password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Authentication failed: Invalid credentials' });
    }

    // Generate a secure random session token
    const token = crypto.randomBytes(32).toString('hex');
    activeTokens.set(token, { _id: user._id, email: user.email, username: user.username });

    res.json({ error: null, message: 'Logged in successfully', token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Protected Route Example
router.get('/protected', authenticate, (req, res) => {
  // Hide password in response
  const userResponse = { _id: req.user._id, email: req.user.email, username: req.user.username };
  res.json({ error: null, message: 'Hello, authenticated user!', user: userResponse });
});

// User Logout endpoint
router.post('/logout', authenticate, (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    activeTokens.delete(token);
  }
  res.json({ error: null, message: 'Logged out successfully' });
});

module.exports = {
  router,
  authenticate
};
