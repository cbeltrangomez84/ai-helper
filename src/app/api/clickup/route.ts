import { NextRequest, NextResponse } from "next/server"

import {
  getBackEnGeneralListIdFromConfig,
  getNextSprintFromConfig,
} from "@/lib/firebaseSprintConfig"

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
  const sections = ["## Objective", objective.trim()]

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
    console.error("[ClickUp] Missing CLICKUP_API_TOKEN environment variable.")
    return NextResponse.json(
      {
        ok: false,
        message: "ClickUp API token is not configured on the server.",
      },
      { status: 500 }
    )
  }

  try {
    // Get "Back en general" list ID from Firebase config
    const backEnGeneralListId = await getBackEnGeneralListIdFromConfig()
    const listId = backEnGeneralListId || process.env.CLICKUP_LIST_ID || DEFAULT_CLICKUP_LIST_ID

    if (!backEnGeneralListId) {
      console.warn("[ClickUp] 'Back en general' list ID not found in config, falling back to default list")
    }

    // Create the task
    const taskBody = {
      name: title.trim(),
      markdown_description: buildTaskDescription(title, objective, acceptanceCriteria ?? ""),
      tags: [],
    }

    const createResponse = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiToken,
      },
      body: JSON.stringify(taskBody),
    })

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      console.error("[ClickUp] Task creation failed:", errorText)
      return NextResponse.json(
        {
          ok: false,
          message: "Failed to create the task in ClickUp.",
        },
        { status: createResponse.status }
      )
    }

    const task = (await createResponse.json()) as ClickUpTaskResponse

    if (!task.id) {
      return NextResponse.json(
        {
          ok: false,
          message: "ClickUp did not return task ID.",
        },
        { status: 500 }
      )
    }

    // Get next sprint from Firebase config and update task
    try {
      const nextSprint = await getNextSprintFromConfig()

      if (nextSprint && nextSprint.firstMonday) {
        // Update task to add sprint and set start date
        const updateBody: {
          sprint_id?: string
          start_date?: number
          date_created?: number
        } = {
          sprint_id: nextSprint.id,
          start_date: nextSprint.firstMonday,
        }

        const updateResponse = await fetch(`https://api.clickup.com/api/v2/task/${task.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: apiToken,
          },
          body: JSON.stringify(updateBody),
        })

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text()
          console.warn("[ClickUp] Failed to update task with sprint and date:", errorText)
          // Don't fail the whole request if sprint update fails
        } else {
          const firstMondayDate = new Date(nextSprint.firstMonday)
          console.log(`[ClickUp] Task ${task.id} added to sprint ${nextSprint.name} with start date ${firstMondayDate.toISOString()}`)
        }
      } else {
        console.warn("[ClickUp] No next sprint found, task created without sprint assignment")
      }
    } catch (sprintError) {
      console.error("[ClickUp] Error updating task with sprint:", sprintError)
      // Don't fail the whole request if sprint logic fails
    }

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
    console.error("[ClickUp] Unexpected error creating ClickUp task:", error)
    const message = error instanceof Error ? error.message : "Unexpected error while creating the ClickUp task."
    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    )
  }
}
