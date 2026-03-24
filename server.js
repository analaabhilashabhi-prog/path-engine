require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting - prevents API spam
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// API Routes (we will build these step by step)
// app.use('/api/auth', require('./routes/auth'));
// app.use('/api/assessment', require('./routes/assessment'));
// app.use('/api/roadmap', require('./routes/ai-roadmap'));
// app.use('/api/progress', require('./routes/progress'));
// app.use('/api/profile', require('./routes/profile'));

// Serve pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('  ====================================');
  console.log('  PATH ENGINE - Powered by AI');
  console.log('  ====================================');
  console.log('  Server running on: http://localhost:' + PORT);
  console.log('  Environment: ' + (process.env.NODE_ENV || 'development'));
  console.log('  ====================================');
  console.log('');
});