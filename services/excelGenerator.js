const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs-extra');
const logger = require('../utils/logger');

class ExcelGeneratorService {
  constructor() {
    this.outputDir = 'outputs';
  }

  async generateExcelReport(candidates) {
    try {
      logger.info(`Generating Excel report for ${candidates.length} candidates`);

      // Ensure output directory exists
      await fs.ensureDir(this.outputDir);

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'HR Resume Processor';
      workbook.lastModifiedBy = 'System';
      workbook.created = new Date();
      workbook.modified = new Date();

      // Add main worksheet
      const worksheet = workbook.addWorksheet('Candidates Summary', {
        pageSetup: { paperSize: 9, orientation: 'landscape' }
      });

      // Set up columns
      const columns = [
        { header: 'ID', key: 'id', width: 12 },
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Experience', key: 'experience', width: 12 },
        { header: 'LinkedIn URL', key: 'linkedinUrl', width: 30 },
        { header: 'Primary Skills', key: 'primarySkills', width: 25 },
        { header: 'Secondary Skills', key: 'secondarySkills', width: 25 },
        { header: 'Original File', key: 'originalFileName', width: 20 },
        { header: 'Processed Date', key: 'processedAt', width: 18 }
      ];

      // Check if any candidate has additional fields
      const hasAdditionalFields = candidates.some(candidate => candidate.additionalFields);

      if (hasAdditionalFields) {
        columns.push(
          { header: 'Education', key: 'education', width: 25 },
          { header: 'Location', key: 'location', width: 15 },
          { header: 'Current Role', key: 'currentRole', width: 20 },
          { header: 'Summary', key: 'summary', width: 30 },
          { header: 'Certifications', key: 'certifications', width: 25 },
          { header: 'Languages', key: 'languages', width: 20 }
        );
      }

      worksheet.columns = columns;

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '366092' }
      };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
      headerRow.height = 25;

      // Add data rows
      candidates.forEach((candidate, index) => {
        const rowData = {
          id: candidate.id,
          name: candidate.name || 'N/A',
          email: candidate.email || 'N/A',
          phone: candidate.phone || 'N/A',
          experience: candidate.experience || 'N/A',
          linkedinUrl: candidate.linkedinUrl || 'N/A',
          primarySkills: Array.isArray(candidate.primarySkills) 
            ? candidate.primarySkills.join(', ') 
            : candidate.primarySkills || 'N/A',
          secondarySkills: Array.isArray(candidate.secondarySkills) 
            ? candidate.secondarySkills.join(', ') 
            : candidate.secondarySkills || 'N/A',
          originalFileName: candidate.originalFileName || 'N/A',
          processedAt: candidate.processedAt ? new Date(candidate.processedAt).toLocaleDateString() : 'N/A'
        };

        // Add additional fields if present
        if (hasAdditionalFields && candidate.additionalFields) {
          const additional = candidate.additionalFields;
          rowData.education = additional.education || 'N/A';
          rowData.location = additional.location || 'N/A';
          rowData.currentRole = additional.currentRole || 'N/A';
          rowData.summary = additional.summary || 'N/A';
          rowData.certifications = Array.isArray(additional.certifications) 
            ? additional.certifications.join(', ') 
            : additional.certifications || 'N/A';
          rowData.languages = Array.isArray(additional.languages) 
            ? additional.languages.join(', ') 
            : additional.languages || 'N/A';
        } else if (hasAdditionalFields) {
          // Fill with N/A for candidates without additional fields
          rowData.education = 'N/A';
          rowData.location = 'N/A';
          rowData.currentRole = 'N/A';
          rowData.summary = 'N/A';
          rowData.certifications = 'N/A';
          rowData.languages = 'N/A';
        }

        const row = worksheet.addRow(rowData);

        // Alternate row colors
        if (index % 2 === 1) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'F8F9FA' }
          };
        }

        // Hyperlink for LinkedIn URLs
        if (candidate.linkedinUrl && candidate.linkedinUrl !== 'N/A') {
          const cell = row.getCell('linkedinUrl');
          cell.value = {
            text: candidate.linkedinUrl,
            hyperlink: candidate.linkedinUrl
          };
          cell.font = { color: { argb: '0563C1' }, underline: true };
        }
      });

      // Add statistics worksheet
      await this.addStatisticsWorksheet(workbook, candidates);

      // Add borders to all cells
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });

      // Auto-fit columns (approximate)
      worksheet.columns.forEach(column => {
        if (column.header && column.header.length > column.width) {
          column.width = Math.min(column.header.length + 5, 50);
        }
      });

      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `HR_Resume_Report_${timestamp}_${Date.now()}.xlsx`;
      const filePath = path.join(this.outputDir, filename);

      // Write file
      await workbook.xlsx.writeFile(filePath);

      logger.info(`Excel report generated successfully: ${filename}`);

      return filePath;

    } catch (error) {
      logger.error('Error generating Excel report:', error);
      throw new Error(`Failed to generate Excel report: ${error.message}`);
    }
  }

  async addStatisticsWorksheet(workbook, candidates) {
    const statsWorksheet = workbook.addWorksheet('Statistics');

    // Calculate statistics
    const totalCandidates = candidates.length;
    let totalExperience = 0;
    const skillsCount = {};
    const experienceDistribution = { '0-2': 0, '3-5': 0, '6-10': 0, '10+': 0 };
    let linkedinProfilesCount = 0;

    candidates.forEach(candidate => {
      // Experience calculation
      const exp = parseInt(candidate.experience) || 0;
      totalExperience += exp;

      // Experience distribution
      if (exp <= 2) experienceDistribution['0-2']++;
      else if (exp <= 5) experienceDistribution['3-5']++;
      else if (exp <= 10) experienceDistribution['6-10']++;
      else experienceDistribution['10+']++;

      // LinkedIn profiles
      if (candidate.linkedinUrl && candidate.linkedinUrl !== 'N/A') {
        linkedinProfilesCount++;
      }

      // Skills counting
      const allSkills = [
        ...(candidate.primarySkills || []),
        ...(candidate.secondarySkills || [])
      ];

      allSkills.forEach(skill => {
        skillsCount[skill] = (skillsCount[skill] || 0) + 1;
      });
    });

    const avgExperience = totalCandidates > 0 ? (totalExperience / totalCandidates).toFixed(1) : 0;

    // Add statistics data
    const statsData = [
      ['Metric', 'Value'],
      ['Total Candidates', totalCandidates],
      ['Average Experience', `${avgExperience} years`],
      ['LinkedIn Profiles', `${linkedinProfilesCount} (${((linkedinProfilesCount/totalCandidates)*100).toFixed(1)}%)`],
      [''],
      ['Experience Distribution', ''],
      ['0-2 years', experienceDistribution['0-2']],
      ['3-5 years', experienceDistribution['3-5']],
      ['6-10 years', experienceDistribution['6-10']],
      ['10+ years', experienceDistribution['10+']],
      [''],
      ['Top Skills', 'Count']
    ];

    // Add top skills
    const topSkills = Object.entries(skillsCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);

    topSkills.forEach(([skill, count]) => {
      statsData.push([skill, count]);
    });

    // Set columns
    statsWorksheet.columns = [
      { header: 'Metric', key: 'metric', width: 25 },
      { header: 'Value', key: 'value', width: 20 }
    ];

    // Add data
    statsData.forEach(([metric, value]) => {
      const row = statsWorksheet.addRow({ metric, value });

      // Style headers
      if (metric === 'Metric' || metric === 'Experience Distribution' || metric === 'Top Skills') {
        row.font = { bold: true };
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'E8F4FD' }
        };
      }
    });

    // Add borders
    statsWorksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });
  }
}

module.exports = new ExcelGeneratorService();