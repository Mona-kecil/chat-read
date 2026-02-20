import { createScorer, evalite } from "evalite";

import { TITLE_EXTRACTOR_SYSTEM_PROMPT, TITLE_GENERATION_MODEL } from "../../lib/ocr/title-config";
import { finalizeGeneratedTitle } from "../../lib/ocr/title-normalization";
import {
  canonicalShapeScorer,
  expectedTitleMatchScorer,
  pairwiseRegressionScorer,
  semanticOverlapScorer,
  type TitleEvalInput,
  type TitleEvalOutput,
} from "./scorers";
import fixtureRows from "./title-generation.fixtures.json";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const LEGACY_SYSTEM_PROMPT =
  "Generate a concise title for the content. Return one line with no explanation.";
const TITLE_JUDGE_SYSTEM_PROMPT =
  'You score title quality from 0 to 1. Reward canonical titles that match expected meaning and avoid wrappers/noise. Reply with JSON only: {"score": number, "rationale": string}.';

const titleEvalMode = process.env.TITLE_EVAL_MODE === "live" ? "live" : "fixture";
const shouldUseLlmJudge = process.env.TITLE_EVAL_USE_LLM_JUDGE === "1";

type PromptVariant = "legacy" | "current";

type FixtureRow = {
  id: string;
  category: string;
  snippet: string;
  expected: string;
  simulatedRaw: Record<PromptVariant, string | null>;
};

const fixtures = fixtureRows as FixtureRow[];

const getPromptByVariant = (variant: PromptVariant): string => {
  if (variant === "current") {
    return TITLE_EXTRACTOR_SYSTEM_PROMPT;
  }

  return LEGACY_SYSTEM_PROMPT;
};

const getModelForEval = (): string => process.env.TITLE_EVAL_MODEL ?? TITLE_GENERATION_MODEL;

const fetchTitleFromOpenRouter = async (
  snippet: string,
  prompt: string,
): Promise<string | null> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY while TITLE_EVAL_MODE=live");
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getModelForEval(),
      messages: [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: snippet.slice(0, 1500),
        },
      ],
      max_tokens: 30,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Title eval OpenRouter call failed: ${response.status} ${response.statusText} (${details})`,
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  return typeof content === "string" ? content : null;
};

const getRawTitle = async (
  input: TitleEvalInput,
  variant: PromptVariant,
): Promise<string | null> => {
  if (titleEvalMode === "fixture") {
    return input.simulatedRaw[variant] ?? null;
  }

  return fetchTitleFromOpenRouter(input.snippet, getPromptByVariant(variant));
};

const runFixtureTask = async (input: TitleEvalInput): Promise<TitleEvalOutput> => {
  const [legacyRaw, currentRaw] = await Promise.all([
    getRawTitle(input, "legacy"),
    getRawTitle(input, "current"),
  ]);

  return {
    source: titleEvalMode,
    legacyRaw,
    currentRaw,
    legacy: finalizeGeneratedTitle(legacyRaw, input.snippet),
    current: finalizeGeneratedTitle(currentRaw, input.snippet),
  };
};

const llmJudgeScorer = createScorer<TitleEvalInput, TitleEvalOutput, string>({
  name: "LLM judge",
  description: "Optional semantic judge for nuanced title correctness",
  scorer: async ({ input, output, expected }) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENROUTER_API_KEY while TITLE_EVAL_USE_LLM_JUDGE=1");
    }

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.TITLE_EVAL_JUDGE_MODEL ?? TITLE_GENERATION_MODEL,
        messages: [
          {
            role: "system",
            content: TITLE_JUDGE_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: JSON.stringify({
              snippet: input.snippet,
              expected,
              candidate: output.current,
            }),
          },
        ],
        temperature: 0,
        max_tokens: 140,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`LLM judge failed: ${response.status} ${response.statusText} (${details})`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;

    let parsed: { score?: number; rationale?: string } | null = null;
    if (typeof rawContent === "string") {
      try {
        parsed = JSON.parse(rawContent) as { score?: number; rationale?: string };
      } catch {
        parsed = null;
      }
    }

    const score = typeof parsed?.score === "number" ? parsed.score : 0;
    const boundedScore = Math.min(1, Math.max(0, score));

    return {
      score: boundedScore,
      metadata: {
        rationale: parsed?.rationale,
        rawContent,
      },
    };
  },
});

const scorers = [
  canonicalShapeScorer,
  expectedTitleMatchScorer,
  semanticOverlapScorer,
  pairwiseRegressionScorer,
];

if (shouldUseLlmJudge) {
  scorers.push(llmJudgeScorer);
}

evalite<TitleEvalInput, TitleEvalOutput, string>("Title generation quality + regression", {
  data: fixtures.map((row) => ({
    input: {
      id: row.id,
      category: row.category,
      snippet: row.snippet,
      simulatedRaw: row.simulatedRaw,
    },
    expected: row.expected,
  })),
  task: runFixtureTask,
  scorers,
  columns: ({ input, output, expected, scores }) => [
    { label: "Fixture", value: input.id },
    { label: "Category", value: input.category },
    { label: "Mode", value: output.source },
    { label: "Expected", value: expected ?? "" },
    { label: "Current", value: output.current ?? "" },
    { label: "Legacy", value: output.legacy ?? "" },
    {
      label: "Regression delta",
      value:
        (
          scores.find((score) => score.name === "Pairwise regression (current >= legacy)")
            ?.metadata as
            | {
                delta?: number;
              }
            | undefined
        )?.delta ?? "n/a",
    },
  ],
  trialCount: 2,
});
