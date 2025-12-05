require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health endpoint (used by Render and you)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "mentor-api",
    env: process.env.NODE_ENV || "dev"
  });
});

// The endpoint that Mentor app will call
app.post("/evaluate", (req, res) => {
  const { essay, mode } = req.body || {};

  if (!essay || typeof essay !== "string") {
    return res.status(400).json({
      error: "Missing or invalid 'essay' text",
    });
  }

  // HARD server-side word limit (never trust the app)
  const maxWords = 1000;
  const words = essay.trim().split(/\s+/);
  if (words.length > maxWords) {
    return res.status(400).json({
      error: `Essay too long. Limit is ${maxWords} words.`,
      wordCount: words.length,
    });
  }

  // Dummy response for now — placeholder until we add OpenAI
  res.json({
    feedback: `Placeholder ${mode || "gentle"} feedback for an essay of ${words.length} words.`,
    score: null,
    tokens_used: 0
  });
});

app.listen(PORT, () => {
  console.log(`Mentor API listening on port ${PORT}`);
});
