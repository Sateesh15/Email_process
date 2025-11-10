require('dotenv').config();
const { OpenAI } = require('openai');
const natural = require('natural');
const logger = require('./logger');

// ✅ Initialize OpenAI client if API key is available
let client = null;
if (process.env.OPENAI_API_KEY) {
  client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

class AIEnhancedTextExtractor {
  constructor() {
    this.stemmer = natural.PorterStemmer;
    this.tokenizer = new natural.WordTokenizer();
    this.sentenceTokenizer = new natural.SentenceTokenizer();
    this.initializePatterns();
  }

  initializePatterns() {
    this.namePatterns = [
      /^([A-Z][A-Z\s]{8,40})$/m,
      /^([A-Z][a-z]+ [A-Z][a-z]+(?: [A-Z][a-z]+)?)$/m,
      /^([A-Z][A-Z\s]+(?:\.|[A-Z])?)$/m,
      /(?:Name|Candidate)[:\s]*([A-Z][a-zA-Z\s]{3,30})/i,
      /^\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*$/m
    ];

    this.emailPatterns = [ /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi ];
    this.phonePatterns = [
      /(?:\+91[\s-]?)?[6-9]\d{9}\b/g,
      /(?:\+1[\s-]?)?\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4}/g,
      /\+[1-9]\d{0,3}[\s-]?\d{4,14}/g,
      /(?:phone|mobile|cell|tel)[:\s]*([\d\s\-\(\)\+]+)/gi
    ];

    this.experiencePatterns = [
      /(\d+(?:\.\d+)?)\s*(?:\+)?\s*years?\s*(?:of\s+)?experience/gi,
      /experience[:\s]*(\d+(?:\.\d+)?)\s*(?:\+)?\s*years?/gi,
      /(\d+(?:\.\d+)?)\s*(?:\+)?\s*yrs?\s*(?:of\s+)?exp/gi,
      /total\s*experience[:\s]*(\d+(?:\.\d+)?)/gi,
      /(?:over|more than)\s*(\d+(?:\.\d+)?)\s*years?/gi,
      /(\d{4})\s*[-–to]\s*(\d{4}|present|current)/gi
    ];

    this.linkedinPatterns = [
      /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w\-]+\/?/gi,
      /linkedin[:\s]*([\w\-\/\.]+)/gi
    ];

    this.skillCategories = {
      programming: ['JavaScript', 'Python', 'Java', 'C++', 'C#', 'PHP', 'Ruby', 'Go', 'Rust', 'TypeScript', 'Swift', 'Kotlin', 'Scala', 'R', 'MATLAB', 'Dart'],
      web: ['React', 'Angular', 'Vue.js', 'Vue', 'Node.js', 'Express', 'Django', 'Flask', 'Spring', 'ASP.NET', 'Laravel', 'HTML', 'CSS', 'Bootstrap', 'Tailwind', 'jQuery'],
      mobile: ['React Native', 'Flutter', 'Xamarin', 'iOS', 'Android'],
      database: ['MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Cassandra', 'Oracle', 'SQL Server', 'SQLite'],
      cloud: ['AWS', 'Azure', 'GCP', 'Heroku', 'DigitalOcean'],
      devops: ['Docker', 'Kubernetes', 'Jenkins', 'Terraform', 'Ansible'],
      tools: ['Git', 'GitHub', 'JIRA', 'Slack', 'Postman', 'Trello']
    };
  }

  async extractCandidateInfoAI(text, extractAdditionalFields = false) {
  if (client && process.env.OPENAI_API_KEY) {
    try {
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      logger.info(`🔗 Calling OpenAI (${model}) for resume extraction...`);

      const safeText = text.slice(0, 15000);
      const prompt = `
You are an expert resume parser. Extract structured information as valid JSON only with these fields:
{
  "name": string | null,
  "email": string | null,
  "phone": string | null,
  "experience": string | null,
  "linkedinUrl": string | null,
  "primarySkills": [string],
  "secondarySkills": [string],
  "additionalFields": {
    "education": string | null,
    "location": string | null,
    "currentRole": string | null,
    "summary": string | null,
    "certifications": [string],
    "languages": [string],
    "projects": string | null,
    "companies": string | null
  }
}

Extract this data from the following resume text:
---
${safeText}
---
Return only JSON (no explanations).
`;

      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'You are a professional resume parser that returns valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0,
        max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
      });

      // ✅ Handle multiple possible response structures safely
      let output =
        completion.choices?.[0]?.message?.content ||
        completion.output_text ||
        completion.choices?.[0]?.text ||
        '';

      logger.info(`🧾 Raw AI Output (first 200 chars): ${output.slice(0, 200)}`);

      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');

      const parsed = JSON.parse(jsonMatch[0]);
      logger.info('✅ AI extraction successful');
      return this.normalizeResult(parsed);

    } catch (err) {
      logger.error('❌ OpenAI extraction failed:');
      if (err.response?.status) logger.error(`Status: ${err.response.status}`);
      if (err.response?.data) logger.error(`Body: ${JSON.stringify(err.response.data, null, 2)}`);
      else logger.error(err.message || err);

      // 🔁 Fallback to gpt-4o-mini automatically if gpt-5-nano failed
      if (process.env.OPENAI_MODEL === 'gpt-5-nano') {
        logger.warn('⚠️ Falling back to gpt-4o-mini...');
        process.env.OPENAI_MODEL = 'gpt-4o-mini';
        return this.extractCandidateInfoAI(text, extractAdditionalFields);
      }
    }
  }

  // Local fallback
  return this.localExtract(text, extractAdditionalFields);
}



  normalizeResult(parsed) {
    return {
      name: parsed.name || null,
      email: parsed.email || null,
      phone: parsed.phone || null,
      experience: parsed.experience || 'Not specified',
      linkedinUrl: parsed.linkedinUrl || null,
      primarySkills: parsed.primarySkills || [],
      secondarySkills: parsed.secondarySkills || [],
      additionalFields: parsed.additionalFields || {},
    };
  }

  // 🧩 Local fallback extraction
  localExtract(text, extractAdditionalFields = false) {
    logger.info('⚙️ Using local NLP fallback extraction');
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

  // === Helper extraction methods ===
  extractNameWithAI(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const candidates = [];

    for (let i = 0; i < Math.min(lines.length, 8); i++) {
      const line = lines[i];
      if (/^[A-Z][A-Z\s]{8,50}$/.test(line) && !/(WORK|EXPERIENCE|EDUCATION|PROJECT|CERTIFICATION|SKILLS|TOOLS)/i.test(line)) {
        const words = line.split(/\s+/);
        if (words.length >= 2 && words.length <= 5) {
          candidates.push({ name: this.formatName(line), confidence: 0.9, position: i });
        }
      }
    }

    for (let i = 0; i < Math.min(lines.length, 8); i++) {
      const line = lines[i];
      if (/^[A-Z][a-z]+ [A-Z][a-z]+(?: [A-Z][a-z]+)*$/.test(line) && line.length < 50 && !this.isNonNameLine(line)) {
        candidates.push({ name: this.formatName(line), confidence: 0.8, position: i });
      }
    }

    this.namePatterns.forEach(pattern => {
      const match = text.match(pattern);
      if (match && match[1]) candidates.push({ name: this.formatName(match[1]), confidence: 0.7, position: -1 });
    });

    if (candidates.length === 0) return 'Name Not Found';
    candidates.sort((a, b) => b.confidence - a.confidence || a.position - b.position);
    return candidates[0].name;
  }

  isNonNameLine(line) {
  const bad = [
    'profile', 'objective', 'summary', 'education', 'experience',
    'skills', 'key competencies', 'competencies', 'contact', 'email',
    'address', 'qualification', 'projects', 'tools'
  ];
  const lower = line.toLowerCase();
  return bad.some(k => lower.includes(k)) || /@|\+|\d/.test(line) || line.length < 3 || line.length > 50;
}


  formatName(name) {
    return name.replace(/[^a-zA-Z\s]/g, '').trim().replace(/\s+/g, ' ')
      .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

    // 🧠 Improved Experience Extraction (fixed "2015 years" bug)
  extractExperienceWithAI(text) {
    // ✅ Step 1: Direct experience phrases (preferred)
    for (const pattern of this.experiencePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const expVal = parseFloat(match[1]);
        if (expVal > 0 && expVal < 50) {
          return `${expVal} years`;
        }
      }
    }

    // ✅ Step 2: Fallback to year range detection if above fails
    const ranges = this.extractDateRanges(text);
    let total = 0;
    const currentYear = new Date().getFullYear();

    ranges.forEach(r => {
      const start = parseInt(r.start);
      const end = /present|current/i.test(r.end) ? currentYear : parseInt(r.end);

      // Count only if years make sense (skip education years)
      if (start && end && start > 1980 && end >= start && end <= currentYear + 1) {
        const diff = end - start;
        // Skip weird long spans like 30+ years in one line
        if (diff > 0 && diff <= 15) {
          total += diff;
        }
      }
    });

    // ✅ Sanity check — reject absurd totals
    if (total > 0 && total <= 50) return `${total} years`;
    return 'Not specified';
  }

  // 🧩 Helper to extract year ranges safely
  extractDateRanges(text) {
    const out = [];
    const patts = [
      /(\d{4})\s*[-–to]\s*(\d{4}|present|current)/gi,
      /(\w+\s+\d{4})\s*[-–to]\s*(\w+\s+\d{4}|present|current)/gi
    ];
    patts.forEach(p => {
      let m;
      while ((m = p.exec(text)) !== null) {
        out.push({ start: m[1], end: m[2] });
      }
    });
    return out;
  }


  extractSkillsWithAI(text, isPrimary = true) {
    const found = new Map(), lower = text.toLowerCase();
    const cats = isPrimary ? ['programming', 'web', 'mobile', 'database', 'cloud'] : ['devops', 'tools'];
    cats.forEach(cat => {
      this.skillCategories[cat].forEach(skill => {
        const contexts = this.findSkillContexts(lower, skill.toLowerCase());
        if (contexts.length) found.set(skill, { skill, score: this.calcSkillScore(contexts) });
      });
    });
    return Array.from(found.values()).sort((a,b)=>b.score-a.score).map(v=>v.skill).slice(0,isPrimary?8:6);
  }

  findSkillContexts(text, skill) {
    const ctx = [], r = new RegExp(`\\b${this.escapeRegex(skill)}\\b`, 'gi'); let m;
    while ((m = r.exec(text)) !== null) {
      ctx.push(text.substring(Math.max(0, m.index - 50), Math.min(text.length, m.index + skill.length + 50)));
    }
    return ctx;
  }

  calcSkillScore(ctxs) {
    let s = ctxs.length;
    ctxs.forEach(c => {
      if (/(skill|technology|experience|proficient)/.test(c)) s += 2;
      if (/\d+\s*years?/.test(c)) s += 1;
    });
    return s;
  }

  extractLocationWithAI(text) {
    const pats = [/(?:location|address|based in|residing in)[:\s]*([^\n]+)/gi, /(Hyderabad|Bangalore|Mumbai|Delhi|Chennai|Pune|Kolkata|Ahmedabad)/gi];
    for (const p of pats) { const m = text.match(p); if (m) return (m[1]||m[0]).trim(); }
    return null;
  }

  extractSummaryWithAI(text) {
    const keys = ['summary','objective','profile','career objective'];
    for (const k of keys) {
      const r = new RegExp(`${k}[:\\s]*([^\n]{20,300})`, 'i'); const m = text.match(r);
      if (m) return m[1].trim();
    }
    const sents = this.sentenceTokenizer.tokenize(text);
    return sents[0] && sents[0].length < 300 ? sents[0].trim() : null;
  }

  extractEducationWithAI(text) {
    const pats = [/(bachelor|master|phd|b\.?tech|m\.?tech|mba|b\.?sc|m\.?sc)[^\n]+/gi, /education[\s:]*([^\n]*(?:\n[^\n]*){0,3})/gi];
    const out = new Set();
    pats.forEach(p => { let m; while ((m = p.exec(text)) !== null) out.add((m[1]||m[0]).trim().substring(0,100)); });
    return out.size ? Array.from(out).join('; ') : null;
  }

  extractProjectsWithAI(text) {
    const pats = [/(?:project|projects)[\s:]*([^\n]{20,200})/gi];
    const out = new Set(); pats.forEach(p => { let m; while ((m=p.exec(text))!==null) out.add(m[1].trim()); });
    return out.size ? Array.from(out).join('; ') : null;
  }

  extractCompaniesWithAI(text) {
    const pats = [/(company|employer|organization)[:\s]*([^\n]+)/gi,/(\b[A-Z][a-zA-Z\s&]+(?:Ltd|Inc|Corporation|Solutions|Systems|Services)\b)/g];
    const out = new Set(); pats.forEach(p => { let m; while((m=p.exec(text))!==null) out.add((m[2]||m[1]||m[0]).trim()); });
    return out.size ? Array.from(out).join('; ') : null;
  }

  extractCurrentRole(text) {
    const pats = [/(current|working as|role|designation)[:\s]*([^\n]+)/gi];
    for (const p of pats) { const m = text.match(p); if (m) return (m[2]||m[1]).trim().substring(0,50); }
    return null;
  }

  extractCertifications(text) {
    const certs = ['AWS Certified','Google Cloud','Microsoft Certified','PMP','CISSP','CEH','Oracle Certified','Salesforce'];
    const found=[]; const lower=text.toLowerCase(); certs.forEach(c=>{if(lower.includes(c.toLowerCase()))found.push(c);});
    return found;
  }

  extractLanguages(text) {
    const langs=['English','Spanish','French','Hindi','Telugu','Tamil','German','Arabic','Japanese'];
    const found=[]; const lower=text.toLowerCase(); langs.forEach(l=>{if(lower.includes(l.toLowerCase()))found.push(l);});
    return found;
  }

  extractEmail(text) {
    const m = text.match(this.emailPatterns[0]);
    return m ? m[0].toLowerCase() : null;
  }

  extractPhone(text) {
    for (const p of this.phonePatterns) {
      const m = text.match(p);
      if (m) return m[0].replace(/[^\d\+\-\(\)\s]/gi, '').trim();
    }
    return null;
  }

  extractLinkedIn(text) {
    for (const p of this.linkedinPatterns) {
      const m = text.match(p);
      if (m) {
        let url = m[0];
        if (!url.startsWith('http')) {
          const u = url.split('/').pop() || url.replace(/linkedin[:\s]*/, '');
          url = `https://linkedin.com/in/${u}`;
        }
        return url;
      }
    }
    return null;
  }

  escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
}

module.exports = new AIEnhancedTextExtractor();
