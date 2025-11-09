import { NextRequest, NextResponse } from "next/server"

type DraftSnapshot = {
  title?: string
  objective?: string
  acceptanceCriteria?: string
  formatted?: string
}

type HistoryEntry = {
  version?: number
  transcript?: string
  draft?: DraftSnapshot
}

type Payload = {
  text?: string
  transcript?: string
  mode?: "create" | "edit"
  previousDraft?: DraftSnapshot | null
  history?: HistoryEntry[]
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

const EDIT_PROMPT_INSTRUCTIONS = `${PROMPT_INSTRUCTIONS}

You will receive an existing task specification along with requested modifications expressed in natural language. Apply only the requested changes while preserving all other details. Treat the provided specification as the single source of truth unless a change explicitly overrides it.`

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

function buildCreatePrompt(content: string) {
  return `${PROMPT_INSTRUCTIONS}\n\nContent to format:\n${content.trim()}`
}

function buildEditPrompt({
  baseSpecification,
  changeRequest,
}: {
  baseSpecification: string
  changeRequest: string
}) {
  return `${EDIT_PROMPT_INSTRUCTIONS}

Existing task specification (this is the source of truth to be modified):
${baseSpecification.trim()}

Requested modifications (apply these changes exactly and only where relevant):
${changeRequest.trim()}

Guidelines:
- Preserve sections that are not mentioned in the requested modifications.
- Do not reintroduce details that have been removed in previous revisions.
- Maintain formatting with Title, Objective, and Acceptance Criteria (bullet list) in Markdown.
- If a requested change conflicts with the existing content, follow the requested change.

Return only the updated specification in Markdown.`
}

export async function POST(request: NextRequest) {
  const payload: Payload = await request.json()
  const {
    text,
    transcript,
    mode: rawMode,
    previousDraft,
    history = [],
  } = payload

  const mode: "create" | "edit" = rawMode === "edit" ? "edit" : "create"
  const transcribedInput = (transcript ?? text ?? "").trim()

  console.log("[Wispr Flow] Received payload:", {
    mode,
    hasText: Boolean(text),
    hasTranscript: Boolean(transcript),
    hasPreviousDraft: Boolean(previousDraft?.formatted),
    historyLength: history.length,
  })

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

  if (mode === "create" && !transcribedInput) {
    return NextResponse.json(
      {
        ok: false,
        message: "No text provided to format.",
      },
      { status: 400 }
    )
  }

  if (mode === "edit") {
    if (!previousDraft?.formatted?.trim()) {
      return NextResponse.json(
        {
          ok: false,
          message: "Previous draft is required to process edits.",
        },
        { status: 400 }
      )
    }

    if (!transcribedInput) {
      return NextResponse.json(
        {
          ok: false,
          message: "Edit instructions are empty. Provide the changes you want to apply.",
        },
        { status: 400 }
      )
    }
  }

  const prompt =
    mode === "edit"
      ? buildEditPrompt({
          baseSpecification: previousDraft?.formatted ?? "",
          changeRequest: transcribedInput,
        })
      : buildCreatePrompt(transcribedInput || text || "")

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
      received: transcribedInput || text,
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
