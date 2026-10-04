/**
 * Creates an Express app for testing (without starting the server or connecting to real DB).
 * Mirrors the middleware and routes from src/index.js but skips Socket.IO, intervals, etc.
 */
const express = require('express');
const cookieParser = require('cookie-parser');

// Set env vars before requiring controllers (they check JWT secrets at import time)
process.env.JWT_ACCESS_SECRET = 'test-access-secret-12345';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-67890';
process.env.JWT_ACCESS_EXPIRE = '1h';
process.env.JWT_REFRESH_EXPIRE = '7d';
process.env.NODE_ENV = 'test';

const errorHandler = require('../src/middleware/errorHandler');
const authRoutes = require('../src/routes/auth.routes');
const tokenRoutes = require('../src/routes/token.routes');
const adminRoutes = require('../src/routes/admin.routes');
const serviceRoutes = require('../src/routes/service.routes');

const createApp = () => {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/tokens', tokenRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/services', serviceRoutes);

  // Health check
  app.get('/api/health', (req, res) => {
    res.status(200).json({ success: true, message: 'OK' });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` });
  });

  // Error handler
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
