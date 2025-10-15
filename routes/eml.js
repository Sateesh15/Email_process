const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { validateEmlUpload } = require('../middleware/validation');
const emlProcessorService = require('../services/emlProcessor');
const logger = require('../utils/logger');

const router = express.Router();

// Configure multer for EML uploads
const emlStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const tempDir = 'temp/eml';
    await fs.ensureDir(tempDir);
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const emlUpload = multer({
  storage: emlStorage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['message/rfc822', 'application/octet-stream'];
    const isEmlFile = path.extname(file.originalname).toLowerCase() === '.eml';

    if (allowedTypes.includes(file.mimetype) || isEmlFile) {
      cb(null, true);
    } else {
      cb(new Error('Only EML files are allowed'), false);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB for email files
    files: 10
  }
});

// Process EML files
router.post('/process', emlUpload.array('emlFiles', 10), validateEmlUpload, async (req, res) => {
  try {
    logger.info(`Processing ${req.files?.length || 0} EML files`);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No EML files uploaded',
        status: 400
      });
    }

    const extractAdditionalFields = req.body.extractAdditionalFields === 'true';
    const processSubfolders = req.body.processSubfolders !== 'false'; // Default true

    const results = [];
    const errors = [];

    // Process each EML file
    for (const file of req.files) {
      try {
        logger.info(`Processing EML file: ${file.originalname}`);

        const processingResult = await emlProcessorService.processEmlFile(
          file.path,
          file.originalname,
          extractAdditionalFields,
          processSubfolders
        );

        results.push({
          filename: file.originalname,
          attachmentsFound: processingResult.attachments.length,
          candidatesProcessed: processingResult.candidates.length,
          candidates: processingResult.candidates,
          attachments: processingResult.attachments,
          status: 'success'
        });

        logger.info(`Successfully processed EML: ${file.originalname} - Found ${processingResult.attachments.length} attachments, processed ${processingResult.candidates.length} candidates`);

      } catch (error) {
        logger.error(`Error processing EML file ${file.originalname}:`, error);

        errors.push({
          filename: file.originalname,
          error: error.message,
          status: 'failed'
        });
      } finally {
        // Clean up temporary EML file
        await fs.remove(file.path).catch(() => {});
      }
    }

    // Calculate totals
    const totalAttachments = results.reduce((sum, result) => sum + result.attachmentsFound, 0);
    const totalCandidates = results.reduce((sum, result) => sum + result.candidatesProcessed, 0);

    const response = {
      success: true,
      processedFiles: results.length,
      failedFiles: errors.length,
      totalAttachmentsFound: totalAttachments,
      totalCandidatesProcessed: totalCandidates,
      extractedAdditionalFields: extractAdditionalFields,
      processedSubfolders: processSubfolders,
      results: results,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString()
    };

    logger.info(`EML processing completed. Success: ${results.length}, Failed: ${errors.length}, Total candidates: ${totalCandidates}`);

    res.status(200).json(response);

  } catch (error) {
    logger.error('EML processing error:', error);

    // Clean up uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        await fs.remove(file.path).catch(() => {});
      }
    }

    res.status(500).json({
      error: 'Failed to process EML files',
      details: error.message,
      status: 500
    });
  }
});

// Get EML processing statistics
router.get('/stats', async (req, res) => {
  try {
    const tempDir = 'temp/eml';
    const extractedDir = 'temp/extracted';

    const tempFiles = await fs.readdir(tempDir).catch(() => []);
    const extractedFiles = await fs.readdir(extractedDir).catch(() => []);

    res.json({
      success: true,
      statistics: {
        tempEmlFiles: tempFiles.length,
        extractedAttachments: extractedFiles.length,
        lastProcessed: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting EML stats:', error);
    res.status(500).json({
      error: 'Failed to get EML processing statistics',
      details: error.message
    });
  }
});

// Clean up temporary EML processing files
router.delete('/cleanup', async (req, res) => {
  try {
    const tempDir = 'temp/eml';
    const extractedDir = 'temp/extracted';

    await fs.emptyDir(tempDir);
    await fs.emptyDir(extractedDir);

    logger.info('EML temporary files cleaned up');

    res.json({
      success: true,
      message: 'EML temporary files cleaned up successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error cleaning up EML files:', error);
    res.status(500).json({
      error: 'Failed to clean up EML files',
      details: error.message
    });
  }
});

module.exports = router;