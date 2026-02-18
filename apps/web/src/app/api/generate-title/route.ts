import { NextResponse } from "next/server";

import { generateTitle } from "@/lib/ocr/title";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string };
    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const title = await generateTitle(text);
    return NextResponse.json({ title });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Title generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
