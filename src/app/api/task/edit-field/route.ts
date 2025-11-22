import { NextRequest, NextResponse } from "next/server"

type EditFieldPayload = {
  field: "title" | "objective" | "acceptanceCriteria"
  currentValue: string
  instruction: string
  context: {
    title: string
    objective: string
    acceptanceCriteria: string
  }
}

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
}

const FIELD_PROMPTS = {
  title: "You are editing the Title field of a task. The title must be a single concise line in English.",
  objective: "You are editing the Objective field of a task. The objective should be a short paragraph in English.",
  acceptanceCriteria: "You are editing the Acceptance Criteria field of a task. The acceptance criteria should be a bullet list (use `-`) in English.",
}

export async function POST(request: NextRequest) {
  const payload: EditFieldPayload = await request.json()
  const { field, currentValue, instruction, context } = payload

  if (!field || !["title", "objective", "acceptanceCriteria"].includes(field)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Invalid field. Must be 'title', 'objective', or 'acceptanceCriteria'.",
      },
      { status: 400 }
    )
  }

  if (!instruction?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        message: "Instruction is required.",
      },
      { status: 400 }
    )
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        message: "OpenAI API key is not configured on the server.",
      },
      { status: 500 }
    )
  }

  const fieldPrompt = FIELD_PROMPTS[field]
  const systemPrompt = `${fieldPrompt}

Apply the user's instruction to modify the current value. Return only the modified value, without any additional explanation or markdown formatting.`

  const userPrompt = `Current ${field}:
${currentValue}

Full task context:
Title: ${context.title}
Objective: ${context.objective}
Acceptance Criteria: ${context.acceptanceCriteria}

User instruction:
${instruction.trim()}

Return only the modified ${field} value.`

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
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.2,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[Task Edit Field] ChatGPT request failed:", errorText)
      return NextResponse.json(
        {
          ok: false,
          message: "Failed to edit field with ChatGPT.",
        },
        { status: response.status }
      )
    }

    const data = (await response.json()) as OpenAIChatResponse
    const newValue = data.choices?.[0]?.message?.content?.trim() ?? ""

    if (!newValue) {
      return NextResponse.json(
        {
          ok: false,
          message: "ChatGPT returned an empty response.",
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      newValue,
    })
  } catch (error) {
    console.error("[Task Edit Field] Unexpected error:", error)
    return NextResponse.json(
      {
        ok: false,
        message: "Unexpected error while editing the field.",
      },
      { status: 500 }
    )
  }
}

