const path = require('path');
const fs = require('fs-extra');
const logger = require('./logger');

class FileValidationService {
  constructor() {
    this.allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'message/rfc822',
      'application/octet-stream', // Sometimes EML files have this mime type
      'text/plain'
    ];

    this.allowedExtensions = ['.pdf', '.docx', '.doc', '.eml', '.txt'];

    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.maxTotalSize = 100 * 1024 * 1024; // 100MB for all files
    this.maxFileCount = 20;
  }

  validateFile(file) {
    const errors = [];

    try {
      // Check file existence and basic info
      if (!file) {
        errors.push('File object is missing');
        return { isValid: false, errors };
      }

      if (!file.originalname) {
        errors.push('Filename is missing');
        return { isValid: false, errors };
      }

      // File extension validation
      const fileExtension = path.extname(file.originalname).toLowerCase();
      if (!this.allowedExtensions.includes(fileExtension)) {
        errors.push(`File type '${fileExtension}' is not supported. Allowed types: ${this.allowedExtensions.join(', ')}`);
      }

      // MIME type validation
      if (file.mimetype && !this.allowedMimeTypes.includes(file.mimetype)) {
        logger.warn(`File ${file.originalname} has unexpected MIME type: ${file.mimetype}`);
        // Don't treat this as an error since MIME type detection can be unreliable
      }

      // File size validation
      if (file.size > this.maxFileSize) {
        errors.push(`File size (${this.formatFileSize(file.size)}) exceeds maximum allowed size (${this.formatFileSize(this.maxFileSize)})`);
      }

      if (file.size === 0) {
        errors.push('File is empty');
      }

      // Filename validation
      if (!this.isValidFilename(file.originalname)) {
        errors.push('Filename contains invalid characters');
      }

      return {
        isValid: errors.length === 0,
        errors: errors,
        warnings: [],
        fileInfo: {
          name: file.originalname,
          size: file.size,
          extension: fileExtension,
          mimeType: file.mimetype
        }
      };

    } catch (error) {
      logger.error('Error validating file:', error);
      return {
        isValid: false,
        errors: ['File validation failed due to internal error'],
        fileInfo: null
      };
    }
  }

  validateFileArray(files) {
    const results = {
      isValid: true,
      validFiles: [],
      invalidFiles: [],
      totalSize: 0,
      errors: [],
      warnings: []
    };

    try {
      // Check file count
      if (!files || !Array.isArray(files)) {
        results.isValid = false;
        results.errors.push('No files provided');
        return results;
      }

      if (files.length === 0) {
        results.isValid = false;
        results.errors.push('No files uploaded');
        return results;
      }

      if (files.length > this.maxFileCount) {
        results.isValid = false;
        results.errors.push(`Too many files. Maximum allowed: ${this.maxFileCount}, provided: ${files.length}`);
        return results;
      }

      // Validate each file
      let totalSize = 0;
      const filenames = new Set();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const validation = this.validateFile(file);

        totalSize += file.size || 0;

        // Check for duplicate filenames
        if (filenames.has(file.originalname)) {
          validation.errors.push('Duplicate filename detected');
          validation.isValid = false;
        } else {
          filenames.add(file.originalname);
        }

        if (validation.isValid) {
          results.validFiles.push({
            index: i,
            file: file,
            validation: validation
          });
        } else {
          results.invalidFiles.push({
            index: i,
            file: file,
            validation: validation
          });
        }
      }

      // Check total size
      results.totalSize = totalSize;
      if (totalSize > this.maxTotalSize) {
        results.isValid = false;
        results.errors.push(`Total file size (${this.formatFileSize(totalSize)}) exceeds maximum allowed (${this.formatFileSize(this.maxTotalSize)})`);
      }

      // Overall validation result
      results.isValid = results.invalidFiles.length === 0 && results.errors.length === 0;

      return results;

    } catch (error) {
      logger.error('Error validating file array:', error);
      return {
        isValid: false,
        validFiles: [],
        invalidFiles: [],
        totalSize: 0,
        errors: ['File array validation failed due to internal error'],
        warnings: []
      };
    }
  }

  async validateFileContent(filePath, expectedExtension) {
    try {
      if (!await fs.pathExists(filePath)) {
        return { isValid: false, error: 'File does not exist' };
      }

      const stats = await fs.stat(filePath);

      if (stats.size === 0) {
        return { isValid: false, error: 'File is empty' };
      }

      // Basic content validation based on file type
      const buffer = await fs.readFile(filePath, { encoding: null });

      switch (expectedExtension) {
        case '.pdf':
          return this.validatePDFContent(buffer);
        case '.docx':
          return this.validateDOCXContent(buffer);
        case '.eml':
          return this.validateEMLContent(buffer);
        default:
          return { isValid: true, message: 'Content validation skipped for this file type' };
      }

    } catch (error) {
      logger.error(`Error validating file content for ${filePath}:`, error);
      return { isValid: false, error: `Content validation failed: ${error.message}` };
    }
  }

  validatePDFContent(buffer) {
    // Check PDF magic bytes
    if (buffer.length < 4) {
      return { isValid: false, error: 'File too small to be a valid PDF' };
    }

    const header = buffer.slice(0, 4).toString();
    if (header !== '%PDF') {
      return { isValid: false, error: 'Invalid PDF format - missing PDF header' };
    }

    // Check for PDF trailer
    const content = buffer.toString('binary');
    if (!content.includes('%%EOF')) {
      return { isValid: false, error: 'Invalid PDF format - missing EOF marker' };
    }

    return { isValid: true, message: 'Valid PDF format' };
  }

  validateDOCXContent(buffer) {
    // Check for ZIP magic bytes (DOCX is a ZIP file)
    if (buffer.length < 4) {
      return { isValid: false, error: 'File too small to be a valid DOCX' };
    }

    const header = buffer.slice(0, 4);
    if (header[0] === 0x50 && header[1] === 0x4B && 
        (header[2] === 0x03 || header[2] === 0x05 || header[2] === 0x07) &&
        (header[3] === 0x04 || header[3] === 0x06 || header[3] === 0x08)) {
      return { isValid: true, message: 'Valid DOCX format' };
    }

    return { isValid: false, error: 'Invalid DOCX format - not a ZIP archive' };
  }

  validateEMLContent(buffer) {
    const content = buffer.toString('utf-8', 0, Math.min(1024, buffer.length));

    // Check for common EML headers
    const emlHeaders = ['Message-ID:', 'From:', 'To:', 'Subject:', 'Date:', 'MIME-Version:'];
    const hasEmlHeaders = emlHeaders.some(header => content.includes(header));

    if (!hasEmlHeaders) {
      return { isValid: false, error: 'Invalid EML format - missing required email headers' };
    }

    return { isValid: true, message: 'Valid EML format' };
  }

  isValidFilename(filename) {
    // Check for invalid characters in filename
    const invalidChars = /[<>:"|*?\\/]/;
    if (invalidChars.test(filename)) {
      return false;
    }

    // Check filename length
    if (filename.length > 255) {
      return false;
    }

    // Check for reserved names (Windows)
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
    if (reservedNames.test(filename)) {
      return false;
    }

    return true;
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Sanitize filename for safe storage
  sanitizeFilename(filename) {
    return filename
      .replace(/[<>:"|*?\\/]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 200); // Limit length
  }

  // Get file validation configuration
  getValidationConfig() {
    return {
      allowedMimeTypes: [...this.allowedMimeTypes],
      allowedExtensions: [...this.allowedExtensions],
      maxFileSize: this.maxFileSize,
      maxTotalSize: this.maxTotalSize,
      maxFileCount: this.maxFileCount,
      maxFileSizeFormatted: this.formatFileSize(this.maxFileSize),
      maxTotalSizeFormatted: this.formatFileSize(this.maxTotalSize)
    };
  }
}

module.exports = new FileValidationService();