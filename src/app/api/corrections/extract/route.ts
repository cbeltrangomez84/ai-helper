import { NextRequest, NextResponse } from "next/server"

type ExtractCorrectionsPayload = {
  original: string
  changed: string
}

type CorrectionItem = {
  original: string
  correction: string
}

type OpenAIResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
}

export async function POST(request: NextRequest) {
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

  let payload: ExtractCorrectionsPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Invalid request payload.",
      },
      { status: 400 }
    )
  }

  const { original, changed } = payload

  if (!original?.trim() || !changed?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        message: "Both original and changed text are required.",
      },
      { status: 400 }
    )
  }

  const prompt = `You are a text correction analyzer. Given an original text and a corrected version, extract all the individual word or phrase corrections that were made.

Original text: "${original}"
Corrected text: "${changed}"

Return ONLY a valid JSON array of correction objects. Each object should have "original" and "correction" fields.
Example format:
[
  {"original": "Moquin Gestor", "correction": "Mock Ingestor"},
  {"original": "Sprint Balancer", "correction": "is-print-balancer"}
]

Return ONLY the JSON array, no additional text or explanation.`

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
            content: "You are a text correction analyzer. Return only valid JSON arrays.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[Corrections] OpenAI request failed:", errorText)
      return NextResponse.json(
        {
          ok: false,
          message: "Failed to extract corrections with OpenAI.",
        },
        { status: response.status }
      )
    }

    const data = (await response.json()) as OpenAIResponse
    const content = data.choices?.[0]?.message?.content?.trim() ?? ""

    if (!content) {
      return NextResponse.json(
        {
          ok: false,
          message: "OpenAI returned an empty response.",
        },
        { status: 502 }
      )
    }

    // Parse the JSON response
    let corrections: CorrectionItem[] = []
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        corrections = JSON.parse(jsonMatch[0]) as CorrectionItem[]
      } else {
        corrections = JSON.parse(content) as CorrectionItem[]
      }

      // Validate the structure
      if (!Array.isArray(corrections)) {
        throw new Error("Response is not an array")
      }

      corrections = corrections.filter(
        (item) => item.original && item.correction && typeof item.original === "string" && typeof item.correction === "string"
      )
    } catch (parseError) {
      console.error("[Corrections] Failed to parse OpenAI response:", parseError, "Content:", content)
      return NextResponse.json(
        {
          ok: false,
          message: "Failed to parse corrections from OpenAI response.",
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      corrections,
    })
  } catch (error) {
    console.error("[Corrections] Unexpected error:", error)
    return NextResponse.json(
      {
        ok: false,
        message: "Unexpected error while extracting corrections.",
      },
      { status: 500 }
    )
  }
}

