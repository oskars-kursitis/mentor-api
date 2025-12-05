require("dotenv").config();
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

// Create OpenAI client using API key from env var
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.use(express.json());

// Health endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "mentor-api",
    env: process.env.NODE_ENV || "dev",
  });
});

// Evaluate endpoint
app.post("/evaluate", async (req, res) => {
  try {
    const { essay, mode } = req.body || {};

    if (!essay || typeof essay !== "string") {
      return res.status(400).json({
        error: "Missing or invalid 'essay' text",
      });
    }

    // HARD server-side word limit
    const maxWords = 1000;
    const words = essay.trim().split(/\s+/);
    if (words.length > maxWords) {
      return res.status(400).json({
        error: `Essay too long. Limit is ${maxWords} words.`,
        wordCount: words.length,
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "Server misconfigured: missing OPENAI_API_KEY",
      });
    }

    // Choose tone based on mode
    let toneInstruction;
    switch (mode) {
      case "direct":
        toneInstruction =
          "Be very direct and blunt but still respectful. Focus on weaknesses and how to improve.";
        break;
      case "balanced":
        toneInstruction =
          "Balance encouragement with clear critique. Point out strengths and weaknesses.";
        break;
      case "gentle":
      default:
        toneInstruction =
          "Be gentle and encouraging. Focus mainly on strengths and small,具体 suggestions.";
        break;
    }

    const prompt = `
You are a writing mentor. Give feedback on the user's reflective writing.

Tone: ${toneInstruction}

Requirements:
- 2–4 short paragraphs max
- No scores or numbers
- Do not rewrite the essay, just comment on it
- Be specific and practical

User essay:
"""${essay}"""
`;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
      max_output_tokens: 400,
    });

    const output = response.output[0]?.content[0]?.text || "";
    const tokensUsed = response.usage?.total_tokens ?? null;

    res.json({
      feedback: output,
      score: null,
      tokens_used: tokensUsed,
    });
  } catch (error) {
    console.error("Error in /evaluate:", error);

    return res.status(500).json({
      error: "Something went wrong while generating feedback.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Mentor API listening on port ${PORT}`);
});
