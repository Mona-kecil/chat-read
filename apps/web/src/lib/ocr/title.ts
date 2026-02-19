import { env } from "@chat-read/env/web";

const MODEL = "google/gemini-2.5-flash-lite-preview-09-2025";

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
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a title extractor. Given a text snippet from a document, identify and output ONLY the document's actual title as found in the text. If no clear title exists, output the main topic in 2-5 words. No quotes, no punctuation at the end, no explanation — just the title.",
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
  const title = data.choices?.[0]?.message?.content?.trim();
  return title || null;
};
