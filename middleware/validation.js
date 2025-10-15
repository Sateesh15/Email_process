const Joi = require('joi');
const fileValidation = require('../utils/fileValidation');
const logger = require('../utils/logger');

// Request validation schemas
const schemas = {
  fileUpload: Joi.object({
    extractAdditionalFields: Joi.string().valid('true', 'false').default('false'),
    processSubfolders: Joi.string().valid('true', 'false').default('true')
  }),

  emlUpload: Joi.object({
    extractAdditionalFields: Joi.string().valid('true', 'false').default('false'),
    processSubfolders: Joi.string().valid('true', 'false').default('true')
  }),

  candidateId: Joi.object({
    id: Joi.string().uuid().required()
  })
};

// File upload validation middleware
const validateFileUpload = (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = schemas.fileUpload.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid request parameters',
        details: error.details.map(d => d.message),
        status: 400
      });
    }

    req.body = value;

    // Validate uploaded files
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No files uploaded',
        status: 400
      });
    }

    const validation = fileValidation.validateFileArray(req.files);

    if (!validation.isValid) {
      // Clean up uploaded files
      req.files.forEach(file => {
        const fs = require('fs-extra');
        fs.remove(file.path).catch(() => {});
      });

      return res.status(400).json({
        error: 'File validation failed',
        details: validation.errors,
        invalidFiles: validation.invalidFiles.map(f => ({
          filename: f.file.originalname,
          errors: f.validation.errors
        })),
        status: 400
      });
    }

    // Log validation warnings if any
    if (validation.warnings.length > 0) {
      logger.warn('File upload warnings:', validation.warnings);
    }

    req.fileValidation = validation;
    next();

  } catch (error) {
    logger.error('File upload validation error:', error);
    res.status(500).json({
      error: 'Validation failed due to internal error',
      details: error.message,
      status: 500
    });
  }
};

// EML upload validation middleware
const validateEmlUpload = (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = schemas.emlUpload.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid request parameters',
        details: error.details.map(d => d.message),
        status: 400
      });
    }

    req.body = value;

    // Validate uploaded EML files
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No EML files uploaded',
        status: 400
      });
    }

    // Additional EML-specific validation
    const emlValidation = req.files.every(file => {
      const isEml = file.originalname.toLowerCase().endsWith('.eml') ||
                   file.mimetype === 'message/rfc822' ||
                   file.mimetype === 'application/octet-stream';

      if (!isEml) {
        logger.warn(`Non-EML file uploaded: ${file.originalname} (${file.mimetype})`);
      }

      return isEml;
    });

    if (!emlValidation) {
      return res.status(400).json({
        error: 'Only EML files are allowed for EML processing',
        status: 400
      });
    }

    next();

  } catch (error) {
    logger.error('EML upload validation error:', error);
    res.status(500).json({
      error: 'EML validation failed due to internal error',
      details: error.message,
      status: 500
    });
  }
};

// Candidate ID validation middleware
const validateCandidateId = (req, res, next) => {
  try {
    const { error, value } = schemas.candidateId.validate(req.params);
    if (error) {
      return res.status(400).json({
        error: 'Invalid candidate ID format',
        details: error.details.map(d => d.message),
        status: 400
      });
    }

    req.params = value;
    next();

  } catch (error) {
    logger.error('Candidate ID validation error:', error);
    res.status(500).json({
      error: 'ID validation failed due to internal error',
      details: error.message,
      status: 500
    });
  }
};

// Generic request validation middleware
const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'Request validation failed',
          details: error.details.map(d => d.message),
          status: 400
        });
      }

      req.body = value;
      next();

    } catch (error) {
      logger.error('Request validation error:', error);
      res.status(500).json({
        error: 'Validation failed due to internal error',
        details: error.message,
        status: 500
      });
    }
  };
};

// Query parameters validation
const validateQuery = (schema) => {
  return (req, res, next) => {
    try {
      const { error, value } = schema.validate(req.query);
      if (error) {
        return res.status(400).json({
          error: 'Query validation failed',
          details: error.details.map(d => d.message),
          status: 400
        });
      }

      req.query = value;
      next();

    } catch (error) {
      logger.error('Query validation error:', error);
      res.status(500).json({
        error: 'Query validation failed due to internal error',
        details: error.message,
        status: 500
      });
    }
  };
};

// Content-Type validation middleware
const validateContentType = (allowedTypes) => {
  return (req, res, next) => {
    const contentType = req.get('Content-Type');

    if (!contentType) {
      return res.status(400).json({
        error: 'Content-Type header is required',
        status: 400
      });
    }

    const isAllowed = allowedTypes.some(type => 
      contentType.toLowerCase().includes(type.toLowerCase())
    );

    if (!isAllowed) {
      return res.status(415).json({
        error: 'Unsupported Media Type',
        details: `Content-Type must be one of: ${allowedTypes.join(', ')}`,
        received: contentType,
        status: 415
      });
    }

    next();
  };
};

// Rate limiting helper (basic implementation)
const createRateLimit = (windowMs, maxRequests) => {
  const requests = new Map();

  return (req, res, next) => {
    const clientId = req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old requests
    if (requests.has(clientId)) {
      const clientRequests = requests.get(clientId);
      const recentRequests = clientRequests.filter(time => time > windowStart);
      requests.set(clientId, recentRequests);
    }

    // Check rate limit
    const clientRequests = requests.get(clientId) || [];

    if (clientRequests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Too Many Requests',
        details: `Maximum ${maxRequests} requests per ${windowMs / 1000} seconds`,
        retryAfter: Math.ceil((clientRequests[0] + windowMs - now) / 1000),
        status: 429
      });
    }

    // Add current request
    clientRequests.push(now);
    requests.set(clientId, clientRequests);

    next();
  };
};

// Export validation functions
module.exports = {
  validateFileUpload,
  validateEmlUpload,
  validateCandidateId,
  validateRequest,
  validateQuery,
  validateContentType,
  createRateLimit,
  schemas
};