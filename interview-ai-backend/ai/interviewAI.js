const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function generateQuestion(profile, config) {
  const prompt = `
You are a professional HR interviewer.

Candidate details:
Role: ${profile.role}
Skills: ${profile.skills}
Experience: ${profile.experience}
Education: ${profile.education}

Interview type: ${config.interviewType}
Difficulty: ${config.difficulty}

Ask ONE clear interview question.
Do not add explanations.
`;

  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "user", content: prompt }
    ],
    temperature: 0.7
  });

  return response.choices[0].message.content.trim();
}

module.exports = { generateQuestion };
