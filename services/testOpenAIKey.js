require('dotenv').config();
const OpenAI = require('openai');

(async () => {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    console.log('🔗 Testing OpenAI API connectivity...');
    const res = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      input: "Return the JSON { 'ok': true, 'message': 'API connection working' }"
    });

    console.log("✅ Success:", res.output_text || res.choices?.[0]?.message?.content);
  } catch (e) {
    console.error("❌ Failed to connect:", e.message, e.status || e.code);
  }
})();
