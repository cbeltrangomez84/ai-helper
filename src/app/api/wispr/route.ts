import { NextRequest, NextResponse } from "next/server"

type Payload = {
  text?: string
}

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
}

const PROMPT_INSTRUCTIONS =
  "Format this so it has 2 titles (Objective and Acceptance Criteria using bullets), also check grammar and spelling. Everything should be written in English in md format using ## for every title"

export async function POST(request: NextRequest) {
  const { text }: Payload = await request.json()

  console.log("[Wispr Flow] Received text:", text ?? "<empty>")

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error("[Wispr Flow] Missing OPENAI_API_KEY environment variable.")
    return NextResponse.json(
      {
        ok: false,
        message: "OpenAI API key is not configured on the server.",
      },
      { status: 500 }
    )
  }

  if (!text?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        message: "No text provided to format.",
      },
      { status: 400 }
    )
  }

  const prompt = `${PROMPT_INSTRUCTIONS}\n\nContent to format:\n${text.trim()}`

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an assistant that formats user content into Markdown with clear objectives and acceptance criteria.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[Wispr Flow] ChatGPT request failed:", errorText)
      return NextResponse.json(
        {
          ok: false,
          message: "Failed to format the text with ChatGPT.",
        },
        { status: response.status }
      )
    }

    const data = (await response.json()) as OpenAIChatResponse
    const formatted = data.choices?.[0]?.message?.content?.trim() ?? ""

    console.log("[Wispr Flow] ChatGPT output:", formatted || "<empty response>")

    return NextResponse.json({
      ok: true,
      received: text,
      formatted,
    })
  } catch (error) {
    console.error("[Wispr Flow] Unexpected error calling ChatGPT:", error)
    return NextResponse.json(
      {
        ok: false,
        message: "Unexpected error while formatting the text.",
      },
      { status: 500 }
    )
  }
}

export function GET() {
  return NextResponse.json(
    {
      ok: false,
      message: "Send the transcribed text using a POST request.",
    },
    { status: 405 }
  )
}
