const natural = require('natural');
const logger = require('./logger');

class AIEnhancedTextExtractor {
    constructor() {
        this.stemmer = natural.PorterStemmer;
        this.tokenizer = new natural.WordTokenizer();
        this.sentenceTokenizer = new natural.SentenceTokenizer();

        // Initialize named entity patterns
        this.initializePatterns();
    }

    initializePatterns() {
        // Enhanced patterns for better extraction
        this.namePatterns = [
            // Full caps names
            /^([A-Z][A-Z\s]{8,40})$/m,
            // Title case names
            /^([A-Z][a-z]+ [A-Z][a-z]+(?: [A-Z][a-z]+)?)$/m,
            // Name with special formatting
            /^([A-Z][A-Z\s]+(?:\.|[A-Z])?)$/m,
            // Name after keywords
            /(?:Name|Candidate)[:\s]*([A-Z][a-zA-Z\s]{3,30})/i,
            // Resume header name
            /^\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*$/m
        ];

        this.emailPatterns = [
            /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi
        ];

        this.phonePatterns = [
            // Indian mobile numbers
            /(?:\+91[\s-]?)?[6-9]\d{9}\b/g,
            // US phone numbers
            /(?:\+1[\s-]?)?\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4}/g,
            // International format
            /\+[1-9]\d{0,3}[\s-]?\d{4,14}/g,
            // With labels
            /(?:phone|mobile|cell|tel)[:\s]*([\d\s\-\(\)\+]+)/gi
        ];

        this.experiencePatterns = [
            // Years of experience
            /(\d+(?:\.\d+)?)\s*(?:\+)?\s*years?\s*(?:of\s+)?experience/gi,
            /experience[:\s]*(\d+(?:\.\d+)?)\s*(?:\+)?\s*years?/gi,
            /(\d+(?:\.\d+)?)\s*(?:\+)?\s*yrs?\s*(?:of\s+)?exp/gi,
            /total\s*experience[:\s]*(\d+(?:\.\d+)?)/gi,
            /(?:over|more than)\s*(\d+(?:\.\d+)?)\s*years?/gi,
            // From date ranges
            /(\d{4})\s*[-–to]\s*(\d{4}|present|current)/gi
        ];

        this.linkedinPatterns = [
            /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w\-]+\/?/gi,
            /linkedin[:\s]*([\w\-\/\.]+)/gi
        ];

        // Skill categories with better matching
        this.skillCategories = {
            programming: [
                'JavaScript', 'Python', 'Java', 'C++', 'C#', 'PHP', 'Ruby', 'Go', 'Rust', 'TypeScript',
                'Swift', 'Kotlin', 'Scala', 'MATLAB', 'Dart', 'Objective-C', 'Perl', 'Haskell'
            ],
            web: [
                'React', 'Angular', 'Vue.js', 'Vue', 'Node.js', 'Express', 'Django', 'Flask', 'Spring',
                'ASP.NET', 'Laravel', 'Rails', 'HTML', 'CSS', 'Bootstrap', 'Tailwind', 'jQuery',
                'Next.js', 'Nuxt.js', 'Gatsby', 'Svelte'
            ],
            mobile: [
                'React Native', 'Flutter', 'Xamarin', 'iOS', 'Android', 'Ionic', 'Cordova'
            ],
            database: [
                'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Cassandra', 'Oracle', 'SQL Server',
                'SQLite', 'DynamoDB', 'Firebase', 'Elasticsearch'
            ],
            cloud: [
                'AWS', 'Azure', 'GCP', 'Google Cloud', 'Heroku', 'DigitalOcean', 'Alibaba Cloud'
            ],
            devops: [
                'Docker', 'Kubernetes', 'Jenkins', 'Terraform', 'Ansible', 'Chef', 'Puppet',
                'GitLab CI', 'GitHub Actions', 'CircleCI'
            ],
            tools: [
                'Git', 'GitHub', 'GitLab', 'Bitbucket', 'JIRA', 'Confluence', 'Slack', 'Trello',
                'Postman', 'Swagger', 'Insomnia', 'VS Code', 'IntelliJ', 'Eclipse'
            ]
        };
    }

    // Enhanced name extraction with AI-like logic
    extractNameWithAI(text) {
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        const candidates = [];

        // Strategy 1: Look for all-caps names (common in resumes)
        for (let i = 0; i < Math.min(lines.length, 8); i++) {
            const line = lines[i];

            // Check for full caps names
            if (/^[A-Z][A-Z\s]{8,50}$/.test(line)) {
                const words = line.split(/\s+/);
                if (words.length >= 2 && words.length <= 5) {
                    candidates.push({
                        name: this.formatName(line),
                        confidence: 0.9,
                        position: i,
                        pattern: 'all-caps'
                    });
                }
            }
        }

        // Strategy 2: Look for title case names
        for (let i = 0; i < Math.min(lines.length, 8); i++) {
            const line = lines[i];

            if (/^[A-Z][a-z]+ [A-Z][a-z]+(?: [A-Z][a-z]+)*$/.test(line) && 
                line.length < 50 && !this.isNonNameLine(line)) {
                candidates.push({
                    name: this.formatName(line),
                    confidence: 0.8,
                    position: i,
                    pattern: 'title-case'
                });
            }
        }

        // Strategy 3: Look for names with keywords
        this.namePatterns.forEach(pattern => {
            const match = text.match(pattern);
            if (match && match[1]) {
                candidates.push({
                    name: this.formatName(match[1]),
                    confidence: 0.7,
                    position: -1,
                    pattern: 'keyword-based'
                });
            }
        });

        // Score and select best candidate
        if (candidates.length === 0) return 'Name Not Found';

        // Sort by confidence and position (earlier is better)
        candidates.sort((a, b) => {
            if (a.confidence !== b.confidence) {
                return b.confidence - a.confidence;
            }
            return a.position - b.position;
        });

        return candidates[0].name;
    }

    // Check if line is likely not a name
    isNonNameLine(line) {
        const nonNameKeywords = [
            'profile', 'objective', 'summary', 'education', 'experience', 'skills',
            'contact', 'phone', 'email', 'location', 'resume', 'cv', 'curriculum',
            'bachelor', 'master', 'phd', 'degree', 'institute', 'university', 'college',
            'project', 'certification', 'language', 'address', 'qualification'
        ];

        const lineLower = line.toLowerCase();
        return (
            nonNameKeywords.some(keyword => lineLower.includes(keyword)) ||
            /@/.test(line) ||
            /\+\d/.test(line) ||
            /^\d/.test(line) ||
            line.length < 3 ||
            line.length > 50
        );
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

    // Enhanced experience extraction with date calculation and summary analysis
    extractExperienceWithAI(text) {
        // Strategy 1: Look in the summary/profile section for experience
        const summaryPattern = /(?:with|having)\s+(\d+(?:\.\d+)?)\s*(?:\+\s*)?years?\s+(?:of\s+)?(?:work\s+)?experience/i;
        const summaryMatch = text.match(summaryPattern);
        if (summaryMatch && summaryMatch[1]) {
            const years = parseFloat(summaryMatch[1]);
            if (!isNaN(years) && years > 0 && years < 50) {
                return `${years} years`;
            }
        }

        // Strategy 2: Look for explicit experience mentions anywhere
        for (const pattern of this.experiencePatterns) {
            const matches = text.matchAll(pattern);
            for (const match of matches) {
                if (match[1]) {
                    const years = parseFloat(match[1]);
                    if (!isNaN(years) && years > 0 && years < 50) {
                        return `${years} years`;
                    }
                }
            }
        }

        // Calculate from date ranges
        const dateRanges = this.extractDateRanges(text);
        if (dateRanges.length > 0) {
            let totalExperience = 0;
            const currentYear = new Date().getFullYear();

            dateRanges.forEach(range => {
                let startYear = parseInt(range.start);
                let endYear = range.end.toLowerCase().includes('present') || 
                            range.end.toLowerCase().includes('current') 
                            ? currentYear : parseInt(range.end);

                if (startYear && endYear && endYear >= startYear && startYear > 1980) {
                    totalExperience += (endYear - startYear);
                }
            });

            if (totalExperience > 0 && totalExperience < 50) {
                return `${totalExperience} years`;
            }
        }

        return 'Not specified';
    }

    // Extract date ranges from text
    extractDateRanges(text) {
        const ranges = [];
        const dateRangePatterns = [
            /(\d{4})\s*[-–to]\s*(\d{4}|present|current)/gi,
            /(\w+\s+\d{4})\s*[-–to]\s*(\w+\s+\d{4}|present|current)/gi
        ];

        dateRangePatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                ranges.push({
                    start: match[1],
                    end: match[2]
                });
            }
        });

        return ranges;
    }

    // Enhanced skill extraction with context awareness
    extractSkillsWithAI(text, isPrimary = true) {
        const foundSkills = new Map(); // Use Map to track skills and their contexts
        const textLower = text.toLowerCase();

        // Get appropriate skill categories
        const categories = isPrimary 
            ? ['programming', 'web', 'mobile', 'database', 'cloud']
            : ['devops', 'tools'];

        categories.forEach(category => {
            this.skillCategories[category].forEach(skill => {
                const contexts = this.findSkillContexts(textLower, skill.toLowerCase());
                if (contexts.length > 0) {
                    foundSkills.set(skill, {
                        skill: skill,
                        contexts: contexts,
                        score: this.calculateSkillScore(contexts, skill)
                    });
                }
            });
        });

        // Sort by score and return top skills
        const sortedSkills = Array.from(foundSkills.values())
            .sort((a, b) => b.score - a.score)
            .map(item => item.skill);

        return sortedSkills.slice(0, isPrimary ? 8 : 6);
    }

    // Find contexts where skills are mentioned with improved accuracy
    findSkillContexts(text, skill) {
        const contexts = [];
        
        // Special handling for single-letter skills like 'R'
        if (skill.length === 1) {
            // Look for skill mentions in skills or technologies sections
            const skillSectionPattern = /(?:skills?|technologies?|tech\s+stack)[^\n]*(?:\n[^\n]*){0,10}/gi;
            const sections = text.match(skillSectionPattern) || [];
            
            for (const section of sections) {
                const singleLetterSkillPattern = new RegExp(`\\b${skill}\\b(?!\\w)`, 'gi');
                if (singleLetterSkillPattern.test(section)) {
                    contexts.push(section);
                }
            }
            return contexts;
        }

        // For normal skills, use word boundary matching
        try {
            const skillRegex = new RegExp(`\\b${this.escapeRegex(skill)}\\b`, 'gi');
            let match;
            while ((match = skillRegex.exec(text)) !== null) {
                // Get surrounding context (50 chars before and after)
                const start = Math.max(0, match.index - 50);
                const end = Math.min(text.length, match.index + skill.length + 50);
                
                // Get the full line or section where skill is mentioned
                const context = text.substring(start, end);
                
                // Validate the context to avoid false positives
                if (this.isValidSkillContext(context, skill)) {
                    contexts.push(context);
                }
            }
        } catch (err) {
            logger.warn(`Error in skill context extraction for ${skill}:`, err);
            // Fallback for problematic patterns
            const safe = skill.replace(/[^a-zA-Z0-9]/g, ' ').trim();
            if (!safe) return contexts;
            
            const lines = text.split('\n');
            for (const line of lines) {
                if (line.toLowerCase().includes(safe.toLowerCase()) && 
                    this.isValidSkillContext(line, skill)) {
                    contexts.push(line);
                }
            }
        }

        let match;
        while ((match = skillRegex.exec(text)) !== null) {
            const start = Math.max(0, match.index - 50);
            const end = Math.min(text.length, match.index + (match[0] ? match[0].length : skill.length) + 50);
            contexts.push(text.substring(start, end));
        }

        return contexts;
    }

    // Validate if a context is a genuine skill mention
    isValidSkillContext(context, skill) {
        const contextLower = context.toLowerCase();
        const skillLower = skill.toLowerCase();

        // Skip if the skill is part of an email address or URL
        if (/@/.test(context) || /http/.test(context)) {
            return false;
        }

        // Check if it's in a relevant section
        const skillSectionIndicators = [
            'skills', 'technologies', 'tech stack', 'tools', 'programming',
            'languages', 'frameworks', 'expertise', 'proficient in',
            'experience with', 'working with', 'knowledge of'
        ];

        const isInSkillSection = skillSectionIndicators.some(indicator => 
            contextLower.includes(indicator.toLowerCase()));

        // For single-letter skills (like 'R'), require stronger validation
        if (skill.length === 1) {
            return isInSkillSection && 
                   new RegExp(`\\b${skill}\\b(?!\\w)`, 'i').test(context) &&
                   !context.match(/[A-Z]\.[A-Z]/); // Avoid matching initials
        }

        // For normal skills, check common patterns
        return isInSkillSection || 
               contextLower.includes(`${skillLower} development`) ||
               contextLower.includes(`${skillLower} programming`) ||
               contextLower.includes(`using ${skillLower}`) ||
               contextLower.includes(`with ${skillLower}`) ||
               /\b(experienced|expert|proficient)\s+in/.test(contextLower);
    }

    // Calculate skill relevance score based on context
    calculateSkillScore(contexts, skill) {
        let score = 0;

        contexts.forEach(context => {
            // Base score for each valid mention
            score += 1;

            const contextLower = context.toLowerCase();
            
            // Boost score based on context quality
            if (contextLower.includes('expert in') || 
                contextLower.includes('specialist') ||
                contextLower.includes('advanced')) {
                score += 3;
            }
            
            // Boost if in skills section
            if (contextLower.includes('skills') || 
                contextLower.includes('technologies') || 
                contextLower.includes('tech stack')) {
                score += 2;
            }

            // Boost if mentioned with experience
            if (/\d+\s*years?/.test(context) || 
                contextLower.includes('experience')) {
                score += 2;
            }

            // Boost if appears in project descriptions
            if (contextLower.includes('project') || 
                contextLower.includes('developed') ||
                contextLower.includes('implemented')) {
                score += 1;
            }
        });

        return score;
    }

    // Enhanced location extraction
    extractLocationWithAI(text) {
        const locationPatterns = [
            // Explicit location mentions
            /(?:location|address|based in|residing in)[:\s]*([^\n]+)/gi,
            /(?:current location)[:\s]*([^\n]+)/gi,

            // Common city, state patterns
            /\b(Hyderabad|Bangalore|Mumbai|Delhi|Chennai|Pune|Kolkata|Ahmedabad)\b/gi,
            /\b([A-Z][a-z]+,\s*[A-Z]{2})\b/g,
            /\b([A-Z][a-z]+\s*[A-Z][a-z]*,\s*[A-Z][a-z]+)\b/g,

            // With country
            /\b([A-Z][a-z]+,\s*India)\b/gi,
            /\b([A-Z][a-z]+,\s*USA?)\b/gi
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

    // Extract professional summary with NLP
    extractSummaryWithAI(text) {
        const summaryKeywords = [
            'summary', 'objective', 'profile', 'career objective', 
            'professional summary', 'about me', 'overview'
        ];

        // Look for explicit summary sections
        for (const keyword of summaryKeywords) {
            const pattern = new RegExp(`${keyword}[:\s]*([^\n]*(?:\n[^\n]*){0,5})`, 'gi');
            const match = text.match(pattern);
            if (match && match[1] && match[1].trim().length > 30) {
                return this.cleanSummary(match[1]);
            }
        }

        // Fallback: look for paragraph-like structures at the beginning
        const sentences = this.sentenceTokenizer.tokenize(text);
        if (sentences.length > 0) {
            const firstSentence = sentences[0];
            if (firstSentence.length > 50 && firstSentence.length < 300) {
                return this.cleanSummary(firstSentence);
            }
        }

        return null;
    }

    // Clean and format summary text
    cleanSummary(summary) {
        return summary
            .replace(/\s+/g, ' ')
            .replace(/^[:\s]+/, '')
            .trim()
            .substring(0, 300);
    }

    // Extract education with better parsing
    extractEducationWithAI(text) {
        const educationPatterns = [
            // Degree patterns
            /(?:bachelor|master|phd|doctorate|b\.?tech|m\.?tech|mba|b\.?sc|m\.?sc|be|me)[\s:]*([^\n]+)/gi,

            // With institutions
            /(\d{4})\s*[-–]\s*(\d{4})\s*([^\n]*(?:university|college|institute|school)[^\n]*)/gi,

            // Education section
            /education[\s:]*([^\n]*(?:\n[^\n]*){0,3})/gi,

            // Institution names
            /(?:university|college|institute)[\s:]*([^\n]+)/gi
        ];

        const educationEntries = new Set();

        educationPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const education = (match && (match[1] || match[3] || match[0])) || '';
                if (education && education.trim().length > 10) {
                    educationEntries.add(education.trim().substring(0, 100));
                }
            }
        });

        return educationEntries.size > 0 ? Array.from(educationEntries).join('; ') : null;
    }

    // Extract projects with AI
    extractProjectsWithAI(text) {
        const projectPatterns = [
            /(?:project|projects)[\s:]*([^\n]*(?:\n[^\n]*){0,4})/gi,
            /(?:title|project title)[\s:]*([^\n]+)/gi,
            /(?:major project)[\s:]*([^\n]*(?:\n[^\n]*){0,3})/gi
        ];

        const projects = new Set();

        projectPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                if (match[1] && match[1].trim().length > 20) {
                    projects.add(match[1].trim().substring(0, 200));
                }
            }
        });

        return projects.size > 0 ? Array.from(projects).slice(0, 3).join('; ') : null;
    }

    // Extract companies with better recognition
    extractCompaniesWithAI(text) {
        const companyPatterns = [
            // Explicit company mentions
            /(?:company|employer|organization)[\s:]*([^\n]+)/gi,

            // Company name patterns (with common suffixes)
            /(\b[A-Z][a-zA-Z\s&]+(?:Ltd|Inc|Corporation|Corp|Company|Technologies|Solutions|Systems|Services|Pvt|Private|Limited)\b)/g,

            // Tech companies
            /(\b(?:Google|Microsoft|Amazon|Apple|Facebook|Meta|Netflix|Tesla|IBM|Oracle|Salesforce|Adobe|Uber|Airbnb|Spotify|Twitter)\b)/gi,

            // Indian companies
            /(\b(?:TCS|Infosys|Wipro|HCL|Accenture|Capgemini|Cognizant|Tech Mahindra|Mindtree|Mphasis)\b)/gi
        ];

        const companies = new Set();

        companyPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const company = match[1] || match[0];
                if (company && company.trim().length > 3 && company.trim().length < 50) {
                    companies.add(company.trim());
                }
            }
        });

        return companies.size > 0 ? Array.from(companies).slice(0, 5).join('; ') : null;
    }

    // Utility method to escape regex special characters
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Main extraction method that uses all AI-enhanced techniques
    extractCandidateInfoAI(text, extractAdditionalFields = false) {
        logger.info('Using AI-enhanced extraction techniques');

        const candidateInfo = {
            name: this.extractNameWithAI(text),
            email: this.extractEmail(text),
            phone: this.extractPhone(text),
            experience: this.extractExperienceWithAI(text),
            linkedinUrl: this.extractLinkedIn(text),
            primarySkills: this.extractSkillsWithAI(text, true),
            secondarySkills: this.extractSkillsWithAI(text, false)
        };

        if (extractAdditionalFields) {
            candidateInfo.additionalFields = {
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

        return candidateInfo;
    }

    // Standard extraction methods (fallback)
    extractEmail(text) {
        const match = text.match(this.emailPatterns[0]);
        return match ? match[0].toLowerCase() : null;
    }

    extractPhone(text) {
        for (const pattern of this.phonePatterns) {
            const match = text.match(pattern);
            if (match) {
                return match[0].replace(/[^\d\+\-\(\)\s]/gi, '').trim();
            }
        }
        return null;
    }

    extractLinkedIn(text) {
        for (const pattern of this.linkedinPatterns) {
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

    extractCertifications(text) {
        const certificationKeywords = [
            'AWS Certified', 'Google Cloud', 'Microsoft Certified', 'Cisco',
            'PMP', 'CISSP', 'CISM', 'CEH', 'OSCP', 'CompTIA', 'Oracle Certified',
            'Salesforce', 'Adobe Certified', 'Red Hat', 'VMware'
        ];

        const found = [];
        const textLower = text.toLowerCase();

        certificationKeywords.forEach(cert => {
            if (textLower.includes(cert.toLowerCase())) {
                found.push(cert);
            }
        });

        return found;
    }

    extractLanguages(text) {
        const languageKeywords = [
            'English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese',
            'Korean', 'Italian', 'Portuguese', 'Russian', 'Arabic', 'Hindi',
            'Telugu', 'Tamil', 'Bengali', 'Marathi', 'Gujarati', 'Kannada'
        ];

        const found = [];
        const textLower = text.toLowerCase();

        languageKeywords.forEach(lang => {
            if (textLower.includes(lang.toLowerCase())) {
                found.push(lang);
            }
        });

        return found;
    }
}

module.exports = new AIEnhancedTextExtractor();