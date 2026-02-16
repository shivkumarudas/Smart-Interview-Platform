const OpenAI = require("openai");
const { toFile } = require("openai/uploads");
const { generateGeminiContent, hasGeminiApiKey, getGeminiModel } = require("./geminiClient");

const MAX_AUDIO_BYTES = 6 * 1024 * 1024;

let cachedOpenAIClient = null;

function getOpenAIClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return null;

  if (!cachedOpenAIClient) {
    cachedOpenAIClient = new OpenAI({ apiKey });
  }
  return cachedOpenAIClient;
}

function getTranscriptionProvider() {
  const openaiClient = getOpenAIClient();
  if (openaiClient) {
    return {
      provider: "openai",
      model: String(process.env.STT_MODEL || "gpt-4o-mini-transcribe").trim(),
      client: openaiClient
    };
  }

  if (hasGeminiApiKey()) {
    return {
      provider: "gemini",
      model: String(process.env.GEMINI_STT_MODEL || getGeminiModel()).trim()
    };
  }

  return null;
}

function normalizeLanguage(language) {
  const value = String(language || "").trim();
  if (!value) return undefined;

  const normalized = value.toLowerCase();

  if (normalized.includes("english")) return "en";
  if (normalized.includes("hindi")) return "hi";

  if (/^[a-z]{2}(-[a-z]{2})?$/i.test(value)) {
    return value.slice(0, 2).toLowerCase();
  }

  return undefined;
}

function extensionFromMimeType(mimeType) {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  if (normalized.includes("ogg")) return "ogg";
  return "webm";
}

function cleanPrompt(prompt) {
  const value = String(prompt || "").trim();
  if (!value) return undefined;
  return value.slice(0, 240);
}

function validateAudioBuffer(audioBuffer) {
  if (!Buffer.isBuffer(audioBuffer) || !audioBuffer.length) {
    throw new Error("Audio buffer is empty");
  }

  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    const err = new Error("Audio is too large. Keep recordings under 6MB.");
    err.code = "AUDIO_TOO_LARGE";
    throw err;
  }
}

async function transcribeSpeech({ audioBuffer, mimeType, language, prompt }) {
  validateAudioBuffer(audioBuffer);

  const provider = getTranscriptionProvider();
  if (!provider) {
    const err = new Error("No transcription API key configured");
    err.code = "STT_API_KEY_MISSING";
    throw err;
  }

  let text = "";
  if (provider.provider === "openai") {
    const audioFile = await toFile(
      audioBuffer,
      `candidate-answer.${extensionFromMimeType(mimeType)}`,
      { type: String(mimeType || "audio/webm").trim() || "audio/webm" }
    );

    const response = await provider.client.audio.transcriptions.create({
      file: audioFile,
      model: provider.model,
      language: normalizeLanguage(language),
      prompt: cleanPrompt(prompt)
    });

    text = String(response?.text || "").trim();
  } else {
    const cleanLanguage = normalizeLanguage(language);
    const languageHint = cleanLanguage
      ? `Language hint: ${cleanLanguage}.`
      : "Language hint: auto-detect.";

    const contextPrompt = cleanPrompt(prompt);
    const instruction = [
      "You are a speech-to-text engine for interview answers.",
      "Transcribe the audio faithfully.",
      "Return only transcript text with no extra explanation.",
      languageHint,
      contextPrompt ? `Context hint: ${contextPrompt}.` : ""
    ]
      .filter(Boolean)
      .join(" ");

    const result = await generateGeminiContent({
      parts: [
        { text: instruction },
        {
          inlineData: {
            mimeType: String(mimeType || "audio/webm").trim() || "audio/webm",
            data: audioBuffer.toString("base64")
          }
        }
      ],
      model: provider.model,
      temperature: 0,
      timeoutMs: 30000
    });

    text = String(result?.raw || "").trim();
  }

  if (!text) {
    throw new Error("Transcription returned empty text");
  }

  return {
    text,
    provider: provider.provider,
    model: provider.model
  };
}

module.exports = {
  transcribeSpeech,
  MAX_AUDIO_BYTES
};
