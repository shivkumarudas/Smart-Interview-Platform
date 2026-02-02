const axios = require("axios");

const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function evaluateAnswer(question, answer) {
  const prompt = `
You are an interview evaluator.

Question:
${question}

Candidate Answer:
${answer}

Evaluate the answer and respond in JSON with:
- score (1-10)
- strengths
- improvements
- communication
`;

  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3
    },
    {
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return res.data.choices[0].message.content;
}

module.exports = { evaluateAnswer };
