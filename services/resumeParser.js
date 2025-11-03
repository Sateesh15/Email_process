// ✅ FIXED resumeParser.js - WITH AI INTEGRATION
// Copy this entire file to replace your src/services/resumeParser.js

const fs = require('fs-extra');
const path = require('path');
const pdfParse = require('pdf-parse');
const docx = require('docx');
const textract = require('textract');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// ✅ CORRECT IMPORT - Uses services folder aiResumeExtractor
const aiExtractor = require('./aiResumeExtractor');

let candidatesStorage = [];

class ResumeParserService {
  constructor() {
    this.supportedFormats = ['.pdf', '.docx', '.doc', '.txt'];
  }

  // ✅ MAKE IT ASYNC - This is the key fix!
  async parseResume(filePath, originalName, extractAdditionalFields = false) {
    try {
      logger.info(`Parsing resume: ${originalName}`);
      
      const fileExtension = path.extname(originalName).toLowerCase();
      if (!this.supportedFormats.includes(fileExtension)) {
        throw new Error(`Unsupported file format: ${fileExtension}`);
      }

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

      logger.info(`Extracted text preview: ${extractedText.substring(0, 100)}...`);

      // ✅ KEY FIX: Call AI extraction with await!
      const candidateData = await this.extractCandidateInfoWithAI(extractedText, extractAdditionalFields);

      candidateData.id = uuidv4();
      candidateData.filePath = filePath;
      candidateData.originalFileName = originalName;
      candidateData.processedAt = new Date().toISOString();
      candidateData.fileSize = (await fs.stat(filePath)).size;
      candidateData.rawText = extractedText;

      candidatesStorage.push(candidateData);

      logger.info(`Successfully parsed resume for: ${candidateData.name || 'Unknown'}`);
      return candidateData;

    } catch (error) {
      logger.error(`Error parsing resume ${originalName}:`, error);
      throw new Error(`Failed to parse resume: ${error.message}`);
    }
  }

  // ✅ NEW ASYNC METHOD - Calls AI with fallback to regex
  async extractCandidateInfoWithAI(text, extractAdditionalFields = false) {
    try {
      logger.info('🤖 Attempting AI extraction with OpenAI GPT-4...');
      const aiResult = await aiExtractor.extractWithAI(text, extractAdditionalFields);
      logger.info('✅ AI extraction successful!');
      return aiResult;
    } catch (error) {
      logger.warn('⚠️ AI extraction failed, falling back to regex:', error.message);
      // Fallback to regex-based extraction
      return this.extractCandidateInfo(text, extractAdditionalFields);
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

  // Original regex-based extraction (fallback only)
  extractCandidateInfo(text, extractAdditionalFields = false) {
    const cleanText = this.normalizeText(text);

    const candidateInfo = {
      name: this.extractNameEnhanced(cleanText),
      email: this.extractEmail(cleanText),
      phone: this.extractPhone(cleanText),
      experience: this.extractExperienceEnhanced(cleanText),
      linkedinUrl: this.extractLinkedIn(cleanText),
      primarySkills: this.extractPrimarySkills(cleanText),
      secondarySkills: this.extractSecondarySkills(cleanText)
    };

    if (extractAdditionalFields) {
      candidateInfo.additionalFields = this.extractAdditionalFields(cleanText);
    }

    return candidateInfo;
  }

  normalizeText(text) {
    const lines = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(line => line.length > 0);

    return lines.join('\n');
  }

  extractNameEnhanced(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const headerBlacklist = ['profile','summary','objective','career objective','contact','education','experience','skills'];

    for (let i = 0; i < Math.min(lines.length, 3); i++) {
      const line = lines[i].trim();
      
      if (/^[A-Z][A-Z\s]{8,50}$/.test(line) && 
          line.split(' ').length >= 2 && 
          line.split(' ').length <= 5) {
        const cleanedName = line.replace(/[^A-Z\s]/g, '').trim();
        if (cleanedName.length > 5 && !this.isCompanyOrInstitution(cleanedName)) {
          return this.formatName(cleanedName);
        }
      }
    }

    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const line = lines[i].trim();
      
      if (/^[A-Z][a-z]+ [A-Z][a-z]+(?: [A-Z][a-z]+)*$/.test(line) && 
          line.length >= 5 && line.length <= 40 && 
          !this.isCompanyOrInstitution(line)) {
        return this.formatName(line);
      }
    }

    return 'Name Not Found';
  }

  isJobTitle(text) {
    if (!text || typeof text !== 'string') return false;
    const titleKeywords = ['engineer','developer','manager','analyst','consultant','intern','trainee','test','tester'];
    const lower = text.toLowerCase();
    return titleKeywords.some(k => new RegExp(`\\b${k}\\b`, 'i').test(lower));
  }

  isCompanyOrInstitution(text) {
    const institutionKeywords = ['institute', 'university', 'college', 'school', 'academy', 'center', 'technology', 'solutions'];
    const lowerText = text.toLowerCase();
    return institutionKeywords.some(keyword => lowerText.includes(keyword));
  }

  isValidName(text) {
    const words = text.trim().split(/\s+/);
    if (words.length < 2 || words.length > 4) return false;
    const longWords = words.filter(w => w.length >= 2 && /^[A-Za-z]+$/.test(w));
    const shortLetterWords = words.filter(w => w.length === 1 && /^[A-Za-z]$/.test(w));
    if (!words.every(w => /^[A-Za-z]+$/.test(w))) return false;
    return (longWords.length === words.length) || (longWords.length === words.length - 1 && shortLetterWords.length === 1);
  }

  formatName(name) {
    return name
      .replace(/[^a-zA-Z\s]/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  extractExperienceEnhanced(text) {
    const experiencePatterns = [
      /(\d+(?:\.\d+)?)\s*years?\s*of\s*work\s*experience/gi,
      /(\d+(?:\.\d+)?)\s*years?\s*of\s*experience/gi,
      /experience[:\s]+(\d+(?:\.\d+)?)\s*years?/gi,
      /over\s+(\d+(?:\.\d+)?)\s*years?/gi,
      /possessing\s+over\s+(\d+(?:\.\d+)?)\s*years?/gi,
    ];

    for (const pattern of experiencePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const years = parseFloat(match[1]);
        if (!isNaN(years) && years > 0 && years < 50) {
          return `${years} years`;
        }
      }
    }

    return 'Not specified';
  }

  extractEmail(text) {
    const emailPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
    const matches = text.match(emailPattern);
    return matches ? matches[0].toLowerCase() : null;
  }

  extractPhone(text) {
    const phonePatterns = [
      /\+91[\s-]?[6-9][0-9]{9}/g,
      /(\+?1[-.\\s]?)?(\(?[0-9]{3}\)?[-.\\s]?[0-9]{3}[-.\\s]?[0-9]{4})/g,
      /(\+[1-9]{1}[0-9]{0,3}[-.\\s]?[0-9]{4,14})/g,
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

  extractLinkedIn(text) {
    const linkedinPatterns = [
      /(https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-]+\/?/gi,
      /linkedin\.com\/in\/([a-zA-Z0-9\-]+)/gi
    ];

    for (const pattern of linkedinPatterns) {
      const match = text.match(pattern);
      if (match) {
        let url = match[0];
        if (!url.startsWith('http')) {
          const username = url.split('/').pop() || url.replace(/linkedin[:\s]*/, '');
          if (username && username.length > 3) {
            url = `https://linkedin.com/in/${username}`;
          } else {
            continue;
          }
        }
        return url;
      }
    }

    return null;
  }

  extractPrimarySkills(text) {
    const primarySkillKeywords = [
      'JavaScript', 'Python', 'Java', 'C++', 'C#', 'PHP', 'Ruby', 'Rust', 'TypeScript',
      'Swift', 'Kotlin', 'Scala', 'MATLAB', 'SQL', 'Dart', 'Objective-C',
      'React', 'Angular', 'Vue.js', 'Vue', 'Node.js', 'Express', 'Django', 'Flask', 'Spring',
      'ASP.NET', 'Laravel', 'Rails', 'HTML', 'CSS', 'Bootstrap', 'Tailwind',
      'React Native', 'Flutter', 'Xamarin', 'iOS', 'Android',
      'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Cassandra', 'Oracle', 'SQL Server',
      'AWS', 'Azure', 'GCP', 'Google Cloud', 'Heroku',
      'Docker', 'Kubernetes', 'Jenkins', 'Terraform', 'Ansible',
      'SAP', 'SAP ISU', 'SAP FICA'
    ];

    return this.findSkillsInText(text, primarySkillKeywords).slice(0, 8);
  }

  extractSecondarySkills(text) {
    const secondarySkillKeywords = [
      'Git', 'GitHub', 'GitLab', 'Bitbucket', 'SVN',
      'JIRA', 'Confluence', 'Slack', 'Trello', 'Asana', 'ServiceNow',
      'Photoshop', 'Illustrator', 'Figma', 'Sketch', 'InVision', 'Adobe XD',
      'Agile', 'Scrum', 'Kanban', 'DevOps', 'CI/CD', 'TDD', 'BDD',
      'JUnit', 'Jest', 'Cypress', 'Selenium', 'Postman', 'TestNG', 'Manual Testing',
      'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Scikit-learn', 'Tableau',
      'Power BI', 'Matplotlib', 'Keras',
      'REST API', 'GraphQL', 'Microservices', 'SOAP', 'JSON', 'XML'
    ];

    return this.findSkillsInText(text, secondarySkillKeywords).slice(0, 8);
  }

  findSkillsInText(text, skillKeywords) {
    const foundSkills = [];
    const textLower = text.toLowerCase();

    for (const skill of skillKeywords) {
      const skillLower = skill.toLowerCase();
      
      const patterns = [
        new RegExp(`\\b${this.escapeRegex(skillLower)}\\b`, 'i'),
        new RegExp(`${this.escapeRegex(skillLower)}`, 'i'),
      ];

      if (patterns.some(pattern => pattern.test(textLower))) {
        foundSkills.push(skill);
      }
    }

    return foundSkills;
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  extractAdditionalFields(text) {
    return {
      education: this.extractEducation(text),
      location: this.extractLocation(text),
      summary: this.extractSummary(text),
    };
  }

  extractEducation(text) {
    const educationPatterns = [
      /(?:bachelor|master|phd|doctorate|b\.?tech|m\.?tech|mba|b\.?sc|m\.?sc)[\s:]*([^\n]+)/gi,
    ];

    const educations = [];
    for (const pattern of educationPatterns) {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => {
        const content = match[1] || '';
        if (content && typeof content === 'string' && content.trim().length > 5) {
          educations.push(content.trim().substring(0, 100));
        }
      });
    }

    return educations.length > 0 ? educations.join('; ') : null;
  }

  extractLocation(text) {
    const locationPatterns = [
      /(?:location|address|based in|residing in)[\s:]*([^\n]+)/gi,
    ];

    for (const pattern of locationPatterns) {
      const match = text.match(pattern);
      if (match) {
        const location = match[1] || match[0];
        return location.trim().replace(/[,\s]+$/, '');
      }
    }

    return null;
  }

  extractSummary(text) {
    const summaryPatterns = [
      /(?:summary|objective|profile|career objective)[\s:]*([^\n]*(?:\n[^\n]*){0,4})/gi,
    ];

    for (const pattern of summaryPatterns) {
      const match = text.match(pattern);
      if (match && match[1] && match[1].trim().length > 20) {
        return match[1].trim().substring(0, 300);
      }
    }

    return null;
  }

  getAllCandidates() {
    return [...candidatesStorage];
  }

  getCandidateById(id) {
    return candidatesStorage.find(candidate => candidate.id === id);
  }

  async clearAllCandidates() {
    const count = candidatesStorage.length;

    for (const candidate of candidatesStorage) {
      if (candidate.filePath) {
        await fs.remove(candidate.filePath).catch(() => {});
      }
    }

    candidatesStorage = [];
    logger.info(`Cleared ${count} candidate records and associated files`);
    return count;
  }

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
      const exp = parseFloat(candidate.experience) || 0;
      return exp >= minYears && exp <= maxYears;
    });
  }

  getStatistics() {
    const candidates = this.getAllCandidates();
    const totalCandidates = candidates.length;

    if (totalCandidates === 0) {
      return {
        totalCandidates: 0,
        avgExperience: 0,
        linkedinProfiles: 0,
        topSkills: {},
        experienceDistribution: {}
      };
    }

    const experiences = candidates
      .map(c => parseFloat(c.experience) || 0)
      .filter(exp => exp > 0);

    const avgExperience = experiences.length > 0
      ? (experiences.reduce((sum, exp) => sum + exp, 0) / experiences.length).toFixed(1)
      : 0;

    const linkedinProfiles = candidates.filter(c => c.linkedinUrl).length;

    const skillCounts = {};
    candidates.forEach(candidate => {
      [...candidate.primarySkills, ...candidate.secondarySkills].forEach(skill => {
        skillCounts[skill] = (skillCounts[skill] || 0) + 1;
      });
    });

    const topSkills = Object.entries(skillCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .reduce((obj, [skill, count]) => {
        obj[skill] = count;
        return obj;
      }, {});

    const experienceDistribution = {
      '0-2': 0,
      '3-5': 0,
      '6-10': 0,
      '10+': 0
    };

    candidates.forEach(candidate => {
      const exp = parseFloat(candidate.experience) || 0;
      if (exp <= 2) experienceDistribution['0-2']++;
      else if (exp <= 5) experienceDistribution['3-5']++;
      else if (exp <= 10) experienceDistribution['6-10']++;
      else experienceDistribution['10+']++;
    });

    return {
      totalCandidates,
      avgExperience: parseFloat(avgExperience),
      linkedinProfiles,
      topSkills,
      experienceDistribution
    };
  }
}

module.exports = new ResumeParserService();