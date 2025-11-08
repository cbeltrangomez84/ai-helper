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

type ChatGPTSections = {
  title: string
  objective: string
  acceptanceCriteria: string
  formatted: string
}

const PROMPT_INSTRUCTIONS =
  "Rewrite the provided content so it becomes a task specification in Markdown with three sections using `##` headings: Title, Objective, and Acceptance Criteria. The Title section must contain a single concise line. The Objective section should be a short paragraph. The Acceptance Criteria section must be a bullet list (use `-`). Fix grammar and spelling. Always respond in English."

function extractSections(markdown: string): ChatGPTSections {
  const matches = markdown.matchAll(/^##\s+([^\n]+)\n([\s\S]*?)(?=^##\s+|\s*$)/gim)
  const sections: Record<string, string> = {}

  for (const match of matches) {
    const key = match[1]?.trim().toLowerCase()
    const value = match[2]?.trim() ?? ""
    if (key) {
      sections[key] = value
    }
  }

  const title = sections["title"] ?? ""
  const objective = sections["objective"] ?? ""
  const acceptanceCriteria = sections["acceptance criteria"] ?? ""

  return {
    title,
    objective,
    acceptanceCriteria,
    formatted: markdown.trim(),
  }
}

function buildChatGPTPrompt(content: string) {
  return `${PROMPT_INSTRUCTIONS}\n\nContent to format:\n${content.trim()}`
}

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

  const prompt = buildChatGPTPrompt(text)

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

    if (!formatted) {
      console.error("[Wispr Flow] ChatGPT returned an empty response.")
      return NextResponse.json(
        {
          ok: false,
          message: "ChatGPT returned an empty response.",
        },
        { status: 502 }
      )
    }

    const sections = extractSections(formatted)

    console.log("[Wispr Flow] ChatGPT output:", sections.formatted || "<empty response>")

    return NextResponse.json({
      ok: true,
      received: text,
      formatted: sections.formatted,
      title: sections.title,
      objective: sections.objective,
      acceptanceCriteria: sections.acceptanceCriteria,
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
