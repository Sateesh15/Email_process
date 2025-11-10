const fs = require('fs-extra');
const path = require('path');
const pdfParse = require('pdf-parse');
const textract = require('textract');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const aiExtractor = require('../utils/textExtractor');

// In-memory storage for candidates (in production, use a database)
let candidatesStorage = [];

class ResumeParserService {
    constructor() {
        this.supportedFormats = ['.pdf', '.docx', '.doc', '.txt'];
    }

    // ✅ Now async so it can await extractCandidateInfo()
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

            logger.info(`Extracted text preview: ${extractedText.substring(0, 200)}...`);

            // ✅ Await async extractCandidateInfo
            const candidateData = await this.extractCandidateInfo(extractedText, extractAdditionalFields);

            // Add metadata
            candidateData.id = uuidv4();
            candidateData.filePath = filePath;
            candidateData.originalFileName = originalName;
            candidateData.processedAt = new Date().toISOString();
            candidateData.fileSize = (await fs.stat(filePath)).size;
            candidateData.rawText = extractedText; // Store for debugging

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

    // ✅ Marked async so await works properly
    async extractCandidateInfo(text, extractAdditionalFields = false) {
        // Clean and normalize text
        const cleanText = this.normalizeText(text);

        const candidateInfo = {
    name: aiExtractor.extractNameWithAI(cleanText),
    email: aiExtractor.extractEmail(cleanText),
    phone: aiExtractor.extractPhone(cleanText),
    experience: aiExtractor.extractExperienceWithAI(cleanText),
    linkedinUrl: aiExtractor.extractLinkedIn(cleanText),
    primarySkills: aiExtractor.extractSkillsWithAI(cleanText, true),
    secondarySkills: aiExtractor.extractSkillsWithAI(cleanText, false)
};


        // ✅ AI extractor now awaited properly
        try {
            const aiResult = await aiExtractor.extractCandidateInfoAI(text, extractAdditionalFields);

            // Fill missing name
            const invalidNamePatterns = /key|competencies|skills|summary|profile|contact/i;
if ((!candidateInfo.name || candidateInfo.name === 'Name Not Found' || invalidNamePatterns.test(candidateInfo.name)) && aiResult.name) {
    candidateInfo.name = aiResult.name;
}


            // Merge primary skills if rule-based found none or very few
            if ((!candidateInfo.primarySkills || candidateInfo.primarySkills.length === 0) && aiResult.primarySkills) {
                candidateInfo.primarySkills = aiResult.primarySkills;
            }

            // Merge secondary skills similarly
            if ((!candidateInfo.secondarySkills || candidateInfo.secondarySkills.length === 0) && aiResult.secondarySkills) {
                candidateInfo.secondarySkills = aiResult.secondarySkills;
            }

            // Merge AI additional fields if requested
            if (extractAdditionalFields && aiResult.additionalFields) {
                candidateInfo.additionalFields = candidateInfo.additionalFields || {};
                candidateInfo.additionalFields = Object.assign({}, aiResult.additionalFields, candidateInfo.additionalFields);
            }
        } catch (e) {
            logger.warn('AI extractor failed or returned error, proceeding with rule-based results');
        }

        if (extractAdditionalFields) {
            candidateInfo.additionalFields = this.extractAdditionalFields(cleanText);
        }

        return candidateInfo;
    }

    // ---------- (the rest of your helper methods remain unchanged) ----------

    normalizeText(text) {
        const lines = text
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split('\n')
            .map(line => line.replace(/\s+/g, ' ').trim())
            .filter(line => line.length > 0);

        return lines.join('\n');
    }

    extractAdditionalFields(text) {
    return {
      education: this.extractEducationWithAI(text),
      location: this.extractLocationWithAI(text),
      currentRole: this.extractCurrentRole(text),
      summary: this.extractSummaryWithAI(text),
      certifications: this.extractCertifications(text),
      languages: this.extractLanguages(text),
      projects: this.extractProjectsWithAI(text),
      companies: this.extractCompaniesWithAI(text)
    };
  }

  extractEducationWithAI(text) {
    const patterns = [
      /(?:bachelor|master|phd|b\.?tech|m\.?tech|mba|b\.?sc|m\.?sc)[^\\n]+/gi,
      /education[\s:]*([^\n]*(?:\n[^\n]*){0,3})/gi
    ];
    const out = new Set();
    patterns.forEach(p => {
      let m;
      while ((m = p.exec(text)) !== null) {
        out.add((m[1] || m[0]).trim().substring(0, 100));
      }
    });
    return out.size ? Array.from(out).join('; ') : null;
  }

   extractLocationWithAI(text) {
    const patterns = [
      /(?:location|address|based in|residing in|located in)[:\s]*([^\n,]+)/gi,
      /(Hyderabad|Bangalore|Mumbai|Delhi|Chennai|Pune|Kolkata|Ahmedabad|New York|London|San Francisco|Seattle)[,.\s]*/gi
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return (m[1] || m[0]).trim().substring(0, 100);
    }
    return null;
  }

  extractCurrentRole(text) {
    const patterns = [
      /(?:currently|current role|working as|designation|title)[:\s]*([^\n,]+)/gi,
      /(?:position|job title)[:\s]*([^\n,]+)/gi
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return (m[1] || m[0]).trim().substring(0, 100);
    }
    return null;
  }

  extractSummaryWithAI(text) {
    const keywords = ['summary', 'objective', 'profile', 'career objective', 'professional summary'];
    for (const k of keywords) {
      const regex = new RegExp(`${k}[:\\s]*([^\\n]{20,300})`, 'i');
      const m = text.match(regex);
      if (m) return m[1].trim().substring(0, 300);
    }
    return null;
  }

  extractProjectsWithAI(text) {
    const patterns = [
      /(?:project|projects|major project|capstone)[:\s]*([^\n]{20,200})/gi,
      /(?:project title)[:\s]*([^\n]+)/gi
    ];
    const out = new Set();
    patterns.forEach(p => {
      let m;
      while ((m = p.exec(text)) !== null) {
        out.add(m[1].trim().substring(0, 150));
      }
    });
    return out.size ? Array.from(out).join('; ') : null;
  }

  extractCompaniesWithAI(text) {
    const patterns = [
      /(?:company|employer|organization|worked at|company name)[:\s]*([^\n,]+)/gi,
      /(\b[A-Z][a-zA-Z\s&]+(?:Ltd|Inc|Corporation|Solutions|Systems|Services|Pvt)\b)/g
    ];
    const out = new Set();
    patterns.forEach(p => {
      let m;
      while ((m = p.exec(text)) !== null) {
        out.add((m[1] || m[0]).trim().substring(0, 100));
      }
    });
    return out.size ? Array.from(out).join('; ') : null;
  }

  extractCertifications(text) {
    const certs = [
      'AWS Certified',
      'Google Cloud',
      'Microsoft Certified',
      'PMP',
      'CISSP',
      'CEH',
      'Oracle Certified',
      'Salesforce',
      'Certified'
    ];
    const found = [];
    const lower = text.toLowerCase();
    certs.forEach(c => {
      if (lower.includes(c.toLowerCase())) found.push(c);
    });
    return found;
  }

  extractLanguages(text) {
    const langs = [
      'English',
      'Spanish',
      'French',
      'Hindi',
      'Telugu',
      'Tamil',
      'Kannada',
      'German',
      'Arabic',
      'Japanese',
      'Chinese'
    ];
    const found = [];
    const lower = text.toLowerCase();
    langs.forEach(l => {
      if (lower.includes(l.toLowerCase())) found.push(l);
    });
    return found;
  }

    // (All your extractNameEnhanced, extractExperienceEnhanced, extractEmail, etc.)
    // These methods remain exactly as they are — no async changes required.

    // -------------------- getters & utility methods remain the same --------------------
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
            '0-1': 0,
            '1-3': 0,
            '3-5': 0,
            '5-10': 0,
            '10+': 0
        };

        candidates.forEach(candidate => {
            const exp = parseFloat(candidate.experience) || 0;
            if (exp <= 1) experienceDistribution['0-1']++;
            else if (exp <= 3) experienceDistribution['1-3']++;
            else if (exp <= 5) experienceDistribution['3-5']++;
            else if (exp <= 10) experienceDistribution['5-10']++;
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
