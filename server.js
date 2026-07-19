import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

if (!GROQ_API_KEY) {
  console.warn(
    "WARNING: GROQ_API_KEY is not set. Add it to a .env file before running audits."
  );
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const SYSTEM_PROMPT = `You are a senior product manager conducting a structured feature audit for a named consumer app. You have deep, realistic knowledge of how major consumer apps (Uber, Airbnb, Spotify, Instagram, TikTok, Netflix, Amazon, etc.) are actually built, what features they currently have, and how their competitors operate. You are skeptical and rigorous — you do not rubber-stamp ideas, and you actively look for reasons a feature might already exist, might be redundant, or might have a weak metric attached to it.

Given an app name, a proposed feature, and (optionally) a proposed success metric, return your audit as a single valid JSON object and nothing else. No markdown code fences, no preamble, no commentary outside the JSON.

Use exactly this schema:

{
  "verdict": "ship_it" | "proceed_with_caution" | "reject",
  "verdict_rationale": "one sentence explaining the verdict",
  "existing_overlap": {
    "already_exists": true | false,
    "explanation": "1-2 sentences on whether this app already has this feature, a partial version of it, or something serving the same need"
  },
  "scores": {
    "feasibility": { "score": 1-10, "reasoning": "1-2 sentences" },
    "adoption_prediction": { "score": 1-10, "reasoning": "1-2 sentences, include a rough usage estimate framed qualitatively (e.g. niche/moderate/broad adoption)" },
    "novelty": { "score": 1-10, "reasoning": "1-2 sentences, explicitly referencing the existing_overlap finding" },
    "necessity": { "score": 1-10, "reasoning": "1-2 sentences on evidenced user need vs speculative demand" },
    "competitive_edge": { "score": 1-10, "reasoning": "1-2 sentences on whether this differentiates or just closes a gap" }
  },
  "competitive_landscape": [
    { "competitor": "name", "status": "has_it" | "partial" | "does_not_have_it", "note": "short note" }
  ],
  "metric_critique": {
    "user_proposed_metric": "restate what the user proposed, or null if none given",
    "critique": "1-2 sentences on whether the proposed metric is actionable, gameable, or a vanity metric",
    "recommended_primary_metric": "the metric you'd actually track",
    "recommended_guardrail_metrics": ["metric 1", "metric 2"]
  },
  "risks": ["short risk 1", "short risk 2", "short risk 3"],
  "next_step": {
    "recommendation": "ship_as_is" | "run_experiment" | "narrow_scope" | "do_not_build",
    "detail": "1-2 sentences describing the concrete next step and why"
  }
}

Be specific and opinionated. Do not hedge every score to the middle. If a feature is derivative or weak, say so clearly in verdict and reasoning. If the app name given is unfamiliar or fictional, say so honestly rather than inventing details.`;

app.post("/api/audit", async (req, res) => {
  try {
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: "Server is missing GROQ_API_KEY." });
    }

    const { appName, featureIdea, metric } = req.body || {};

    if (!appName || !featureIdea) {
      return res.status(400).json({ error: "appName and featureIdea are required." });
    }

    const userMessage =
      `App: ${appName}\n` +
      `Feature idea: ${featureIdea}\n` +
      `Proposed success metric: ${metric || "none provided"}`;

    const groqResponse = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 1500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text().catch(() => "");
      return res.status(groqResponse.status).json({
        error: `Groq API error (${groqResponse.status}). ${errText}`.trim(),
      });
    }

    const data = await groqResponse.json();
    const rawText = data?.choices?.[0]?.message?.content;

    if (!rawText) {
      return res.status(502).json({ error: "No content returned by the model." });
    }

    const cleaned = rawText
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({ error: "Model response wasn't valid JSON." });
    }

    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unexpected server error." });
  }
});

app.listen(PORT, () => {
  console.log(`Feature Verdict Engine running at http://localhost:${PORT}`);
});