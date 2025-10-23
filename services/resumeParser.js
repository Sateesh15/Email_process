const fs = require('fs-extra');
const path = require('path');
const pdfParse = require('pdf-parse');
const docx = require('docx');
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

            // Parse candidate information with improved logic
            const candidateData = this.extractCandidateInfo(extractedText, extractAdditionalFields);

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

    extractCandidateInfo(text, extractAdditionalFields = false) {
        // Clean and normalize text
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

        // Use AI extractor as a fallback for missing or low-confidence fields
        try {
            const aiResult = aiExtractor.extractCandidateInfoAI(text, extractAdditionalFields);

            // Fill missing name
            if ((!candidateInfo.name || candidateInfo.name === 'Name Not Found') && aiResult.name) {
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

            // If additional fields requested, merge AI additionalFields
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

    normalizeText(text) {
        // Preserve line breaks but normalize spaces within each line.
        // This keeps header/name lines intact so name extraction can operate on the first lines.
        const lines = text
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split('\n')
            .map(line => line.replace(/\s+/g, ' ').trim())
            .filter(line => line.length > 0);

        return lines.join('\n');
    }

    // ENHANCED NAME EXTRACTION - Fixes the main issues
    extractNameEnhanced(text) {
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

        // Section header blacklist to avoid matching headers as names
        const headerBlacklist = ['profile','summary','objective','career objective','contact','education','experience','skills','technical skills','projects','internships','trainings','certifications'];

        // Strategy 1: Look for all caps names at the very beginning
        for (let i = 0; i < Math.min(lines.length, 3); i++) {
            const line = lines[i].trim();

            // SUJITH KUMAR CHINTHGINJALA pattern
            if (/^[A-Z][A-Z\s]{8,50}$/.test(line) && 
                line.split(' ').length >= 2 && 
                line.split(' ').length <= 5) {
                const cleanedName = line.replace(/[^A-Z\s]/g, '').trim();
                if (cleanedName.length > 5 && !this.isCompanyOrInstitution(cleanedName)) {
                    return this.formatName(cleanedName);
                }
            }
        }

        // Strategy 2: Look for title case names in first few lines  
        for (let i = 0; i < Math.min(lines.length, 5); i++) {
            const line = lines[i].trim();

            // Munnam Sateesh pattern
            if (/^[A-Z][a-z]+ [A-Z][a-z]+(?: [A-Z][a-z]+)*$/.test(line) &&
                line.length >= 5 && line.length <= 40 &&
                !this.isCompanyOrInstitution(line)) {
                return this.formatName(line);
            }
        }

        // Strategy 3: Look for PRIYANKA.I or similar patterns
        for (let i = 0; i < Math.min(lines.length, 30); i++) {
            const line = lines[i].trim();

            // Handle PRIYANKA.I pattern (name with initials)
            if (/^[A-Z]+\.[A-Z]$/.test(line)) {
                const parts = line.split('.');
                const candidate = parts[0] + ' ' + parts[1];
                if (!this.isJobTitle(candidate) && this.isValidName(candidate)) {
                    return this.formatName(candidate);
                }
            }

            // Handle other name patterns
            if (/^[A-Z][A-Z]*\s+[A-Z][A-Z]*$/.test(line) && 
                line.split(' ').length === 2 &&
                !this.isCompanyOrInstitution(line) && !this.isJobTitle(line)) {
                return this.formatName(line);
            }
        }

        // Strategy 4: Look for names in specific contexts
        const namePatterns = [
            // After "Name:" or similar
            /(?:name|candidate|applicant)[:\s]+([A-Z][a-zA-Z\s]{3,40})/i,
            // At start of line with proper case
            /^([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$/m,
            // In header context
            /^\s*([A-Z][a-zA-Z\s]{5,35})\s*$/m
        ];

        for (const pattern of namePatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                const candidate = match[1].trim();
                if (!this.isCompanyOrInstitution(candidate) && !this.isJobTitle(candidate) && this.isValidName(candidate)) {
                    return this.formatName(candidate);
                }
            }
        }

        // Strategy 5: Scan a larger window of lines for uppercase or initial-style names
        for (let i = 0; i < Math.min(lines.length, 120); i++) {
            let line = lines[i];
            // remove bullets and stray characters
            line = line.replace(/^\W+|\W+$/g, '').trim();
            const lower = line.toLowerCase();
            if (!line || headerBlacklist.some(h => lower.startsWith(h))) continue;

            // All-caps with spaces and optional dots (e.g., 'SUJITH KUMAR' or 'PRIYANKA.I')
            if (/^[A-Z\.\s]{2,60}$/.test(line)) {
                // don't match common headers like 'PROFILE' (already blacklisted) or single words
                const words = line.replace(/\.+/g, ' ').split(/\s+/).filter(Boolean);
                if (words.length >= 2 && words.length <= 5) {
                    const candidate = words.join(' ');
                    if (!this.isCompanyOrInstitution(candidate) && !this.isJobTitle(candidate) && this.isValidName(candidate)) {
                        return this.formatName(candidate);
                    }
                }
            }
        }

        return 'Name Not Found';
    }

    // Detect common job title / role lines to avoid mistaking them for candidate names
    isJobTitle(text) {
        if (!text || typeof text !== 'string') return false;
        const titleKeywords = [
            'engineer','developer','manager','analyst','consultant','intern','trainee','test','tester','director','lead','associate','officer','specialist','architect','president','vp','vice','owner'
        ];

        const lower = text.toLowerCase();
        // if any keyword appears as a whole word in the text, consider it a job title
        return titleKeywords.some(k => new RegExp(`\\b${k}\\b`, 'i').test(lower));
    }

    // Check if text is likely a company or institution name
    isCompanyOrInstitution(text) {
        const institutionKeywords = [
            'institute', 'university', 'college', 'school', 'academy', 'center',
            'technology', 'solutions', 'services', 'company', 'corporation', 'ltd',
            'systems', 'group', 'association', 'foundation', 'organization',
            'annamacharya', 'inu technology', 'tech solutions'
        ];

        const lowerText = text.toLowerCase();
        return institutionKeywords.some(keyword => lowerText.includes(keyword));
    }

    // Validate if text looks like a real name
    isValidName(text) {
        // Must be 2-4 words, each 2+ characters, no numbers
        const words = text.trim().split(/\s+/);
        if (words.length < 2 || words.length > 4) return false;

        // Allow one single-letter initial (e.g., 'Priyanka I') but other words must be >=2
        const longWords = words.filter(w => w.length >= 2 && /^[A-Za-z]+$/.test(w));
        const shortLetterWords = words.filter(w => w.length === 1 && /^[A-Za-z]$/.test(w));

        // Reject if any word contains non-letters
        if (!words.every(w => /^[A-Za-z]+$/.test(w))) return false;

        // Valid if all words are >=2, or one single-letter initial plus others >=2
        return (longWords.length === words.length) || (longWords.length === words.length - 1 && shortLetterWords.length === 1);
    }

    // Format name properly
    formatName(name) {
        return name
            .replace(/[^a-zA-Z\s]/g, '')
            .trim()
            .replace(/\s+/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    // ENHANCED EXPERIENCE EXTRACTION - Fixes NaN issues
    extractExperienceEnhanced(text) {
        // Strategy 1: Look for explicit experience statements with better parsing
        const experiencePatterns = [
            // "4.3 years of experience"
            /(\d+(?:\.\d+)?)\s*years?\s*of\s*experience/gi,
            // "experience: 4.3 years" 
            /experience[:\s]+(\d+(?:\.\d+)?)\s*years?/gi,
            // "over 2.8 years of experience"
            /over\s+(\d+(?:\.\d+)?)\s*years?/gi,
            // "Possessing over 2.8 years"
            /possessing\s+over\s+(\d+(?:\.\d+)?)\s*years?/gi,
            // "2.8 years experience" 
            /(\d+(?:\.\d+)?)\s*years?\s*experience/gi,
            // Total experience patterns
            /total.*?experience.*?(\d+(?:\.\d+)?)\s*years?/gi
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

        // Strategy 2: Calculate from employment date ranges
        const dateRangePatterns = [
            // March 2023 – Present, Dec 2024 – Present
            /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{4})\s*[-–]\s*(present|current)/gi,
            // 2023 - Present, 2024 - Present
            /(\d{4})\s*[-–]\s*(present|current)/gi,
            // March 2023 - June 2024
            /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{4})\s*[-–]\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{4})/gi,
            // 2022 - 2023
            /(\d{4})\s*[-–]\s*(\d{4})/gi
        ];

        let totalExperience = 0;
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        for (const pattern of dateRangePatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                let startYear, endYear;

                if (match[3] && (match[3].toLowerCase() === 'present' || match[3].toLowerCase() === 'current')) {
                    // Has "present" or "current"
                    startYear = parseInt(match[2] || match[1]);
                    endYear = currentYear;
                } else if (match[4]) {
                    // Has both start and end years
                    startYear = parseInt(match[2]);
                    endYear = parseInt(match[4]);
                } else if (match[2] && !isNaN(parseInt(match[2]))) {
                    // Simple year range
                    startYear = parseInt(match[1]);
                    endYear = parseInt(match[2]);
                }

                if (startYear && endYear && endYear >= startYear && startYear > 1990) {
                    const experience = endYear - startYear;
                    if (endYear === currentYear) {
                        // Add partial year for current positions
                        totalExperience += experience + (currentMonth / 12);
                    } else {
                        totalExperience += experience;
                    }
                }
            }
        }

        if (totalExperience > 0 && totalExperience < 50) {
            return `${Math.round(totalExperience * 10) / 10} years`;
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
            // Indian numbers like +91 6302487572
            /\+91[\s-]?[6-9][0-9]{9}/g,
            // US numbers
            /(\+?1[-.\s]?)?(\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/g,
            // General international
            /(\+[1-9]{1}[0-9]{0,3}[-.\s]?[0-9]{4,14})/g,
            // Phone with labels
            /(phone|mobile|cell|tel)[:\s]*([0-9\-.\s\(\)\+]+)/gi,
            // Simple 10 digit numbers
            /\b[6-9][0-9]{9}\b/g
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
            /linkedin[:\s]*([a-zA-Z0-9\-\/\.]+)/gi,
            /linkedin\.com\/in\/([a-zA-Z0-9\-]+)/gi
        ];

        for (const pattern of linkedinPatterns) {
            const match = text.match(pattern);
            if (match) {
                let url = match[0];
                if (!url.startsWith('http')) {
                    const username = url.split('/').pop() || url.replace(/linkedin[:\s]*/, '');
                    url = `https://linkedin.com/in/${username}`;
                }
                return url;
            }
        }
        return null;
    }

    extractPrimarySkills(text) {
        const primarySkillKeywords = [
            // Programming languages (high priority)
            'JavaScript', 'Python', 'Java', 'C++', 'C#', 'PHP', 'Ruby', 'Go', 'Rust', 'TypeScript',
            'Swift', 'Kotlin', 'Scala', 'R', 'MATLAB', 'SQL', 'Dart', 'Objective-C',

            // Web technologies
            'React', 'Angular', 'Vue.js', 'Vue', 'Node.js', 'Express', 'Django', 'Flask', 'Spring',
            'ASP.NET', 'Laravel', 'Rails', 'HTML', 'CSS', 'Bootstrap', 'Tailwind',

            // Mobile development
            'React Native', 'Flutter', 'Xamarin', 'iOS', 'Android',

            // Databases
            'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Cassandra', 'Oracle', 'SQL Server',

            // Cloud platforms
            'AWS', 'Azure', 'GCP', 'Google Cloud', 'Heroku',

            // DevOps tools
            'Docker', 'Kubernetes', 'Jenkins', 'Terraform', 'Ansible',

            // SAP specific
            'SAP', 'SAP ISU', 'SAP FICA'
        ];

        return this.findSkillsInText(text, primarySkillKeywords).slice(0, 8);
    }

    extractSecondarySkills(text) {
        const secondarySkillKeywords = [
            // Version control & collaboration
            'Git', 'GitHub', 'GitLab', 'Bitbucket', 'SVN',

            // Project management & tools
            'JIRA', 'Confluence', 'Slack', 'Trello', 'Asana', 'ServiceNow',

            // Design tools
            'Photoshop', 'Illustrator', 'Figma', 'Sketch', 'InVision', 'Adobe XD',

            // Methodologies
            'Agile', 'Scrum', 'Kanban', 'DevOps', 'CI/CD', 'TDD', 'BDD',

            // Testing
            'JUnit', 'Jest', 'Cypress', 'Selenium', 'Postman', 'TestNG', 'Manual Testing',

            // Data Science & ML
            'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Scikit-learn', 'Tableau',
            'Power BI', 'Matplotlib', 'Keras',

            // Others
            'REST API', 'GraphQL', 'Microservices', 'SOAP', 'JSON', 'XML'
        ];

        return this.findSkillsInText(text, secondarySkillKeywords).slice(0, 8);
    }

    findSkillsInText(text, skillKeywords) {
        const foundSkills = [];
        const textLower = text.toLowerCase();

        // Create word boundaries for better matching
        for (const skill of skillKeywords) {
            const skillLower = skill.toLowerCase();

            // Use word boundaries and various patterns
            const patterns = [
                new RegExp(`\\b${this.escapeRegex(skillLower)}\\b`, 'i'),
                new RegExp(`${this.escapeRegex(skillLower)}`, 'i'),
                new RegExp(`${this.escapeRegex(skillLower.replace(/\./g, ''))}`, 'i')
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
            currentRole: this.extractCurrentRole(text),
            summary: this.extractSummary(text),
            certifications: this.extractCertifications(text),
            languages: this.extractLanguages(text),
            projects: this.extractProjects(text),
            companies: this.extractCompanies(text)
        };
    }

    extractEducation(text) {
        const educationPatterns = [
            /(?:bachelor|master|phd|doctorate|degree|b\.?tech|m\.?tech|mba|b\.?sc|m\.?sc)[\s:]*([^\n]+)/gi,
            /(?:education|academic)[\s:]*([^\n]+)/gi,
            /(?:university|college|institute)[\s:]*([^\n]+)/gi,
            /(\d{4})\s*[-–]\s*(\d{4})\s*([^\n]*(?:university|college|institute|school)[^\n]*)/gi
        ];

        const educations = [];
        for (const pattern of educationPatterns) {
            const matches = [...text.matchAll(pattern)];
            matches.forEach(match => {
                const content = match[1] || match[3] || '';
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
            /([A-Z][a-z]+,\s*[A-Z]{2})/g,
            /([A-Z][a-z]+\s*[A-Z][a-z]*,\s*[A-Z][a-z]+)/g,
            /(hyderabad|bangalore|mumbai|delhi|chennai|pune|kolkata|india)/gi
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

    extractCurrentRole(text) {
        const rolePatterns = [
            /(?:current|present)[\s:]*([^\n]+)/gi,
            /(?:working as|role|position|designation)[\s:]*([^\n]+)/gi,
            /^([A-Z][a-z\s]+(?:Engineer|Developer|Manager|Analyst|Designer|Specialist|Lead|Director|VP|Consultant|Trainee))/m
        ];

        for (const pattern of rolePatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                return match[1].trim().substring(0, 50);
            }
        }
        return null;
    }

    extractSummary(text) {
        const summaryPatterns = [
            /(?:summary|objective|profile|career objective)[\s:]*([^\n]*(?:\n[^\n]*){0,4})/gi,
            /^([A-Z][^.!?]*[.!?])$/m
        ];

        for (const pattern of summaryPatterns) {
            const match = text.match(pattern);
            if (match && match[1] && match[1].trim().length > 20) {
                return match[1].trim().substring(0, 300);
            }
        }
        return null;
    }

    extractCertifications(text) {
        const certificationKeywords = [
            'AWS Certified', 'Google Cloud', 'Microsoft Certified', 'Cisco',
            'PMP', 'CISSP', 'CISM', 'CEH', 'OSCP', 'CompTIA', 'Oracle Certified',
            'Salesforce', 'Adobe Certified', 'Red Hat', 'VMware'
        ];

        return this.findSkillsInText(text, certificationKeywords);
    }

    extractLanguages(text) {
        const languageKeywords = [
            'English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese',
            'Korean', 'Italian', 'Portuguese', 'Russian', 'Arabic', 'Hindi',
            'Telugu', 'Tamil', 'Bengali', 'Marathi', 'Gujarati', 'Kannada'
        ];

        return this.findSkillsInText(text, languageKeywords);
    }

    extractProjects(text) {
        const projectPatterns = [
            /(?:project|projects)[\s:]*([^\n]*(?:\n[^\n]*){0,3})/gi,
            /(?:title|project title)[\s:]*([^\n]+)/gi
        ];

        const projects = [];
        for (const pattern of projectPatterns) {
            const matches = [...text.matchAll(pattern)];
            matches.forEach(match => {
                if (match[1] && match[1].trim().length > 10) {
                    projects.push(match[1].trim().substring(0, 200));
                }
            });
        }

        return projects.length > 0 ? projects.slice(0, 3).join('; ') : null;
    }

    extractCompanies(text) {
        const companyPatterns = [
            /(?:company|employer|organization)[\s:]*([^\n]+)/gi,
            /(\b[A-Z][a-zA-Z\s&]+(?:Ltd|Inc|Corporation|Corp|Company|Technologies|Solutions|Systems|Services)\b)/g
        ];

        const companies = new Set();
        for (const pattern of companyPatterns) {
            const matches = [...text.matchAll(pattern)];
            matches.forEach(match => {
                const company = match[1] || match[0];
                if (company && company.trim().length > 3) {
                    companies.add(company.trim().substring(0, 50));
                }
            });
        }

        return companies.size > 0 ? Array.from(companies).slice(0, 5).join('; ') : null;
    }

    // Getter methods (unchanged)
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
            const exp = parseFloat(candidate.experience) || 0;
            return exp >= minYears && exp <= maxYears;
        });
    }

    // Statistics method
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

        // Calculate average experience
        const experiences = candidates
            .map(c => parseFloat(c.experience) || 0)
            .filter(exp => exp > 0);
        const avgExperience = experiences.length > 0 
            ? (experiences.reduce((sum, exp) => sum + exp, 0) / experiences.length).toFixed(1)
            : 0;

        // Count LinkedIn profiles
        const linkedinProfiles = candidates.filter(c => c.linkedinUrl).length;

        // Top skills analysis
        const skillCounts = {};
        candidates.forEach(candidate => {
            [...candidate.primarySkills, ...candidate.secondarySkills].forEach(skill => {
                skillCounts[skill] = (skillCounts[skill] || 0) + 1;
            });
        });

        // Sort skills by frequency
        const topSkills = Object.entries(skillCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 20)
            .reduce((obj, [skill, count]) => {
                obj[skill] = count;
                return obj;
            }, {});

        // Experience distribution
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