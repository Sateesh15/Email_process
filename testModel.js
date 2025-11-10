require('dotenv').config();
const { OpenAI } = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

(async () => {
  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL,
      messages: [{ role: 'user', content: 'Say hello world in JSON' }],
    });
    console.log('✅ Success:', completion.choices[0].message.content);
  } catch (e) {
    console.error('❌ Error:', e.response?.data || e.message);
  }
})();
