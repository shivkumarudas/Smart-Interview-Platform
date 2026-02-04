const axios = require("axios");

async function evaluateAnswer(question, answer) {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }

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
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );

  const content = res.data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Groq returned empty response");
  }

  return content.trim();
}

module.exports = { evaluateAnswer };
