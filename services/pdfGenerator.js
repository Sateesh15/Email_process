const PDFDocument = require('pdfkit');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

class PDFGeneratorService {
    constructor() {
        this.outputDir = 'outputs';
    }

    async generateCandidatePDF(candidate) {
        try {
            logger.info(`Generating comprehensive PDF summary for: ${candidate.name}`);

            // Ensure output directory exists
            await fs.ensureDir(this.outputDir);

            // Create PDF document with better formatting
            const doc = new PDFDocument({
                size: 'A4',
                margin: 40,
                info: {
                    Title: `${candidate.name} - Comprehensive Resume Summary`,
                    Author: 'HR Resume Processor',
                    Subject: 'Candidate Resume Summary',
                    Creator: 'HR Resume Processing System',
                    Keywords: 'Resume, HR, Candidate, Summary'
                }
            });

            // Generate filename
            const sanitizedName = candidate.name.replace(/[^a-zA-Z0-9]/g, '_');
            const filename = `${sanitizedName}_Comprehensive_Summary_${Date.now()}.pdf`;
            const filePath = path.join(this.outputDir, filename);

            // Create write stream
            const stream = fs.createWriteStream(filePath);
            doc.pipe(stream);

            // Add comprehensive content to PDF
            this.addProfessionalHeader(doc, candidate);
            this.addPersonalInformation(doc, candidate);
            this.addProfessionalSummary(doc, candidate);
            this.addExperienceSection(doc, candidate);
            this.addSkillsSection(doc, candidate);
            this.addEducationSection(doc, candidate);

            if (candidate.additionalFields) {
                this.addAdditionalSections(doc, candidate.additionalFields);
            }

            this.addProcessingInformation(doc, candidate);
            this.addProfessionalFooter(doc, candidate);

            // Finalize PDF
            doc.end();

            // Wait for file to be written
            await new Promise((resolve, reject) => {
                stream.on('finish', resolve);
                stream.on('error', reject);
            });

            logger.info(`Comprehensive PDF summary generated: ${filename}`);
            return filePath;

        } catch (error) {
            logger.error(`Error generating PDF for ${candidate.name}:`, error);
            throw new Error(`Failed to generate PDF summary: ${error.message}`);
        }
    }

    addProfessionalHeader(doc, candidate) {
        const pageWidth = doc.page.width;

        // Professional header with gradient-like effect
        doc.rect(0, 0, pageWidth, 120)
           .fill('#2C3E50');

        // Candidate name - large and prominent
        doc.fillColor('white')
           .fontSize(28)
           .font('Helvetica-Bold')
           .text(candidate.name.toUpperCase(), 40, 25);

        // Professional title/role if available
        if (candidate.additionalFields?.currentRole) {
            doc.fontSize(16)
               .font('Helvetica')
               .text(candidate.additionalFields.currentRole, 40, 60);
        }

        // Contact info in header
        const contactY = 85;
        const contactItems = [];

        if (candidate.email) contactItems.push(`📧 ${candidate.email}`);
        if (candidate.phone) contactItems.push(`📞 ${candidate.phone}`);
        if (candidate.additionalFields?.location) contactItems.push(`📍 ${candidate.additionalFields.location}`);

        if (contactItems.length > 0) {
            doc.fontSize(11)
               .text(contactItems.join('  |  '), 40, contactY);
        }

        // Reset for body content
        doc.fillColor('black');
        doc.y = 140;
    }

    addPersonalInformation(doc, candidate) {
        this.addSectionHeader(doc, '👤 PERSONAL INFORMATION');

        const infoItems = [
            { label: 'Full Name', value: candidate.name },
            { label: 'Email Address', value: candidate.email },
            { label: 'Phone Number', value: candidate.phone },
            { label: 'Professional Experience', value: candidate.experience },
            { label: 'Current Location', value: candidate.additionalFields?.location },
            { label: 'LinkedIn Profile', value: candidate.linkedinUrl, isLink: true }
        ];

        let yPos = doc.y;
        const leftColumn = 50;
        const rightColumn = 300;
        const rowHeight = 20;

        infoItems.forEach((item, index) => {
            if (item.value) {
                const x = index % 2 === 0 ? leftColumn : rightColumn;
                const y = yPos + Math.floor(index / 2) * rowHeight;

                this.addFormattedInfoRow(doc, item.label, item.value, x, y, item.isLink);
            }
        });

        doc.y = yPos + Math.ceil(infoItems.length / 2) * rowHeight + 20;
    }

    addProfessionalSummary(doc, candidate) {
        if (candidate.additionalFields?.summary) {
            this.addSectionHeader(doc, '📋 PROFESSIONAL SUMMARY');

            doc.fontSize(11)
               .font('Helvetica')
               .text(candidate.additionalFields.summary, 50, doc.y, {
                   width: 500,
                   align: 'justify',
                   lineGap: 3
               });

            doc.y += 25;
        }
    }

    addExperienceSection(doc, candidate) {
        this.addSectionHeader(doc, '💼 PROFESSIONAL EXPERIENCE');

        // Experience summary
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .text('Total Experience:', 50, doc.y);

        doc.font('Helvetica')
           .text(candidate.experience || 'Not specified', 150, doc.y);

        doc.y += 20;

        // Work history if available in additional fields
        if (candidate.additionalFields?.companies) {
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .text('Companies:', 50, doc.y);

            doc.fontSize(11)
               .font('Helvetica')
               .text(candidate.additionalFields.companies, 50, doc.y + 15, {
                   width: 500,
                   lineGap: 3
               });

            doc.y += 35;
        }

        // Projects if available
        if (candidate.additionalFields?.projects) {
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .text('Notable Projects:', 50, doc.y);

            doc.fontSize(11)
               .font('Helvetica')
               .text(candidate.additionalFields.projects, 50, doc.y + 15, {
                   width: 500,
                   lineGap: 3
               });

            doc.y += 35;
        }
    }

    addSkillsSection(doc, candidate) {
        this.addSectionHeader(doc, '🛠️ TECHNICAL SKILLS & EXPERTISE');

        // Primary Skills
        if (candidate.primarySkills && candidate.primarySkills.length > 0) {
            this.addSkillCategory(doc, 'Primary Technical Skills', candidate.primarySkills, '#E74C3C');
        }

        // Secondary Skills
        if (candidate.secondarySkills && candidate.secondarySkills.length > 0) {
            this.addSkillCategory(doc, 'Secondary Skills & Tools', candidate.secondarySkills, '#3498DB');
        }

        doc.y += 10;
    }

    addSkillCategory(doc, categoryName, skills, color) {
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#2C3E50')
           .text(categoryName, 50, doc.y);

        doc.y += 15;

        // Create skill boxes
        let currentX = 50;
        let currentY = doc.y;
        const skillBoxWidth = 80;
        const skillBoxHeight = 25;
        const margin = 8;
        const maxWidth = 500;

        skills.forEach((skill, index) => {
            // Check if we need to wrap to next line
            if (currentX + skillBoxWidth > 50 + maxWidth) {
                currentX = 50;
                currentY += skillBoxHeight + margin;
            }

            // Draw skill box
            doc.rect(currentX, currentY, skillBoxWidth, skillBoxHeight)
               .fill(color)
               .stroke();

            // Add skill text
            doc.fillColor('white')
               .fontSize(9)
               .font('Helvetica-Bold')
               .text(skill, currentX + 5, currentY + 8, {
                   width: skillBoxWidth - 10,
                   align: 'center'
               });

            currentX += skillBoxWidth + margin;
        });

        doc.fillColor('black');
        doc.y = currentY + skillBoxHeight + 20;
    }

    addEducationSection(doc, candidate) {
        if (candidate.additionalFields?.education) {
            this.addSectionHeader(doc, '🎓 EDUCATION');

            doc.fontSize(11)
               .font('Helvetica')
               .text(candidate.additionalFields.education, 50, doc.y, {
                   width: 500,
                   lineGap: 3
               });

            doc.y += 30;
        }
    }

    addAdditionalSections(doc, additionalFields) {
        // Certifications
        if (additionalFields.certifications && additionalFields.certifications.length > 0) {
            this.addSectionHeader(doc, '🏆 CERTIFICATIONS');

            const certText = Array.isArray(additionalFields.certifications) 
                ? additionalFields.certifications.join(' • ') 
                : additionalFields.certifications;

            doc.fontSize(11)
               .font('Helvetica')
               .text(certText, 50, doc.y, {
                   width: 500,
                   lineGap: 3
               });

            doc.y += 25;
        }

        // Languages
        if (additionalFields.languages && additionalFields.languages.length > 0) {
            this.addSectionHeader(doc, '🌐 LANGUAGES');

            const langText = Array.isArray(additionalFields.languages) 
                ? additionalFields.languages.join(' • ') 
                : additionalFields.languages;

            doc.fontSize(11)
               .font('Helvetica')
               .text(langText, 50, doc.y, {
                   width: 500,
                   lineGap: 3
               });

            doc.y += 25;
        }
    }

    addProcessingInformation(doc, candidate) {
        this.addSectionHeader(doc, '📊 PROCESSING INFORMATION');

        const processingInfo = [
            { label: 'Original File', value: candidate.originalFileName },
            { label: 'File Size', value: candidate.fileSize ? `${(candidate.fileSize / 1024).toFixed(1)} KB` : 'Unknown' },
            { label: 'Processed Date', value: new Date(candidate.processedAt).toLocaleString() },
            { label: 'Candidate ID', value: candidate.id },
            { label: 'Processing System', value: 'HR Resume Processor v2.0' }
        ];

        processingInfo.forEach(info => {
            if (info.value) {
                this.addFormattedInfoRow(doc, info.label, info.value, 50, doc.y);
                doc.y += 18;
            }
        });

        doc.y += 10;
    }

    addProfessionalFooter(doc, candidate) {
        const pageHeight = doc.page.height;
        const footerY = pageHeight - 60;

        // Footer line
        doc.moveTo(50, footerY)
           .lineTo(doc.page.width - 50, footerY)
           .stroke('#BDC3C7');

        // Footer content
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#7F8C8D')
           .text('HR Resume Processing System', 50, footerY + 10);

        doc.text(`Generated: ${new Date().toLocaleString()}`, 50, footerY + 25);

        doc.text('Confidential Document', doc.page.width - 150, footerY + 10);
        doc.text('Page 1 of 1', doc.page.width - 100, footerY + 25);
    }

    addSectionHeader(doc, title) {
        // Check if we need a new page
        if (doc.y > doc.page.height - 150) {
            doc.addPage();
            doc.y = 50;
        }

        // Section spacing
        doc.y += 15;

        // Section header background
        doc.rect(40, doc.y - 5, doc.page.width - 80, 30)
           .fill('#ECF0F1');

        // Section title
        doc.fillColor('#2C3E50')
           .fontSize(14)
           .font('Helvetica-Bold')
           .text(title, 50, doc.y + 5);

        // Reset
        doc.fillColor('black');
        doc.y += 40;
    }

    addFormattedInfoRow(doc, label, value, x, y, isLink = false) {
        const labelWidth = 120;

        // Label
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('#34495E')
           .text(`${label}:`, x, y);

        // Value
        if (isLink && value.startsWith('http')) {
            doc.font('Helvetica')
               .fillColor('#3498DB')
               .text('View Profile', x + labelWidth, y, {
                   link: value,
                   underline: true,
                   width: 200
               });
        } else {
            doc.font('Helvetica')
               .fillColor('#2C3E50')
               .text(value || 'Not provided', x + labelWidth, y, {
                   width: 200,
                   ellipsis: true
               });
        }

        doc.fillColor('black');
    }

    // Enhanced batch PDF generation with progress tracking
    async generateBatchPDFs(candidates, progressCallback) {
        const results = [];
        const errors = [];
        const total = candidates.length;

        for (let i = 0; i < total; i++) {
            const candidate = candidates[i];
            try {
                const pdfPath = await this.generateCandidatePDF(candidate);
                results.push({
                    candidateId: candidate.id,
                    candidateName: candidate.name,
                    pdfPath: pdfPath,
                    status: 'success'
                });

                if (progressCallback) {
                    progressCallback({
                        current: i + 1,
                        total: total,
                        percentage: Math.round(((i + 1) / total) * 100),
                        candidate: candidate.name
                    });
                }

            } catch (error) {
                errors.push({
                    candidateId: candidate.id,
                    candidateName: candidate.name,
                    error: error.message,
                    status: 'failed'
                });
            }
        }

        return { results, errors, total, successful: results.length, failed: errors.length };
    }

    // Get PDF statistics
    async getPDFStatistics() {
        try {
            const files = await fs.readdir(this.outputDir);
            const pdfFiles = files.filter(file => file.endsWith('.pdf'));

            let totalSize = 0;
            const fileStats = [];

            for (const file of pdfFiles) {
                const filePath = path.join(this.outputDir, file);
                const stats = await fs.stat(filePath);
                totalSize += stats.size;
                fileStats.push({
                    name: file,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime
                });
            }

            return {
                totalFiles: pdfFiles.length,
                totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
                averageSizeKB: pdfFiles.length > 0 ? ((totalSize / pdfFiles.length) / 1024).toFixed(1) : 0,
                oldestFile: fileStats.length > 0 ? fileStats.reduce((oldest, file) => 
                    file.created < oldest.created ? file : oldest) : null,
                newestFile: fileStats.length > 0 ? fileStats.reduce((newest, file) => 
                    file.created > newest.created ? file : newest) : null
            };
        } catch (error) {
            logger.error('Error getting PDF statistics:', error);
            return null;
        }
    }

    // Enhanced cleanup with detailed reporting
    async cleanupOldPDFs(daysOld = 7) {
        try {
            const files = await fs.readdir(this.outputDir);
            const now = Date.now();
            const maxAge = daysOld * 24 * 60 * 60 * 1000;

            let deletedCount = 0;
            let deletedSize = 0;
            const deletedFiles = [];

            for (const file of files) {
                if (file.endsWith('.pdf')) {
                    const filePath = path.join(this.outputDir, file);
                    const stats = await fs.stat(filePath);

                    if (now - stats.mtime.getTime() > maxAge) {
                        deletedSize += stats.size;
                        deletedFiles.push({
                            name: file,
                            size: stats.size,
                            age: Math.floor((now - stats.mtime.getTime()) / (24 * 60 * 60 * 1000))
                        });

                        await fs.remove(filePath);
                        deletedCount++;
                    }
                }
            }

            const result = {
                deletedCount,
                deletedSizeMB: (deletedSize / (1024 * 1024)).toFixed(2),
                deletedFiles: deletedFiles.map(f => ({ name: f.name, ageDays: f.age }))
            };

            logger.info(`Cleanup complete: ${deletedCount} files, ${result.deletedSizeMB} MB freed`);
            return result;

        } catch (error) {
            logger.error('Error cleaning up old PDFs:', error);
            throw error;
        }
    }
}

module.exports = new PDFGeneratorService();