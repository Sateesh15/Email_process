// AI-POWERED Resume Parser using OpenAI GPT-4
// This replaces regex-based extraction with AI for maximum accuracy

const OpenAI = require('openai');
const logger = require('../utils/logger');

class AIResumeExtractor {
  constructor() {
    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here'
    });
    
    this.model = 'gpt-4o-mini'; // Fast and cost-effective
    // Use 'gpt-4o' or 'gpt-4-turbo' for even better accuracy if needed
  }

  /**
   * Extract candidate information using AI with high accuracy
   * @param {string} resumeText - The extracted resume text
   * @param {boolean} extractAdditionalFields - Whether to extract additional fields
   * @returns {Promise<Object>} - Extracted candidate information
   */
  async extractWithAI(resumeText, extractAdditionalFields = false) {
    try {
      logger.info('Starting AI-powered resume extraction...');

      // Create structured prompt for AI
      const prompt = this.buildExtractionPrompt(resumeText, extractAdditionalFields);

      // Call OpenAI API
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert HR resume parser. Extract information with 100% accuracy. Return ONLY valid JSON, no markdown formatting, no code blocks, no additional text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1, // Low temperature for consistent, accurate results
        response_format: { type: 'json_object' } // Ensure JSON response
      });

      // Parse AI response
      const aiResponse = completion.choices[0].message.content;
      logger.info('AI extraction completed successfully');
      
      const extractedData = JSON.parse(aiResponse);
      
      // Validate and clean the extracted data
      return this.validateAndCleanData(extractedData);

    } catch (error) {
      logger.error('AI extraction failed:', error);
      throw new Error(`AI extraction failed: ${error.message}`);
    }
  }

  /**
   * Build comprehensive extraction prompt for AI
   */
  buildExtractionPrompt(resumeText, extractAdditionalFields) {
    const currentDate = new Date().toISOString().split('T')[0];
    
    let prompt = `Extract the following information from this resume with EXTREME accuracy. Current date: ${currentDate}

Resume Text:
${resumeText}

CRITICAL INSTRUCTIONS:
1. Extract EXACT values as they appear in the resume
2. For experience:
   - If resume explicitly states "X years of experience" or "X years of work experience", use that EXACT number
   - Otherwise calculate from work history dates ONLY (not education dates)
   - Exclude internships less than 3 months from total
   - Current year is 2025, use this for "Present" dates
3. For current position/company:
   - Look for "Present" or "Current" in employment section
   - Extract the role and company associated with present/current employment
4. For LinkedIn:
   - Only extract if there's an actual URL (linkedin.com/in/...)
   - If only the word "linkedin" appears without URL, return null
5. For skills:
   - Categorize into primary (programming languages, frameworks, databases) and secondary (tools, methodologies)
   - Include skill even if mentioned with version numbers (e.g., "Java 17" → include "Java")

Return a JSON object with this EXACT structure:
{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "+91-XXXXXXXXXX",
  "experience": "X.X years" or "Not specified",
  "linkedinUrl": "https://linkedin.com/in/username" or null,
  "currentPosition": "Job Title" or null,
  "currentCompany": "Company Name" or null,
  "primarySkills": ["Skill1", "Skill2", ...],
  "secondarySkills": ["Tool1", "Tool2", ...]${extractAdditionalFields ? `,
  "additionalFields": {
    "education": "Education details",
    "location": "City, Country",
    "summary": "Professional summary",
    "certifications": ["Cert1", "Cert2"],
    "languages": ["Language1", "Language2"],
    "projects": "Project details",
    "companies": "Previous companies",
    "totalYearsCalculated": "X.X"
  }` : ''}
}

EXAMPLES OF CORRECT EXTRACTION:

Example 1 - Explicit experience statement:
Text: "Skilled Java developer with 3.9 years of work experience"
Extract: "experience": "3.9 years"

Example 2 - Calculate from work dates only:
Text: "
Education: Jun 2017 – May 2024
Work Experience:
- Internship: Oct 2021 - Dec 2021 (3 months)
- Current: Dec 2024 - Present
"
Extract: "experience": "1.0 years" (NOT 8 years! Don't count education)

Example 3 - Current position:
Text: "Software Engineer, INU Technologies, 04/2024 - Present"
Extract: 
  "currentPosition": "Software Engineer"
  "currentCompany": "INU Technologies"

Example 4 - LinkedIn URL:
Text: "GitHub | linkedin | munnamsateesh@gmail.com"
Extract: "linkedinUrl": null (word only, no URL)

Text: "linkedin.com/in/aravind-r-502b13197"
Extract: "linkedinUrl": "https://linkedin.com/in/aravind-r-502b13197"

NOW EXTRACT FROM THE RESUME ABOVE. Return ONLY the JSON object, nothing else.`;

    return prompt;
  }

  /**
   * Validate and clean extracted data
   */
  validateAndCleanData(data) {
    // Ensure required fields exist
    const cleaned = {
      name: data.name || 'Name Not Found',
      email: data.email || null,
      phone: data.phone ? this.cleanPhone(data.phone) : null,
      experience: data.experience || 'Not specified',
      linkedinUrl: data.linkedinUrl || null,
      currentPosition: data.currentPosition || null,
      currentCompany: data.currentCompany || null,
      primarySkills: Array.isArray(data.primarySkills) ? data.primarySkills.slice(0, 8) : [],
      secondarySkills: Array.isArray(data.secondarySkills) ? data.secondarySkills.slice(0, 8) : []
    };

    // Add additional fields if present
    if (data.additionalFields) {
      cleaned.additionalFields = data.additionalFields;
    }

    // Clean LinkedIn URL
    if (cleaned.linkedinUrl && !cleaned.linkedinUrl.startsWith('http')) {
      cleaned.linkedinUrl = `https://${cleaned.linkedinUrl}`;
    }

    // Validate LinkedIn URL format
    if (cleaned.linkedinUrl && !cleaned.linkedinUrl.includes('linkedin.com/in/')) {
      cleaned.linkedinUrl = null;
    }

    return cleaned;
  }

  /**
   * Clean phone number format
   */
  cleanPhone(phone) {
    return phone.replace(/[^\d\+\-\(\)\s]/g, '').trim();
  }

  /**
   * Batch extract multiple resumes (for better efficiency)
   */
  async batchExtract(resumeTexts, extractAdditionalFields = false) {
    const results = [];
    
    // Process in parallel with rate limiting
    const batchSize = 5; // Process 5 at a time
    for (let i = 0; i < resumeTexts.length; i += batchSize) {
      const batch = resumeTexts.slice(i, i + batchSize);
      const batchPromises = batch.map(text => 
        this.extractWithAI(text, extractAdditionalFields)
          .catch(error => ({ error: error.message }))
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches to avoid rate limits
      if (i + batchSize < resumeTexts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  /**
   * Extract with confidence scoring
   * Returns both the extracted data and confidence scores for each field
   */
  async extractWithConfidence(resumeText, extractAdditionalFields = false) {
    try {
      const extracted = await this.extractWithAI(resumeText, extractAdditionalFields);
      
      // Calculate confidence scores based on data completeness
      const confidence = {
        overall: 0,
        fields: {}
      };

      let totalFields = 0;
      let filledFields = 0;

      const fieldsToCheck = [
        'name', 'email', 'phone', 'experience', 
        'currentPosition', 'currentCompany', 'primarySkills'
      ];

      fieldsToCheck.forEach(field => {
        totalFields++;
        const value = extracted[field];
        
        if (field === 'primarySkills') {
          if (Array.isArray(value) && value.length > 0) {
            filledFields++;
            confidence.fields[field] = Math.min(value.length / 5, 1.0);
          } else {
            confidence.fields[field] = 0;
          }
        } else if (value && value !== 'Not specified' && value !== 'Name Not Found') {
          filledFields++;
          confidence.fields[field] = 1.0;
        } else {
          confidence.fields[field] = 0;
        }
      });

      confidence.overall = filledFields / totalFields;

      return {
        data: extracted,
        confidence: confidence
      };

    } catch (error) {
      logger.error('Confidence extraction failed:', error);
      throw error;
    }
  }
}

module.exports = new AIResumeExtractor();