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

// Evaluate endpoint
app.post("/evaluate", async (req, res) => {
  try {
    const {
      taskTitle,
      quote,
      instruction,
      essayText,
      mode, // "soberSoft" | "soberBrother" | "soberCoach" | "gentle" | "balanced" | "direct"
    } = req.body || {};

    // -----------------------------
    // BASIC VALIDATION
    // -----------------------------
    if (!essayText || typeof essayText !== "string" || !essayText.trim()) {
      return res.status(400).json({
        error: "Missing or invalid 'essayText'",
      });
    }

    const trimmedEssay = essayText.trim();
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
    // TONE INSTRUCTION (MentorStyle mirror)
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

      // GENTLE (default for Start Here + Sobriety)
      case "gentle":
      default:
        toneInstruction = `
You are a very gentle, validating reflective mentor.

Always speak directly to the user as "you". Never say "the writer", "the student", or "the author".

Your primary job is to:
- Acknowledge whatever they managed to write, even if it is very short.
- Reflect back what you hear in a calm, grounded tone.
- Offer one or two soft suggestions or questions they might explore later.

Do NOT:
- Mention word counts or length.
- Tell them they need to write more or are "short" of anything.
- Give scores, grades, or numeric ratings.
- Use hype, exclamation marks, or therapy clichés.
`;
        break;
    }

    // -----------------------------
    // ESSAY SECTION (no word-count text)
    // -----------------------------
    const essaySection = `
STUDENT ESSAY
${essayText}
`;

    // -----------------------------
    // PROMPT: GENTLE vs SCORED MODES
    // -----------------------------
    let prompt;

    if (mode === "gentle" || !mode) {
      // GENTLE MODE: NO SCORES, NO WORD COUNT, NO PRESSURE
      prompt = `
You are an AI writing mentor, specialising in philosophical and reflective writing.

${toneInstruction}

GENERAL FEEDBACK RULES FOR GENTLE MODE

1) Treat this as someone opening up about something real in their life.
2) Respect the current amount of writing; never pressure them for more.
3) Focus on emotional safety and clarity, not performance.
4) Keep your response short: 1–3 short paragraphs.
5) Use simple, human language.

Give feedback that:
- Briefly reflects what they seem to be feeling or wrestling with.
- Highlights one or two things they are already doing well in their reflection (for example: honesty, specificity, noticing patterns).
- Gently offers one or two questions or angles they COULD explore further if they ever feel ready, without urgency or obligation.

Do NOT:
- Mention word count, length, or "more detail".
- Give any numeric scores or talk about grades or quality levels.
- Sound like a therapist or motivational coach. Stay plain and honest.

TASK
Title: ${taskTitle || ""}
Quote: "${quote || ""}"
Instruction: ${instruction || ""}

${essaySection}

Return ONLY the feedback text as 1–3 short paragraphs.
Do not add headings, bullet points, scores, or quotes.
`;
    } else {
      // ALL OTHER MODES: KEEP THE ORIGINAL SCORING + QUOTE LOGIC
      prompt = `
You are an AI writing mentor, specialising in philosophical and reflective writing.

${toneInstruction}

GENERAL FEEDBACK RULES

1) Always address the user directly as "you". Do NOT use distancing phrases like "the writer", "the author", or "the student".
2) Start by understanding what the user is really trying to say, not just judging the structure.
3) Structure your response exactly in the format requested below.
4) Highlight strengths first, then improvements.
5) Keep feedback specific, not generic.

COUNTERVIEW (ALTERNATIVE PERSPECTIVE) RULES

- Consider whether the user's essay argues mainly from one side of an issue.
- If they already show genuine awareness of the opposite perspective and discuss it fairly, you may skip the alternative perspective.
- If they clearly have not considered the opposite perspective in depth:
  - Briefly introduce a reasonable alternative view as a thought experiment, not as a correction.
  - This alternative perspective must be woven naturally into the Summary paragraph, not placed inside Strengths or Improvements.
  - Do NOT label it as "opposite view" or create a new heading for it.
  - Use soft transitions such as:
      "You might also consider that..."
      "Another angle you could explore is..."
      "Some people in your situation might see it this way..."
- The purpose of the alternative perspective is to expand their lens, not to win a debate or prove them wrong.

QUOTE REWARD RULES

You may optionally include a short, real quote at the end as a "reflection echo" reward, but only if ALL of the following are true:
- The essay tone is calm, reflective, and reasonably coherent (not a rant, not chaotic, not in obvious distress).
- The user does not appear to be in crisis, extreme anger, or deep despair.
- The content feels like thoughtful reflection rather than raw emotional bleeding.

When you DO include a quote:
- It must be a REAL, well-known quote from a non-extremist source (for example: philosophers, psychologists, poets, classic authors).
- NEVER use or quote Adolf Hitler, "Mein Kampf", Nazis, fascist writers, extremist manifestos, hate groups, or violent ideologies.
- Avoid religious fundamentalist or preachy content.
- The quote must be SHORT (1–2 lines) and thematically related to the user's reflection.
- Do NOT invent or "hallucinate" a quote. If you are not confident that a quote is accurate and from a safe, well-known source, output NONE instead.

If any of the safety or tone conditions are not met, or you are unsure:
- Do NOT include a quote. Output "Quote: NONE".

TASK
Title: ${taskTitle || ""}
Quote: "${quote || ""}"
Instruction: ${instruction || ""}

${essaySection}

Mark this essay from 0 to 10, where:
0–3  : very weak, vague, no depth
4–6  : mixed, some insight but poorly structured or shallow
7–8  : solid, clear, honest, and reasonably deep
9–10 : exceptional clarity, depth, and self-honesty

Return your result in EXACTLY this plain-text format:

Score: <number between 0 and 10>
Summary: <3–5 sentences, including any gentle alternative perspective if needed>
Strengths:
- <one short bullet>
- <one short bullet>
Improvements:
- <one short bullet>
- <one short bullet>
Quote: <a short real quote with attribution, OR the word NONE>

Remember:

- Do not add new sections beyond Score, Summary, Strengths, Improvements, and Quote.
`;
    }

    // -----------------------------
    // CALL OPENAI
    // -----------------------------
    const apiResponse = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4.1-mini",
        input: prompt,
        max_output_tokens: mode === "gentle" || !mode ? 400 : 600,
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

    // For now we always return raw feedback text.
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
