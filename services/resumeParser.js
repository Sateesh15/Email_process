const fs = require('fs-extra');
const path = require('path');
const pdfParse = require('pdf-parse');
const docx = require('docx');
const textract = require('textract');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const textExtractor = require('../utils/textExtractor');

// In-memory storage for candidates (in production, use a database)
let candidatesStorage = [];

class ResumeParserService {
  constructor() {
    this.supportedFormats = ['.pdf', '.docx', '.doc', '.txt'];
  }

  async parseResume(filePath, originalName, extractAdditionalFields = false) {
    try {
      logger.info(`Parsing resume: ${originalName}`);

      const fileExtension = path.extname(originalName).toLowerCase();

      if (!this.supportedFormats.includes(fileExtension)) {
        throw new Error(`Unsupported file format: ${fileExtension}`);
      }

      // Extract text from file
      let extractedText = '';

      switch (fileExtension) {
        case '.pdf':
          extractedText = await this.extractTextFromPDF(filePath);
          break;
        case '.docx':
        case '.doc':
          extractedText = await this.extractTextFromDOCX(filePath);
          break;
        case '.txt':
          extractedText = await fs.readFile(filePath, 'utf-8');
          break;
        default:
          throw new Error(`Unsupported file type: ${fileExtension}`);
      }

      if (!extractedText.trim()) {
        throw new Error('No text content found in the resume');
      }

      // Parse candidate information
      const candidateData = this.extractCandidateInfo(extractedText, extractAdditionalFields);

      // Add metadata
      candidateData.id = uuidv4();
      candidateData.filePath = filePath;
      candidateData.originalFileName = originalName;
      candidateData.processedAt = new Date().toISOString();
      candidateData.fileSize = (await fs.stat(filePath)).size;

      // Store in memory
      candidatesStorage.push(candidateData);

      logger.info(`Successfully parsed resume for: ${candidateData.name || 'Unknown'}`);

      return candidateData;

    } catch (error) {
      logger.error(`Error parsing resume ${originalName}:`, error);
      throw new Error(`Failed to parse resume: ${error.message}`);
    }
  }

  async extractTextFromPDF(filePath) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } catch (error) {
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  async extractTextFromDOCX(filePath) {
    return new Promise((resolve, reject) => {
      textract.fromFileWithPath(filePath, (error, text) => {
        if (error) {
          reject(new Error(`DOCX extraction failed: ${error.message}`));
        } else {
          resolve(text || '');
        }
      });
    });
  }

  extractCandidateInfo(text, extractAdditionalFields = false) {
    const candidateInfo = {
      name: this.extractName(text),
      email: this.extractEmail(text),
      phone: this.extractPhone(text),
      experience: this.extractExperience(text),
      linkedinUrl: this.extractLinkedIn(text),
      primarySkills: this.extractPrimarySkills(text),
      secondarySkills: this.extractSecondarySkills(text)
    };

    if (extractAdditionalFields) {
      candidateInfo.additionalFields = this.extractAdditionalFields(text);
    }

    return candidateInfo;
  }

  extractName(text) {
    // Look for patterns that typically indicate names
    const namePatterns = [
      /^([A-Z][a-z]+ [A-Z][a-z]+)/m,
      /Name[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/i,
      /^([A-Z][A-Z\s]+)$/m
    ];

    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match) {
        return this.cleanName(match[1]);
      }
    }

    // Fallback: look for the first line with title case words
    const lines = text.split('\n');
    for (const line of lines.slice(0, 5)) {
      const trimmed = line.trim();
      if (trimmed.length > 3 && trimmed.length < 50 && /^[A-Z][a-z]+ [A-Z][a-z]+/.test(trimmed)) {
        return this.cleanName(trimmed);
      }
    }

    return 'Name Not Found';
  }

  cleanName(name) {
    return name.replace(/[^a-zA-Z\s]/g, '').trim().replace(/\s+/g, ' ');
  }

  extractEmail(text) {
    const emailPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
    const matches = text.match(emailPattern);
    return matches ? matches[0].toLowerCase() : null;
  }

  extractPhone(text) {
    const phonePatterns = [
      /(\+?1[-.\s]?)?(\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/g,
      /(\+[1-9]{1}[0-9]{0,3}[-.\s]?[0-9]{4,14})/g,
      /(phone|mobile|cell|tel)[:\s]*([0-9\-\.\s\(\)\+]+)/gi
    ];

    for (const pattern of phonePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        return this.cleanPhone(matches[0]);
      }
    }

    return null;
  }

  cleanPhone(phone) {
    return phone.replace(/[^\d\+\-\(\)\s]/gi, '').trim();
  }

  extractExperience(text) {
    const experiencePatterns = [
      /(\d+)[\s\+]*years?[\s]*(?:of\s+)?experience/gi,
      /experience[:\s]*(\d+)[\s\+]*years?/gi,
      /(\d+)[\s\+]*yrs?[\s]*(?:of\s+)?exp/gi,
      /total[\s]*experience[:\s]*(\d+)/gi
    ];

    for (const pattern of experiencePatterns) {
      const match = text.match(pattern);
      if (match) {
        return `${match[1]} years`;
      }
    }

    // Try to infer from work history
    const workSections = text.match(/(?:experience|employment|work\s+history)[\s\S]*?(?=education|skills|$)/gi);
    if (workSections) {
      const dates = workSections[0].match(/(\d{4})/g);
      if (dates && dates.length >= 2) {
        const years = Math.abs(parseInt(dates[dates.length - 1]) - parseInt(dates[0]));
        return `${years} years`;
      }
    }

    return 'Not specified';
  }

  extractLinkedIn(text) {
    const linkedinPatterns = [
      /(https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-]+\/?/gi,
      /linkedin[:\s]*([a-zA-Z0-9\-\/\.]+)/gi
    ];

    for (const pattern of linkedinPatterns) {
      const match = text.match(pattern);
      if (match) {
        let url = match[0];
        if (!url.startsWith('http')) {
          url = 'https://linkedin.com/in/' + url.split('/').pop();
        }
        return url;
      }
    }

    return null;
  }

  extractPrimarySkills(text) {
    const primarySkillKeywords = [
      // Programming languages
      'JavaScript', 'Python', 'Java', 'C++', 'C#', 'PHP', 'Ruby', 'Go', 'Rust', 'TypeScript',
      'Swift', 'Kotlin', 'Scala', 'R', 'MATLAB', 'SQL',

      // Web technologies
      'React', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 'Flask', 'Spring',
      'ASP.NET', 'Laravel', 'Rails', 'HTML', 'CSS', 'Bootstrap', 'Tailwind',

      // Databases
      'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Cassandra', 'Oracle', 'SQLServer',

      // Cloud/DevOps
      'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'Terraform'
    ];

    return this.findSkillsInText(text, primarySkillKeywords).slice(0, 5);
  }

  extractSecondarySkills(text) {
    const secondarySkillKeywords = [
      // Tools and frameworks
      'Git', 'GitHub', 'GitLab', 'JIRA', 'Confluence', 'Slack', 'Trello',
      'Photoshop', 'Illustrator', 'Figma', 'Sketch', 'InVision',

      // Methodologies
      'Agile', 'Scrum', 'Kanban', 'DevOps', 'CI/CD', 'TDD', 'BDD',

      // Data Science
      'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Scikit-learn', 'Tableau',

      // Mobile
      'iOS', 'Android', 'React Native', 'Flutter', 'Xamarin'
    ];

    return this.findSkillsInText(text, secondarySkillKeywords).slice(0, 5);
  }

  findSkillsInText(text, skillKeywords) {
    const foundSkills = [];
    const textLower = text.toLowerCase();

    for (const skill of skillKeywords) {
      if (textLower.includes(skill.toLowerCase())) {
        foundSkills.push(skill);
      }
    }

    return foundSkills;
  }

  extractAdditionalFields(text) {
    return {
      education: this.extractEducation(text),
      location: this.extractLocation(text),
      currentRole: this.extractCurrentRole(text),
      summary: this.extractSummary(text),
      certifications: this.extractCertifications(text),
      languages: this.extractLanguages(text)
    };
  }

  extractEducation(text) {
    const educationPatterns = [
      /(?:bachelor|master|phd|doctorate|degree)[:\s]*([^\n]+)/gi,
      /(?:education|academic)[:\s]*([^\n]+)/gi,
      /(?:university|college|institute)[:\s]*([^\n]+)/gi
    ];

    for (const pattern of educationPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim().substring(0, 100);
      }
    }

    return null;
  }

  extractLocation(text) {
    const locationPatterns = [
      /(?:location|address|based in)[:\s]*([^\n]+)/gi,
      /([A-Z][a-z]+,\s*[A-Z]{2})/g,
      /([A-Z][a-z]+\s*[A-Z][a-z]*,\s*[A-Z][a-z]+)/g
    ];

    for (const pattern of locationPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  extractCurrentRole(text) {
    const rolePatterns = [
      /(?:current|present)[:\s]*([^\n]+)/gi,
      /^([A-Z][a-z\s]+(?:Engineer|Developer|Manager|Analyst|Designer|Specialist|Lead|Director|VP))/m
    ];

    for (const pattern of rolePatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim().substring(0, 50);
      }
    }

    return null;
  }

  extractSummary(text) {
    const summaryPatterns = [
      /(?:summary|objective|profile)[:\s]*([^\n]*(?:\n[^\n]*){0,3})/gi,
      /^([A-Z][^.!?]*[.!?])/m
    ];

    for (const pattern of summaryPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim().substring(0, 200);
      }
    }

    return null;
  }

  extractCertifications(text) {
    const certificationKeywords = [
      'AWS Certified', 'Google Cloud', 'Microsoft Certified', 'Cisco',
      'PMP', 'CISSP', 'CISM', 'CEH', 'OSCP', 'CompTIA'
    ];

    return this.findSkillsInText(text, certificationKeywords);
  }

  extractLanguages(text) {
    const languageKeywords = [
      'English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese',
      'Korean', 'Italian', 'Portuguese', 'Russian', 'Arabic', 'Hindi'
    ];

    return this.findSkillsInText(text, languageKeywords);
  }

  // Getter methods
  getAllCandidates() {
    return [...candidatesStorage];
  }

  getCandidateById(id) {
    return candidatesStorage.find(candidate => candidate.id === id);
  }

  async clearAllCandidates() {
    const count = candidatesStorage.length;

    // Clean up uploaded files
    for (const candidate of candidatesStorage) {
      if (candidate.filePath) {
        await fs.remove(candidate.filePath).catch(() => {});
      }
    }

    candidatesStorage = [];

    logger.info(`Cleared ${count} candidate records and associated files`);

    return count;
  }

  // Utility methods
  getCandidatesCount() {
    return candidatesStorage.length;
  }

  getCandidatesBySkill(skill) {
    return candidatesStorage.filter(candidate => 
      candidate.primarySkills.includes(skill) || 
      candidate.secondarySkills.includes(skill)
    );
  }

  getCandidatesByExperience(minYears, maxYears) {
    return candidatesStorage.filter(candidate => {
      const exp = parseInt(candidate.experience) || 0;
      return exp >= minYears && exp <= maxYears;
    });
  }
}

module.exports = new ResumeParserService();