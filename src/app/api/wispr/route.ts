import { NextRequest, NextResponse } from "next/server";

type Payload = {
  text?: string;
};

export async function POST(request: NextRequest) {
  const { text }: Payload = await request.json();

  console.log("[Wispr Flow] Received text:", text ?? "<empty>");

  return NextResponse.json({
    ok: true,
    received: text ?? "",
  });
}

export function GET() {
  return NextResponse.json(
    {
      ok: false,
      message: "Send the transcribed text using a POST request.",
    },
    { status: 405 }
  );
}

