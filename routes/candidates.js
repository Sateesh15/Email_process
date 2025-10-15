const express = require('express');
const resumeParserService = require('../services/resumeParser');
const logger = require('../utils/logger');

const router = express.Router();

// Get all candidates
router.get('/', async (req, res) => {
  try {
    const candidates = resumeParserService.getAllCandidates();

    res.json({
      success: true,
      count: candidates.length,
      candidates: candidates,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching candidates:', error);
    res.status(500).json({
      error: 'Failed to fetch candidates',
      details: error.message,
      status: 500
    });
  }
});

// Get candidate by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const candidate = resumeParserService.getCandidateById(id);

    if (!candidate) {
      return res.status(404).json({
        error: 'Candidate not found',
        status: 404
      });
    }

    res.json({
      success: true,
      candidate: candidate,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching candidate:', error);
    res.status(500).json({
      error: 'Failed to fetch candidate',
      details: error.message,
      status: 500
    });
  }
});

// Clear all candidates data
router.delete('/clear', async (req, res) => {
  try {
    const clearedCount = await resumeParserService.clearAllCandidates();

    logger.info(`Cleared ${clearedCount} candidate records`);

    res.json({
      success: true,
      message: `Successfully cleared ${clearedCount} candidate records`,
      clearedCount: clearedCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error clearing candidates:', error);
    res.status(500).json({
      error: 'Failed to clear candidate data',
      details: error.message,
      status: 500
    });
  }
});

// Get candidates statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const candidates = resumeParserService.getAllCandidates();

    // Calculate statistics
    const stats = {
      totalCandidates: candidates.length,
      avgExperience: 0,
      topSkills: {},
      experienceDistribution: {
        '0-2': 0,
        '3-5': 0,
        '6-10': 0,
        '10+': 0
      },
      linkedinProfiles: 0
    };

    if (candidates.length > 0) {
      let totalExperience = 0;

      candidates.forEach(candidate => {
        // Experience calculation
        const exp = parseInt(candidate.experience) || 0;
        totalExperience += exp;

        // Experience distribution
        if (exp <= 2) stats.experienceDistribution['0-2']++;
        else if (exp <= 5) stats.experienceDistribution['3-5']++;
        else if (exp <= 10) stats.experienceDistribution['6-10']++;
        else stats.experienceDistribution['10+']++;

        // LinkedIn profiles
        if (candidate.linkedinUrl) stats.linkedinProfiles++;

        // Skills analysis
        const allSkills = [
          ...(candidate.primarySkills || []),
          ...(candidate.secondarySkills || [])
        ];

        allSkills.forEach(skill => {
          stats.topSkills[skill] = (stats.topSkills[skill] || 0) + 1;
        });
      });

      stats.avgExperience = (totalExperience / candidates.length).toFixed(1);
    }

    // Sort top skills
    stats.topSkills = Object.entries(stats.topSkills)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .reduce((obj, [skill, count]) => {
        obj[skill] = count;
        return obj;
      }, {});

    res.json({
      success: true,
      statistics: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error calculating statistics:', error);
    res.status(500).json({
      error: 'Failed to calculate statistics',
      details: error.message,
      status: 500
    });
  }
});

module.exports = router;