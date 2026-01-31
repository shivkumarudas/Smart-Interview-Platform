const axios = require("axios");

const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  throw new Error("❌ GROQ_API_KEY missing");
}

async function generateQuestion(profile = {}, config = {}) {
  const role = profile.role || "Software Developer";
  const skills = profile.skills || "Programming, Problem Solving";
  const experience = profile.experience || "Fresher";
  const education = profile.education || "Bachelor's Degree";

  const interviewType = config.interviewType || "Technical";
  const difficulty = config.difficulty || "Easy";

  const prompt = `
You are a professional HR interviewer.

Role: ${role}
Skills: ${skills}
Experience: ${experience}
Education: ${education}

Interview type: ${interviewType}
Difficulty: ${difficulty}

Ask ONE clear interview question only.
Do not add explanations.
`;

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant", // ✅ UPDATED MODEL
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const question = response.data?.choices?.[0]?.message?.content;

    if (!question) {
      throw new Error("Groq returned empty response");
    }

    return question.trim();

  } catch (err) {
    console.error("❌ Groq API error:");
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Data:", err.response.data);
    } else {
      console.error(err.message);
    }
    throw err;
  }
}

module.exports = { generateQuestion };
