const express = require('express');
const mongoose = require('./mock-mongoose');
const path = require('path');
const fs = require('fs');
const loadEnv = require('./load-env');

// Load environment variables
loadEnv();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/voidkid';

const User = require('./models/user');
const { hashPassword } = require('./utils/helpers');

async function seedAdminUser() {
  try {
    const targetEmail = process.env.ADMIN_EMAIL || 'riskymixxye1@gmail.com';
    const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'mixxye16A+';
    const existing = await User.findOne({ email: targetEmail });
    if (!existing) {
      console.log(`Seeding user ${targetEmail}...`);
      const hashedPassword = hashPassword(defaultPassword);
      const admin = new User({
        email: targetEmail,
        username: targetEmail.split('@')[0],
        password: hashedPassword
      });
      await admin.save();
      console.log(`User ${targetEmail} created successfully.`);
    }
  } catch (error) {
    console.error('Error seeding admin user:', error);
  }
}

// Cache index.html on startup
const htmlPath = path.join(__dirname, 'public', 'index.html');
let cachedHtml = '';
try {
  cachedHtml = fs.readFileSync(htmlPath, 'utf-8');
} catch (err) {
  console.error('Failed to cache index.html on startup:', err.message);
}

// Connect to MongoDB (Non-blocking mock fallback to keep process alive)
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Successfully connected to MongoDB.');
    seedAdminUser();
  })
  .catch(err => {
    console.error('MongoDB connection error (non-fatal mock mode enabled):', err.message);
  });

// Stub models if mongoose drops connection to prevent process termination on unhandled errors
mongoose.connection.on('error', err => {
  console.error('Mongoose connection error handler:', err.message);
});

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Metrics collection (Prometheus format)
const httpRequestsTotal = {};
app.use((req, res, next) => {
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    if (route === '/metrics') return; // Skip metrics requests themselves
    const key = `method="${req.method}",route="${route}",status="${res.statusCode}"`;
    httpRequestsTotal[key] = (httpRequestsTotal[key] || 0) + 1;
  });
  next();
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  let output = '';
  output += '# HELP http_requests_total Total number of HTTP requests.\n';
  output += '# TYPE http_requests_total counter\n';
  for (const [labels, count] of Object.entries(httpRequestsTotal)) {
    output += `http_requests_total{${labels}} ${count}\n`;
  }
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.end(output);
});

// Serve index.html on root — uses cached index
app.get('/', (req, res) => {
  res.set('Content-Type', 'text/html');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.send(cachedHtml);
});

// Serve static assets (CSS, JS) from public/
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  index: false,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store');
  }
}));

// Mount routes
const userRoutes = require('./routes/user');
const kickAccountRoutes = require('./routes/kick-accounts');
const kickApiRoutes = require('./routes/kick-api');
const auth = require('./auth');
const mockKopechkaRoutes = require('./routes/mock-kopechka');
const simulationRoutes = require('./routes/simulation');
const kickerzRoutes = require('./routes/kickerz');

app.use('/api/users', auth.authenticate, userRoutes);
app.use('/api/kick-accounts', auth.authenticate, kickAccountRoutes);
app.use('/api/kick', auth.authenticate, kickApiRoutes);
app.use('/api/auth', auth.router);
app.use('/mock/kopechka', mockKopechkaRoutes);
app.use('/api/simulation', auth.authenticate, simulationRoutes);
app.use('/api/kickerz', auth.authenticate, kickerzRoutes);

// Fallback: serve index.html for any unmatched route
app.get('*path', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start listening
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Keep-alive interval for sandbox environment
setInterval(() => {}, 60000);
