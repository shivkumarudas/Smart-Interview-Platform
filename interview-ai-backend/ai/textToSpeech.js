const OpenAI = require("openai");

const SUPPORTED_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar"
]);

const SUPPORTED_FORMATS = new Set(["mp3", "opus", "aac", "flac", "wav", "pcm"]);

let cachedClient = null;

function getOpenAIClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return null;

  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey });
  }
  return cachedClient;
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeVoice(value) {
  const configured = String(value || process.env.TTS_VOICE || "verse")
    .trim()
    .toLowerCase();

  if (SUPPORTED_VOICES.has(configured)) return configured;
  return "verse";
}

function normalizeFormat(value) {
  const configured = String(value || process.env.TTS_RESPONSE_FORMAT || "mp3")
    .trim()
    .toLowerCase();

  if (SUPPORTED_FORMATS.has(configured)) return configured;
  return "mp3";
}

function getContentType(format) {
  switch (format) {
    case "wav":
      return "audio/wav";
    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    case "opus":
      return "audio/ogg";
    case "pcm":
      return "audio/L16";
    case "mp3":
    default:
      return "audio/mpeg";
  }
}

function buildVoiceInstructions({ language, style }) {
  const languageText = String(language || "").trim();
  const styleText = String(style || "").trim();

  const parts = [];
  if (languageText) {
    parts.push(`Speak naturally in ${languageText}.`);
  }
  if (styleText) {
    parts.push(styleText);
  }
  if (!parts.length) {
    parts.push(
      "Use a natural, warm, professional interviewer tone with human-like pacing."
    );
  }
  return parts.join(" ");
}

async function synthesizeSpeech({
  text,
  voice,
  speed,
  language,
  style,
  responseFormat
}) {
  const client = getOpenAIClient();
  if (!client) {
    const error = new Error("OPENAI_API_KEY is not set");
    error.code = "OPENAI_API_KEY_MISSING";
    throw error;
  }

  const cleanText = String(text || "").trim();
  if (!cleanText) {
    throw new Error("Text is required");
  }

  const model = String(process.env.TTS_MODEL || "gpt-4o-mini-tts").trim();
  const selectedVoice = normalizeVoice(voice);
  const selectedFormat = normalizeFormat(responseFormat);
  const selectedSpeed = clampNumber(
    speed,
    0.25,
    4.0,
    clampNumber(process.env.TTS_SPEED, 0.25, 4.0, 1)
  );

  const instructions = buildVoiceInstructions({ language, style });

  const response = await client.audio.speech.create({
    model,
    voice: selectedVoice,
    input: cleanText,
    response_format: selectedFormat,
    speed: selectedSpeed,
    instructions
  });

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  if (!audioBuffer.length) {
    throw new Error("TTS generated empty audio");
  }

  return {
    audioBuffer,
    contentType: getContentType(selectedFormat),
    model,
    voice: selectedVoice,
    speed: selectedSpeed,
    responseFormat: selectedFormat
  };
}

module.exports = {
  synthesizeSpeech
};

