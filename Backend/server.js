const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const tunnel=require('./services/tunnel');
const authRoutes = require('./routes/auth');
const surveyRoutes = require('./routes/surveys');
const adminRoutes = require('./routes/admin');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files for frontend
app.use(express.static(config.PATHS.FRONTEND));

// Serve uploaded files securely for preview
app.use('/uploads', express.static(config.PATHS.UPLOADS));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/surveys', surveyRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'AutoSurveyX Core API',
    time: new Date().toISOString()
  });
});

// Centralized Error Handling Middleware (Catches MulterError and all exceptions cleanly as JSON)
app.use((err, req, res, next) => {
  console.error('Server Express error handler:', err);
  if (err.name === 'MulterError' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      error: `File upload error: ${err.message || err.code}`
    });
  }
  return res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Public URL status endpoint
app.get('/api/public-url', (req, res) => {
    success: true,
    publicUrl: tunnel.getPublicUrl(),
    localPort: config.PORT,
    localIpUrl: `http://192.168.1.161:${config.PORT}`
  });
});

// Single Page Application fallback
app.use((req, res) => {
  res.sendFile(path.join(config.PATHS.FRONTEND, 'index.html'));
});

// Start server
const server = app.listen(config.PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 AutoSurveyX Server running on port ${config.PORT}`);
  console.log(`🌐 Local URL: http://localhost:${config.PORT}`);
  console.log(`📁 Admin File Repository: http://localhost:${config.PORT}/#admin`);
  console.log(`=======================================================`);

  // Launch Cloudflare global public tunnel
  tunnel.start(config.PORT);
});

// Configure server timeouts to withstand heavy multi-file intake & extraction without dropping connections
server.timeout = 600000; // 10 minutes
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
