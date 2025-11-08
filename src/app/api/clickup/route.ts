import { NextRequest, NextResponse } from "next/server"

type ClickUpTaskPayload = {
  title?: string
  objective?: string
  acceptanceCriteria?: string
}

type ClickUpTaskResponse = {
  id?: string
  url?: string
  name?: string
  custom_id?: string | null
  task_id?: string | null
}

const DEFAULT_CLICKUP_LIST_ID = "901112286868"

function buildTaskDescription(title: string, objective: string, acceptanceCriteria: string) {
  const sections = ["## Title", title.trim(), "", "## Objective", objective.trim()]

  if (acceptanceCriteria.trim()) {
    sections.push("", "## Acceptance Criteria", acceptanceCriteria.trim())
  }

  return sections.join("\n")
}

export async function POST(request: NextRequest) {
  const { title, objective, acceptanceCriteria }: ClickUpTaskPayload = await request.json()

  if (!title?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        message: "A task title is required to create a ClickUp task.",
      },
      { status: 400 }
    )
  }

  if (!objective?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        message: "Objective is required to create a ClickUp task.",
      },
      { status: 400 }
    )
  }

  const apiToken = process.env.CLICKUP_API_TOKEN
  if (!apiToken) {
    console.error("[Wispr Flow] Missing CLICKUP_API_TOKEN environment variable.")
    return NextResponse.json(
      {
        ok: false,
        message: "ClickUp API token is not configured on the server.",
      },
      { status: 500 }
    )
  }

  const listId = process.env.CLICKUP_LIST_ID || DEFAULT_CLICKUP_LIST_ID
  const body = {
    name: title.trim(),
    markdown_description: buildTaskDescription(title, objective, acceptanceCriteria ?? ""),
    tags: [],
  }

  try {
    const response = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiToken,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[Wispr Flow] ClickUp request failed:", errorText)
      return NextResponse.json(
        {
          ok: false,
          message: "Failed to create the task in ClickUp.",
        },
        { status: response.status }
      )
    }

    const task = (await response.json()) as ClickUpTaskResponse

    return NextResponse.json({
      ok: true,
      task: {
        id: task.id,
        name: task.name ?? title.trim(),
        publicId: task.custom_id || task.task_id || task.id,
        url: task.url,
        listId,
      },
    })
  } catch (error) {
    console.error("[Wispr Flow] Unexpected error creating ClickUp task:", error)
    return NextResponse.json(
      {
        ok: false,
        message: "Unexpected error while creating the ClickUp task.",
      },
      { status: 500 }
    )
  }
}

