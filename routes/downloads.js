const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const excelGeneratorService = require('../services/excelGenerator');
const pdfGeneratorService = require('../services/pdfGenerator');
const resumeParserService = require('../services/resumeParser');
const logger = require('../utils/logger');

const router = express.Router();

// Download consolidated Excel report
router.get('/excel', async (req, res) => {
  try {
    const candidates = resumeParserService.getAllCandidates();

    if (candidates.length === 0) {
      return res.status(404).json({
        error: 'No candidate data available for export',
        status: 404
      });
    }

    logger.info(`Generating Excel report for ${candidates.length} candidates`);

    const excelPath = await excelGeneratorService.generateExcelReport(candidates);

    if (!await fs.pathExists(excelPath)) {
      throw new Error('Generated Excel file not found');
    }

    const fileName = `HR_Resume_Report_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Stream the file
    const fileStream = fs.createReadStream(excelPath);
    fileStream.pipe(res);

    fileStream.on('end', async () => {
      logger.info(`Excel report downloaded: ${fileName}`);
      // Clean up the temporary file after download
      await fs.remove(excelPath).catch(() => {});
    });

    fileStream.on('error', (error) => {
      logger.error('Error streaming Excel file:', error);
      res.status(500).json({
        error: 'Failed to download Excel report',
        details: error.message
      });
    });

  } catch (error) {
    logger.error('Error generating Excel report:', error);
    res.status(500).json({
      error: 'Failed to generate Excel report',
      details: error.message,
      status: 500
    });
  }
});

// Download individual PDF summary
router.get('/pdf/:candidateId', async (req, res) => {
  try {
    const { candidateId } = req.params;
    const candidate = resumeParserService.getCandidateById(candidateId);

    if (!candidate) {
      return res.status(404).json({
        error: 'Candidate not found',
        status: 404
      });
    }

    logger.info(`Generating PDF summary for candidate: ${candidate.name}`);

    const pdfPath = await pdfGeneratorService.generateCandidatePDF(candidate);

    if (!await fs.pathExists(pdfPath)) {
      throw new Error('Generated PDF file not found');
    }

    const fileName = `${candidate.name.replace(/[^a-zA-Z0-9]/g, '_')}_Summary.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Stream the file
    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);

    fileStream.on('end', async () => {
      logger.info(`PDF summary downloaded: ${fileName}`);
      // Clean up the temporary file after download
      await fs.remove(pdfPath).catch(() => {});
    });

    fileStream.on('error', (error) => {
      logger.error('Error streaming PDF file:', error);
      res.status(500).json({
        error: 'Failed to download PDF summary',
        details: error.message
      });
    });

  } catch (error) {
    logger.error('Error generating PDF summary:', error);
    res.status(500).json({
      error: 'Failed to generate PDF summary',
      details: error.message,
      status: 500
    });
  }
});

// Download original resume file
router.get('/original/:candidateId', async (req, res) => {
  try {
    const { candidateId } = req.params;
    const candidate = resumeParserService.getCandidateById(candidateId);

    if (!candidate) {
      return res.status(404).json({
        error: 'Candidate not found',
        status: 404
      });
    }

    if (!candidate.filePath || !await fs.pathExists(candidate.filePath)) {
      return res.status(404).json({
        error: 'Original resume file not found',
        status: 404
      });
    }

    const fileName = path.basename(candidate.filePath);
    const fileExt = path.extname(fileName).toLowerCase();

    // Set appropriate content type
    let contentType = 'application/octet-stream';
    if (fileExt === '.pdf') {
      contentType = 'application/pdf';
    } else if (fileExt === '.docx') {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (fileExt === '.doc') {
      contentType = 'application/msword';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Stream the file
    const fileStream = fs.createReadStream(candidate.filePath);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      logger.info(`Original resume downloaded: ${fileName}`);
    });

    fileStream.on('error', (error) => {
      logger.error('Error streaming original file:', error);
      res.status(500).json({
        error: 'Failed to download original resume',
        details: error.message
      });
    });

  } catch (error) {
    logger.error('Error downloading original resume:', error);
    res.status(500).json({
      error: 'Failed to download original resume',
      details: error.message,
      status: 500
    });
  }
});

// Get download statistics
router.get('/stats', async (req, res) => {
  try {
    const outputDir = 'outputs';
    await fs.ensureDir(outputDir);

    const files = await fs.readdir(outputDir);

    let totalSize = 0;
    const fileTypes = {
      excel: 0,
      pdf: 0,
      other: 0
    };

    for (const file of files) {
      const filePath = path.join(outputDir, file);
      const stats = await fs.stat(filePath).catch(() => null);

      if (stats) {
        totalSize += stats.size;

        const ext = path.extname(file).toLowerCase();
        if (ext === '.xlsx') fileTypes.excel++;
        else if (ext === '.pdf') fileTypes.pdf++;
        else fileTypes.other++;
      }
    }

    res.json({
      success: true,
      statistics: {
        totalFiles: files.length,
        totalSize: totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        fileTypes: fileTypes
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting download stats:', error);
    res.status(500).json({
      error: 'Failed to get download statistics',
      details: error.message
    });
  }
});

module.exports = router;