import { env } from "@chat-read/env/web";

import { TITLE_EXTRACTOR_SYSTEM_PROMPT, TITLE_GENERATION_MODEL } from "@/lib/ocr/title-config";
import { finalizeGeneratedTitle } from "@/lib/ocr/title-normalization";

export const generateTitle = async (text: string): Promise<string | null> => {
  if (!env.OPENROUTER_API_KEY) {
    return null;
  }

  const snippet = text.slice(0, 1500);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: TITLE_GENERATION_MODEL,
      messages: [
        {
          role: "system",
          content: TITLE_EXTRACTOR_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: snippet,
        },
      ],
      max_tokens: 30,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const title = data.choices?.[0]?.message?.content;
  const normalizedTitle = typeof title === "string" ? title : null;
  return finalizeGeneratedTitle(normalizedTitle, snippet);
};
