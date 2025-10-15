const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

// Import custom modules
const fileUploadRoutes = require('./routes/fileUpload');
const candidateRoutes = require('./routes/candidates');
const downloadRoutes = require('./routes/downloads');
const emlRoutes = require('./routes/eml');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'hr-resume-backend' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});

// Create necessary directories
const createDirectories = async () => {
  const dirs = ['uploads', 'logs', 'outputs', 'temp'];
  for (const dir of dirs) {
    await fs.ensureDir(dir);
  }
  logger.info('Directories created successfully');
};

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Static files
app.use('/uploads', express.static('uploads'));
app.use('/outputs', express.static('outputs'));

// Routes
app.use('/api/upload', fileUploadRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/downloads', downloadRoutes);
app.use('/api/eml', emlRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error(error.stack);
  res.status(error.status || 500).json({
    error: {
      message: error.message || 'Internal Server Error',
      status: error.status || 500
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: {
      message: 'Endpoint not found',
      status: 404
    }
  });
});

// Start server
const startServer = async () => {
  try {
    await createDirectories();
    app.listen(PORT, () => {
      logger.info(`HR Resume Backend server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;