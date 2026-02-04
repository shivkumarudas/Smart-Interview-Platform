const axios = require("axios");

async function generateQuestion(profile = {}, config = {}, context = null) {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }

  const role = profile.role || "Software Developer";
  const skills = profile.skills || "Programming, Problem Solving";
  const experience = profile.experience || "Fresher";
  const education = profile.education || "Bachelor's Degree";

  const interviewType = config.interviewType || "Technical";
  const difficulty = config.difficulty || "Easy";

  const contextBlock = context?.question && context?.answer
    ? `
Previous question: ${context.question}
Candidate answer: ${context.answer}

Ask the next interview question based on the candidate's answer.
`
    : "";

  const prompt = `
You are a professional HR interviewer.

Role: ${role}
Skills: ${skills}
Experience: ${experience}
Education: ${education}

Interview type: ${interviewType}
Difficulty: ${difficulty}

${contextBlock}
Ask ONE clear interview question only.
Do not add explanations.
`;

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    const question = response.data?.choices?.[0]?.message?.content;

    if (!question) {
      throw new Error("Groq returned empty response");
    }

    return question.trim();
  } catch (err) {
    console.error("Groq API error:");
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
