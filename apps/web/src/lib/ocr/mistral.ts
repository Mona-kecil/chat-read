import { Mistral } from "@mistralai/mistralai";
import { env } from "@chat-read/env/web";
import { RequestValidationError } from "@/lib/errors";
import { isHttpUrl } from "@/lib/url";

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
const MARKDOWN_IMAGE_REGEX = /!\[[^\]]*\]\([^)]*\)/g;

const toDataUrl = (rawImage: string) => {
  if (rawImage.startsWith("data:")) {
    return rawImage;
  }

  const mimeType = rawImage.startsWith("/9j/")
    ? "image/jpeg"
    : rawImage.startsWith("R0lGOD")
      ? "image/gif"
      : rawImage.startsWith("UklGR")
        ? "image/webp"
        : "image/png";
  return `data:${mimeType};base64,${rawImage}`;
};

const injectImagePlaceholders = (markdown: string, imageCount: number) => {
  if (imageCount === 0) {
    return markdown;
  }

  const existingCount = markdown.match(MARKDOWN_IMAGE_REGEX)?.length ?? 0;
  const missingCount = imageCount - existingCount;
  if (missingCount <= 0) {
    return markdown;
  }

  const placeholders = Array.from({ length: missingCount }, () => "![]()").join("\n\n");
  return `${markdown.trimEnd()}\n\n${placeholders}`;
};

export const runMistralOcr = async (payload: FormData) => {
  const file = payload.get("file");
  const urlEntry = payload.get("url");
  const url = typeof urlEntry === "string" ? urlEntry : undefined;
  let uploadedImageDataUrl: string | undefined;
  if (!(file instanceof File)) {
    if (!url || url.trim().length === 0) {
      throw new RequestValidationError("Missing file or url");
    }
  }
  if (!env.MISTRAL_API_KEY) {
    throw new Error("Missing MISTRAL_API_KEY");
  }

  let documentPayload:
    | { type: "image_url"; imageUrl: string }
    | { type: "document_url"; documentUrl: string };

  if (file instanceof File) {
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    if (file.type.startsWith("image/")) {
      const dataUrl = `data:${file.type};base64,${base64}`;
      uploadedImageDataUrl = dataUrl;
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
    if (!isHttpUrl(url!.trim())) {
      throw new RequestValidationError("Invalid url");
    }
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

  const pages =
    response.pages?.map((page) => {
      const images =
        page.images?.map((image) => ({
          id: image.id,
          imageBase64: image.imageBase64 ? toDataUrl(image.imageBase64) : null,
        })) ?? [];

      return {
        index: page.index ?? 0,
        markdown: injectImagePlaceholders(page.markdown ?? "", images.length),
        images,
      };
    }) ?? [];

  const hasAnyImage = pages.some((page) => page.images.some((image) => Boolean(image.imageBase64)));
  if (uploadedImageDataUrl && !hasAnyImage) {
    if (pages.length === 0) {
      pages.push({
        index: 0,
        markdown: injectImagePlaceholders("", 1),
        images: [{ id: "uploaded-image", imageBase64: uploadedImageDataUrl }],
      });
    } else {
      const firstPage = pages[0];
      pages[0] = {
        ...firstPage,
        markdown: injectImagePlaceholders(firstPage.markdown, firstPage.images.length + 1),
        images: [...firstPage.images, { id: "uploaded-image", imageBase64: uploadedImageDataUrl }],
      };
    }
  }

  return {
    pages,
    model: response.model ?? MODEL,
  } satisfies MistralOcrResult;
};
