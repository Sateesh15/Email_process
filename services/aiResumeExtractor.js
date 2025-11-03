const { Configuration, OpenAIApi } = require('openai');
const logger = require('../utils/logger');
require('dotenv').config();

class AIResumeExtractor {
    constructor() {
        const configuration = new Configuration({
            apiKey: process.env.OPENAI_API_KEY,
        });
        this.openai = new OpenAIApi(configuration);
        
        // Verify API key is configured
        if (!process.env.OPENAI_API_KEY) {
            logger.error('OpenAI API key is not configured! AI extraction will not work.');
        } else {
            logger.info('AI Resume Extractor initialized successfully');
        }
    }

    async quickAnalyze(prompt) {
        try {
            const completion = await this.openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: [{
                    role: "system",
                    content: "You are a specialized resume parser AI. Provide concise, accurate responses."
                }, {
                    role: "user",
                    content: prompt
                }],
                temperature: 0.3,
                max_tokens: 500
            });

            return completion.data.choices[0].message.content.trim();
        } catch (error) {
            logger.error('Quick analyze failed:', error);
            throw error;
        }
    }

    async extractCandidateInfoAI(text, extractAdditionalFields = false) {
        try {
            logger.info('Starting AI-based resume extraction');
            const prompt = this.generatePrompt(text, extractAdditionalFields);
            
            logger.info('Sending request to OpenAI API...');
            const startTime = Date.now();
            
            const completion = await this.openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: [{
                    role: "system",
                    content: "You are a professional HR assistant specialized in parsing resumes. Extract information in a structured format."
                }, {
                    role: "user",
                    content: prompt
                }],
                temperature: 0.3,
                max_tokens: 1000
            });

            const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
            logger.info(`AI processing completed in ${processingTime} seconds`);

            const response = completion.data.choices[0].message.content;
            const parsedResponse = this.parseAIResponse(response);
            
            // Log success metrics
            logger.info('AI Extraction Results:', {
                fieldsExtracted: Object.keys(parsedResponse).length,
                nameFound: !!parsedResponse.name,
                skillsFound: (parsedResponse.primarySkills?.length || 0) + (parsedResponse.secondarySkills?.length || 0),
                processingTime: `${processingTime}s`
            });

            return parsedResponse;

        } catch (error) {
            if (error.response) {
                // OpenAI API error
                logger.error('OpenAI API Error:', {
                    status: error.response.status,
                    message: error.response.data?.error?.message || error.message,
                    code: error.response.data?.error?.code
                });
            } else if (error.request) {
                // Network error
                logger.error('Network Error:', {
                    message: 'Failed to reach OpenAI API',
                    error: error.message
                });
            } else {
                // Other errors
                logger.error('AI Extraction Error:', error.message);
            }
            throw new Error('AI extraction failed: ' + error.message);
        }
    }

    generatePrompt(text, extractAdditionalFields) {
        const basePrompt = `Please analyze this resume text and extract the following information in a JSON format:
- Full Name
- Email
- Phone Number
- Years of Experience (numerical value)
- LinkedIn URL (if available)
- Primary Skills (top technical skills)
- Secondary Skills (other relevant skills)

Resume Text:
${text.substring(0, 3000)} // Limiting text size for token constraints

Please format your response as a valid JSON with these exact keys:
{
    "name": "",
    "email": "",
    "phone": "",
    "experience": "",
    "linkedinUrl": "",
    "primarySkills": [],
    "secondarySkills": []
}`;

        if (extractAdditionalFields) {
            return basePrompt + `
Also include these additional fields:
- Education
- Current Location
- Current Role
- Professional Summary
- Certifications
- Languages
- Notable Projects
- Companies Worked For

Add these as "additionalFields" in the JSON.`;
        }

        return basePrompt;
    }

    parseAIResponse(response) {
        try {
            logger.info('Parsing AI response');
            const parsed = JSON.parse(response);
            
            // Validation results for logging
            const validationResults = {
                name: !!parsed.name,
                email: !!parsed.email,
                phone: !!parsed.phone,
                experience: !!parsed.experience,
                linkedinUrl: !!parsed.linkedinUrl,
                primarySkills: Array.isArray(parsed.primarySkills) && parsed.primarySkills.length > 0,
                secondarySkills: Array.isArray(parsed.secondarySkills) && parsed.secondarySkills.length > 0
            };

            // Log validation results
            logger.info('AI Extraction Validation:', {
                fieldsFound: validationResults,
                confidenceMetrics: {
                    totalFieldsFound: Object.values(validationResults).filter(Boolean).length,
                    percentageComplete: Math.round(
                        (Object.values(validationResults).filter(Boolean).length / 
                        Object.keys(validationResults).length) * 100
                    ) + '%'
                }
            });

            // Normalize the response
            const normalizedResponse = {
                name: parsed.name || null,
                email: parsed.email || null,
                phone: parsed.phone || null,
                experience: parsed.experience ? parsed.experience + ' years' : null,
                linkedinUrl: parsed.linkedinUrl || null,
                primarySkills: Array.isArray(parsed.primarySkills) ? parsed.primarySkills : [],
                secondarySkills: Array.isArray(parsed.secondarySkills) ? parsed.secondarySkills : [],
                additionalFields: parsed.additionalFields || null
            };

            // Log any empty or missing fields
            const missingFields = Object.entries(normalizedResponse)
                .filter(([key, value]) => !value || (Array.isArray(value) && value.length === 0))
                .map(([key]) => key);
            
            if (missingFields.length > 0) {
                logger.warn('AI extraction missing fields:', missingFields);
            }

            return normalizedResponse;
        } catch (error) {
            logger.error('Error parsing AI response:', error);
            return null;
        }
    }
}

module.exports = new AIResumeExtractor();