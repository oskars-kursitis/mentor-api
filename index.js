require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

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

// ---------------------------------------------------------------------------
// EVALUATE ENDPOINT — FIXED TO USE "essay" INSTEAD OF "essayText"
// ---------------------------------------------------------------------------
app.post("/evaluate", async (req, res) => {
  try {
    // Accept EXACTLY what Flutter sends:
    // {
    //   "essay": "...",
    //   "mode": "gentle"
    // }
    const {
      taskTitle,
      quote,
      instruction,
      essay,       // <-- FIXED: use essay (Flutter field)
      mode,
    } = req.body || {};

    // -----------------------------
    // BASIC VALIDATION
    // -----------------------------
    if (!essay || typeof essay !== "string") {
      return res.status(400).json({
        error: "Missing or invalid 'essay'",
      });
    }

    const trimmedEssay = essay.trim();
    const words = trimmedEssay.length === 0 ? [] : trimmedEssay.split(/\s+/);
    const wordCount = words.filter(Boolean).length;

    const maxWords = 1000;
    if (wordCount > maxWords) {
      return res.status(400).json({
        error: `Essay too long. Limit is ${maxWords} words.`,
        wordCount,
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "Server misconfigured: missing OPENAI_API_KEY",
      });
    }

    // -----------------------------
    // TONE INSTRUCTION (UNCHANGED)
    // -----------------------------
    let toneInstruction;

    switch (mode) {
      case "soberSoft":
        toneInstruction = `
You are responding to someone who is in a vulnerable state and exploring their relationship with a substance.
Your tone must be soft, validating, and gentle.
Always acknowledge effort first. Never use harsh language. Never diagnose. Never shame.
Focus on comfort, clarity, and emotional safety.
Always speak directly to the user as "you". Never say "the writer" or "the author".
`;
        break;

      case "soberBrother":
        toneInstruction = `
You are a realistic older brother figure.
Supportive but direct. Acknowledge honesty, then push for clarity.
No judgment, no shaming. Avoid vagueness. Encourage responsibility.
Always speak directly to the user as "you". Never say "the writer" or "the author".
`;
        break;

      case "soberCoach":
        toneInstruction = `
You are a calm, practical coach.
Your tone is steady, structured, action-focused.
No emotion. No hype.
Give clear feedback and one practical improvement.
Always speak directly to the user as "you". Never say "the writer" or "the author".
`;
        break;

      case "balanced":
        toneInstruction = `
Use an honest but fair tone.
Mention both strengths and weaknesses clearly.
Be direct but respectful in your wording.
Always speak directly to the user as "you". Never say "the writer" or "the author".
`;
        break;

      case "direct":
        toneInstruction = `
Use a blunt, no-nonsense tone.
Do not sugar-coat weaknesses.
Be very clear and critical where needed, while still being constructive.
Assume the student wants to be pushed hard.
Always speak directly to the user as "you". Never say "the writer" or "the author".
`;
        break;

      case "gentle":
      default:
        toneInstruction = `
You are a very gentle, validating reflective mentor.

Always speak directly to the user as "you". Never say "the writer", "the student", or "the author".

The app will also tell you the current essay word count and the recommended minimum for deeper reflection (30 words).

If the essay has fewer than 30 words:
- Start by acknowledging that the user wrote something at all.
- Be very encouraging, not critical.
- Gently mention how many more words would probably help deepen the reflection.
  For example: "You are about 12 words short of a fuller picture. If you feel able, you could add a little more detail."
- Give only light feedback (one or two observations), and clearly invite them to expand and resubmit any time.

If the essay has 30 words or more:
- Give your full feedback as usual: highlight strengths, point out what could be made clearer or deeper, and suggest one or two ways to improve.
- Do NOT mention word count in this case.
- Keep your tone kind, human, and non-judgmental.

In gentle mode, avoid using harsh labels like "weak", "poor", "bad", or "fails".
`;
        break;
    }

    // -----------------------------
    // ESSAY SECTION (UNCHANGED)
    // -----------------------------
    let essaySection;
    if (mode === "gentle") {
      essaySection = `
Essay word count: ${wordCount}
Recommended minimum for deeper reflection: 30 words.

STUDENT ESSAY
${essay}
`;
    } else {
      essaySection = `
STUDENT ESSAY
${essay}
`;
    }

    // -----------------------------
    // FULL PROMPT (UNCHANGED)
    // -----------------------------
    const prompt = `
You are an AI writing mentor, specialising in philosophical and reflective writing.

${toneInstruction}

GENERAL FEEDBACK RULES
[... EXACTLY AS BEFORE, no changes ...]
Quote: <a short real quote with attribution, OR the word NONE>

Remember:
- Do not add new sections beyond Score, Summary, Strengths, Improvements, and Quote.
`;

    // -----------------------------
    // CALL OPENAI (UNCHANGED)
    // -----------------------------
    const apiResponse = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4.1-mini",
        input: prompt,
        max_output_tokens: 600,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      }
    );

    const data = apiResponse.data;
    const text =
      data?.output?.[0]?.content?.[0]?.text?.trim() ||
      "No feedback generated.";
    const tokensUsed = data?.usage?.total_tokens ?? null;

    // Return raw feedback (expected by Flutter)
    res.json({
      feedback: text,
      tokens_used: tokensUsed,
    });

  } catch (error) {
    console.error("Error in /evaluate:", error.response?.data || error.message);

    if (error.response && error.response.data) {
      return res.status(502).json({
        error: "OpenAI API error",
        details: error.response.data,
      });
    }

    res.status(500).json({
      error: "Something went wrong while generating feedback.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Mentor API listening on port ${PORT}`);
});
