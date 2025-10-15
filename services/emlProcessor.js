const fs = require('fs-extra');
const path = require('path');
const { simpleParser } = require('mailparser');
const resumeParserService = require('./resumeParser');
const logger = require('../utils/logger');

class EmlProcessorService {
  constructor() {
    this.tempDir = 'temp/extracted';
    this.supportedAttachmentTypes = ['.pdf', '.docx', '.doc'];
  }

  async processEmlFile(emlFilePath, originalName, extractAdditionalFields = false, processSubfolders = true) {
    try {
      logger.info(`Processing EML file: ${originalName}`);

      // Ensure temp directory exists
      await fs.ensureDir(this.tempDir);

      // Read and parse EML file
      const emlContent = await fs.readFile(emlFilePath);
      const parsed = await simpleParser(emlContent);

      const result = {
        emailInfo: {
          subject: parsed.subject,
          from: parsed.from ? parsed.from.text : null,
          to: parsed.to ? parsed.to.text : null,
          date: parsed.date,
          hasAttachments: parsed.attachments && parsed.attachments.length > 0
        },
        attachments: [],
        candidates: [],
        errors: []
      };

      if (!parsed.attachments || parsed.attachments.length === 0) {
        logger.info(`No attachments found in EML file: ${originalName}`);
        return result;
      }

      logger.info(`Found ${parsed.attachments.length} attachments in EML file: ${originalName}`);

      // Process each attachment
      for (let i = 0; i < parsed.attachments.length; i++) {
        const attachment = parsed.attachments[i];

        try {
          const processedAttachment = await this.processAttachment(
            attachment, 
            i, 
            originalName, 
            extractAdditionalFields
          );

          if (processedAttachment) {
            result.attachments.push(processedAttachment.info);
            if (processedAttachment.candidate) {
              result.candidates.push(processedAttachment.candidate);
            }
          }

        } catch (error) {
          logger.error(`Error processing attachment ${i} from ${originalName}:`, error);
          result.errors.push({
            attachmentIndex: i,
            filename: attachment.filename || `attachment_${i}`,
            error: error.message
          });
        }
      }

      logger.info(`EML processing completed: ${originalName} - ${result.attachments.length} attachments, ${result.candidates.length} candidates`);

      return result;

    } catch (error) {
      logger.error(`Error processing EML file ${originalName}:`, error);
      throw new Error(`Failed to process EML file: ${error.message}`);
    }
  }

  async processAttachment(attachment, index, emlFileName, extractAdditionalFields) {
    try {
      const filename = attachment.filename || `attachment_${index}`;
      const fileExtension = path.extname(filename).toLowerCase();

      // Check if attachment is a supported resume format
      if (!this.supportedAttachmentTypes.includes(fileExtension)) {
        logger.info(`Skipping unsupported attachment: ${filename} (${fileExtension})`);
        return {
          info: {
            filename: filename,
            size: attachment.size,
            contentType: attachment.contentType,
            isResume: false,
            processed: false,
            reason: 'Unsupported file type'
          },
          candidate: null
        };
      }

      // Save attachment to temporary file
      const tempFileName = `${Date.now()}_${index}_${filename}`;
      const tempFilePath = path.join(this.tempDir, tempFileName);

      await fs.writeFile(tempFilePath, attachment.content);

      logger.info(`Saved attachment to: ${tempFilePath}`);

      try {
        // Process the attachment as a resume
        const candidateData = await resumeParserService.parseResume(
          tempFilePath, 
          filename, 
          extractAdditionalFields
        );

        // Add EML source information
        candidateData.sourceEml = emlFileName;
        candidateData.attachmentIndex = index;
        candidateData.extractedFromEmail = true;

        return {
          info: {
            filename: filename,
            size: attachment.size,
            contentType: attachment.contentType,
            isResume: true,
            processed: true,
            candidateName: candidateData.name,
            tempFilePath: tempFilePath
          },
          candidate: candidateData
        };

      } catch (parseError) {
        // Clean up temp file if parsing failed
        await fs.remove(tempFilePath).catch(() => {});

        return {
          info: {
            filename: filename,
            size: attachment.size,
            contentType: attachment.contentType,
            isResume: true,
            processed: false,
            reason: `Resume parsing failed: ${parseError.message}`
          },
          candidate: null
        };
      }

    } catch (error) {
      logger.error(`Error processing attachment ${index}:`, error);
      throw error;
    }
  }

  async processEmlFolder(folderPath, extractAdditionalFields = false, processSubfolders = true) {
    try {
      logger.info(`Processing EML folder: ${folderPath}`);

      const results = {
        processedFiles: 0,
        totalAttachments: 0,
        totalCandidates: 0,
        files: [],
        errors: []
      };

      // Get all EML files
      const emlFiles = await this.findEmlFiles(folderPath, processSubfolders);

      logger.info(`Found ${emlFiles.length} EML files to process`);

      // Process each EML file
      for (const emlFile of emlFiles) {
        try {
          const result = await this.processEmlFile(
            emlFile.path, 
            emlFile.name, 
            extractAdditionalFields
          );

          results.processedFiles++;
          results.totalAttachments += result.attachments.length;
          results.totalCandidates += result.candidates.length;

          results.files.push({
            filename: emlFile.name,
            relativePath: path.relative(folderPath, emlFile.path),
            attachmentsFound: result.attachments.length,
            candidatesProcessed: result.candidates.length,
            emailInfo: result.emailInfo,
            status: 'success'
          });

        } catch (error) {
          logger.error(`Error processing EML file ${emlFile.name}:`, error);

          results.errors.push({
            filename: emlFile.name,
            relativePath: path.relative(folderPath, emlFile.path),
            error: error.message,
            status: 'failed'
          });
        }
      }

      logger.info(`EML folder processing completed: ${results.processedFiles} files, ${results.totalCandidates} candidates`);

      return results;

    } catch (error) {
      logger.error(`Error processing EML folder ${folderPath}:`, error);
      throw error;
    }
  }

  async findEmlFiles(folderPath, recursive = true) {
    const emlFiles = [];

    const processDirectory = async (dirPath) => {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory() && recursive) {
          await processDirectory(fullPath);
        } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.eml') {
          emlFiles.push({
            name: entry.name,
            path: fullPath
          });
        }
      }
    };

    await processDirectory(folderPath);

    return emlFiles;
  }

  async cleanupTempFiles() {
    try {
      await fs.emptyDir(this.tempDir);
      logger.info('EML temporary files cleaned up');
    } catch (error) {
      logger.error('Error cleaning up EML temp files:', error);
      throw error;
    }
  }

  // Get statistics about processed EML files
  getProcessingStats() {
    // This would typically be stored in a database
    // For now, return basic stats
    return {
      tempDirectoryExists: fs.pathExistsSync(this.tempDir),
      supportedTypes: this.supportedAttachmentTypes,
      lastCleanup: new Date().toISOString()
    };
  }

  // Validate EML file before processing
  async validateEmlFile(filePath) {
    try {
      const stats = await fs.stat(filePath);

      if (stats.size === 0) {
        throw new Error('EML file is empty');
      }

      if (stats.size > 100 * 1024 * 1024) { // 100MB limit
        throw new Error('EML file too large (max 100MB)');
      }

      // Try to parse header to validate format
      const content = await fs.readFile(filePath, 'utf-8');

      if (!content.includes('MIME-Version:') && !content.includes('Message-ID:')) {
        throw new Error('File does not appear to be a valid EML format');
      }

      return true;

    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('EML file not found');
      }
      throw error;
    }
  }
}

module.exports = new EmlProcessorService();