const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { validateFileUpload } = require('../middleware/validation');
const resumeParserService = require('../services/resumeParser');
const logger = require('../utils/logger');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = 'uploads';
    await fs.ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${uniqueSuffix}-${originalName}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'message/rfc822', // EML files
    'application/octet-stream' // Sometimes EML files have this mime type
  ];

  const allowedExtensions = ['.pdf', '.docx', '.doc', '.eml'];
  const fileExt = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not supported: ${file.originalname}. Allowed types: PDF, DOCX, DOC, EML`), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 20 // Maximum 20 files
  }
});

// Upload endpoint
router.post('/', upload.array('files', 20), validateFileUpload, async (req, res) => {
  try {
    logger.info(`Processing ${req.files?.length || 0} uploaded files`);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No files uploaded',
        status: 400
      });
    }

    const extractAdditionalFields = req.body.extractAdditionalFields === 'true';
    const results = [];
    const errors = [];

    // Process each file
    for (const file of req.files) {
      try {
        logger.info(`Processing file: ${file.originalname}`);

        const candidateData = await resumeParserService.parseResume(
          file.path, 
          file.originalname,
          extractAdditionalFields
        );

        results.push({
          filename: file.originalname,
          candidate: candidateData,
          status: 'success'
        });

        logger.info(`Successfully processed: ${file.originalname}`);

      } catch (error) {
        logger.error(`Error processing file ${file.originalname}:`, error);

        errors.push({
          filename: file.originalname,
          error: error.message,
          status: 'failed'
        });

        // Clean up failed file
        await fs.remove(file.path).catch(() => {});
      }
    }

    // Response
    const response = {
      success: true,
      processed: results.length,
      failed: errors.length,
      extractedAdditionalFields: extractAdditionalFields,
      results: results,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString()
    };

    logger.info(`Upload processing completed. Success: ${results.length}, Failed: ${errors.length}`);

    res.status(200).json(response);

  } catch (error) {
    logger.error('Upload processing error:', error);

    // Clean up uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        await fs.remove(file.path).catch(() => {});
      }
    }

    res.status(500).json({
      error: 'Failed to process uploaded files',
      details: error.message,
      status: 500
    });
  }
});

// Get upload statistics
router.get('/stats', async (req, res) => {
  try {
    const uploadDir = 'uploads';
    const files = await fs.readdir(uploadDir).catch(() => []);

    let totalSize = 0;
    for (const file of files) {
      const filePath = path.join(uploadDir, file);
      const stats = await fs.stat(filePath).catch(() => null);
      if (stats) {
        totalSize += stats.size;
      }
    }

    res.json({
      totalFiles: files.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
    });

  } catch (error) {
    logger.error('Error getting upload stats:', error);
    res.status(500).json({
      error: 'Failed to get upload statistics',
      details: error.message
    });
  }
});

module.exports = router;