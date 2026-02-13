import { Mistral } from "@mistralai/mistralai";
import { env } from "@chat-read/env/web";

export type MistralOcrPage = {
  index: number;
  markdown: string;
  images: Array<{ id: string; imageBase64?: string | null }>;
};

export type MistralOcrResult = {
  pages: MistralOcrPage[];
  model: string;
};

const MODEL = "mistral-ocr-latest";

export const runMistralOcr = async (payload: FormData) => {
  const file = payload.get("file");
  const urlEntry = payload.get("url");
  const url = typeof urlEntry === "string" ? urlEntry : undefined;
  if (!(file instanceof File)) {
    if (!url || url.trim().length === 0) {
      throw new Error("Missing file or url");
    }
  }
  if (!env.MISTRAL_API_KEY) {
    throw new Error("Missing MISTRAL_API_KEY");
  }

  let documentPayload: { type: "image_url"; imageUrl: string } | { type: "document_url"; documentUrl: string };

  if (file instanceof File) {
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    if (file.type.startsWith("image/")) {
      const dataUrl = `data:${file.type};base64,${base64}`;
      documentPayload = {
        type: "image_url",
        imageUrl: dataUrl,
      };
    } else {
      documentPayload = {
        type: "document_url",
        documentUrl: `data:${file.type};base64,${base64}`,
      };
    }
  } else {
    documentPayload = {
      type: "document_url",
      documentUrl: url!.trim(),
    };
  }

  const client = new Mistral({ apiKey: env.MISTRAL_API_KEY });
  const response = await client.ocr.process({
    model: MODEL,
    document: documentPayload,
    includeImageBase64: true,
  });

  return {
    pages:
      response.pages?.map((page) => ({
        index: page.index ?? 0,
        markdown: page.markdown ?? "",
        images:
          page.images?.map((image) => ({
            id: image.id,
            imageBase64: image.imageBase64 ?? null,
          })) ?? [],
      })) ?? [],
    model: response.model ?? MODEL,
  } satisfies MistralOcrResult;
};
