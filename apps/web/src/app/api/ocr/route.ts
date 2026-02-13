import { NextResponse } from "next/server";
import { runMistralOcr } from "@/lib/ocr/mistral";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const result = await runMistralOcr(formData);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
