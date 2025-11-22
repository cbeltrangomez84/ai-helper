import { NextRequest, NextResponse } from "next/server"

import { getNextSprintFromConfig, loadSprintConfigFromFirebase } from "@/lib/firebaseSprintConfig"
import { loadTeamMembersFromFirebase } from "@/lib/firebaseTeamMembers"

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
  "Rewrite the provided content so it becomes a task specification in Markdown with three sections using `##` headings: Title, Objective, and Acceptance Criteria. The Title section must contain a single concise line describing ONLY what needs to be done - DO NOT include assignee names, task assignments (like 'Task for X', 'Assign to Y', 'Esta tarea se le hace a X', 'This task is for X'), or any person references in the title. Remove all phrases that assign tasks to people. The Objective section should be a short paragraph. The Acceptance Criteria section must be a bullet list (use `-`). Fix grammar and spelling. Always respond in English."

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

/**
 * Extract time estimate from text
 * Supports formats like: "1.5 horas", "1,5 horas", "2h", "30m", "1d", "1 hora y media", etc.
 * Converts decimal hours to "Xh Ym" format (e.g., "1.5 horas" -> "1h 30m")
 */
function extractTimeEstimate(text: string): string | null {
  const textLower = text.toLowerCase()

  // Patterns to match:
  // - "1.5 horas", "1,5 horas", "2 horas", "1 hora"
  // - "1h", "2h", "30m", "1d"
  // - "1 hora y media", "media hora"
  // - "una hora y media", "dos horas"

  // IMPORTANT: Check "horas y media" FIRST before checking simple decimal hours
  // Match "X horas y media" or "X hora y media": "3 horas y media", "tres horas y media", "3h y media", etc.
  // Also match "X horas y media" with more flexible spacing
  const horasYMediaMatch = textLower.match(/(\d+|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*(?:horas?|h)\s+y\s+media/)
  if (horasYMediaMatch) {
    let hours = 0
    const matchText = horasYMediaMatch[1]
    if (matchText === "tres") {
      hours = 3
    } else if (matchText === "cuatro") {
      hours = 4
    } else if (matchText === "cinco") {
      hours = 5
    } else if (matchText === "seis") {
      hours = 6
    } else if (matchText === "siete") {
      hours = 7
    } else if (matchText === "ocho") {
      hours = 8
    } else if (matchText === "nueve") {
      hours = 9
    } else if (matchText === "diez") {
      hours = 10
    } else {
      hours = parseInt(matchText, 10)
    }
    console.log(`[Wispr] Matched "horas y media": ${matchText} -> ${hours}h 30m`)
    return `${hours}h 30m`
  }

  // Match decimal hours: "1.5 horas", "1,5 horas", "2 horas" (but NOT "X horas y media")
  const decimalHourMatch = textLower.match(/(\d+[,.]\d+)\s*(?:horas?|h(?:\s|$))/)
  if (decimalHourMatch) {
    const hours = parseFloat(decimalHourMatch[1].replace(",", "."))
    const wholeHours = Math.floor(hours)
    const minutes = Math.round((hours - wholeHours) * 60)

    // Convert to "Xh Ym" format
    if (wholeHours > 0 && minutes > 0) {
      return `${wholeHours}h ${minutes}m`
    } else if (wholeHours > 0) {
      return `${wholeHours}h`
    } else if (minutes > 0) {
      return `${minutes}m`
    }
  }

  // Match whole hours: "2 horas", "1 hora" (but NOT "X horas y media")
  const wholeHourMatch = textLower.match(/(\d+)\s*(?:horas?|h)(?:\s|$|[^y])/)
  if (wholeHourMatch && !textLower.includes("y media")) {
    const hours = parseInt(wholeHourMatch[1], 10)
    return `${hours}h`
  }

  // Match "media hora" or "1 hora y media" (without number before)
  if (textLower.includes("media hora") || textLower.includes("hora y media")) {
    return "30m"
  }

  // Match "X minutos" or "X minuto" format: "45 minutos", "30 minutos", etc.
  const minutosMatch = textLower.match(/(\d+)\s*(?:minutos?|min)/)
  if (minutosMatch) {
    const minutes = parseInt(minutosMatch[1], 10)
    // Convert to hours if >= 60 minutes
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60)
      const remainingMinutes = minutes % 60
      if (remainingMinutes > 0) {
        return `${hours}h ${remainingMinutes}m`
      }
      return `${hours}h`
    }
    return `${minutes}m`
  }

  // Match simple formats: "2h", "30m", "1d", "45m"
  const simpleMatch = textLower.match(/(\d+)\s*(h|m|d)(?:\s|$|[^\w])/)
  if (simpleMatch) {
    return `${simpleMatch[1]}${simpleMatch[2]}`
  }

  // Match "una hora", "dos horas", etc. (Spanish numbers)
  const spanishNumbers: Record<string, number> = {
    una: 1,
    un: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
  }

  for (const [word, num] of Object.entries(spanishNumbers)) {
    if (textLower.includes(`${word} hora`) || textLower.includes(`${word} horas`)) {
      return `${num}h`
    }
  }

  return null
}

function buildCreatePrompt(content: string) {
  return `${PROMPT_INSTRUCTIONS}\n\nContent to format:\n${content.trim()}`
}

function buildEditPrompt({ baseSpecification, changeRequest }: { baseSpecification: string; changeRequest: string }) {
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
  const { text, transcript, mode: rawMode, previousDraft, history = [] } = payload

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

    // Generate suggestions for sprint, assignee, and time estimate
    let suggestedSprintId: string | null = null
    let suggestedAssigneeId: string | null = null
    let suggestedTimeEstimate: string | null = null

    if (mode === "create") {
      try {
        // Load sprints and team members
        const sprintConfig = await loadSprintConfigFromFirebase()
        const teamMembersData = await loadTeamMembersFromFirebase()

        // Analyze content to suggest sprint, assignee, and time estimate
        const contentToAnalyze = `${transcribedInput || text} ${sections.title} ${sections.objective} ${sections.acceptanceCriteria}`.toLowerCase()

        // Extract time estimate from content
        suggestedTimeEstimate = extractTimeEstimate(transcribedInput || text || "")

        // Suggest sprint
        if (sprintConfig && sprintConfig.sprints) {
          const sprints = Object.values(sprintConfig.sprints).filter((s) => s && s.id)

          if (sprints.length > 0) {
            // Check if content mentions a sprint number
            const sprintNumberMatch = contentToAnalyze.match(/sprint\s*(\d+)/i)
            if (sprintNumberMatch) {
              const mentionedNumber = parseInt(sprintNumberMatch[1], 10)
              const matchingSprint = sprints.find((s) => s.number === mentionedNumber)
              if (matchingSprint) {
                suggestedSprintId = matchingSprint.id
              }
            }

            // If no specific sprint mentioned, use getNextSprintFromConfig to find next sprint based on current date
            if (!suggestedSprintId) {
              const nextSprint = await getNextSprintFromConfig()
              if (nextSprint) {
                suggestedSprintId = nextSprint.id
              } else {
                // Fallback: use the first sprint if getNextSprintFromConfig returns null
                const sortedSprints = sprints.sort((a, b) => {
                  const now = Date.now()
                  const aIsFuture = a.startDate && a.startDate > now
                  const bIsFuture = b.startDate && b.startDate > now
                  if (aIsFuture && !bIsFuture) return -1
                  if (!aIsFuture && bIsFuture) return 1
                  if (a.number !== null && b.number !== null) {
                    return b.number - a.number
                  }
                  return (b.startDate || 0) - (a.startDate || 0)
                })
                if (sortedSprints.length > 0) {
                  suggestedSprintId = sortedSprints[0].id
                }
              }
            }
          }
        }

        // Suggest assignee based on content
        if (teamMembersData && teamMembersData.members) {
          const members = Object.values(teamMembersData.members).filter((m) => m && m.id)

          // Check if content mentions any howToAddress
          for (const member of members) {
            for (const address of member.howToAddress || []) {
              if (contentToAnalyze.includes(address.toLowerCase())) {
                suggestedAssigneeId = member.id
                break
              }
            }
            if (suggestedAssigneeId) break
          }

          // If no match found, could use AI to analyze, but for now we'll leave it null
        }
      } catch (suggestionError) {
        console.warn("[Wispr Flow] Failed to generate suggestions:", suggestionError)
        // Continue without suggestions
      }
    }

    return NextResponse.json({
      ok: true,
      received: transcribedInput || text,
      formatted: sections.formatted,
      title: sections.title,
      objective: sections.objective,
      acceptanceCriteria: sections.acceptanceCriteria,
      suggestedSprintId,
      suggestedAssigneeId,
      suggestedTimeEstimate,
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
