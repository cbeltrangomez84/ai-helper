import { NextRequest, NextResponse } from "next/server"

import { buildClickUpDescription } from "@/lib/clickupFormatting"
import { getBackEnGeneralListIdFromConfig } from "@/lib/firebaseSprintConfig"

type ClickUpTaskPayload = {
  title?: string
  objective?: string
  acceptanceCriteria?: string
  primaryListId?: string | null
  assigneeId?: string | null
  sprintId?: string | null
  startDate?: number | null
  dueDate?: number | null
  timeEstimate?: string | null
}

type ClickUpTaskResponse = {
  id?: string
  url?: string
  name?: string
  custom_id?: string | null
  task_id?: string | null
}

const DEFAULT_CLICKUP_LIST_ID = "901112286868"

/**
 * Parse time estimate string to milliseconds
 * Supports formats like: "2h", "30m", "1d", "2h 30m", "1.5 horas", "1,5 horas", etc.
 * Handles decimal hours (e.g., 1.5 horas = 1h 30m = 5400000 ms)
 */
function parseTimeEstimate(timeStr: string): number {
  const timeStrLower = timeStr.toLowerCase().trim()
  let totalMs = 0

  console.log(`[ClickUp] Parsing time estimate: "${timeStr}"`)

  // First, try to match combined format: "1h 30m", "2h 15m", etc.
  const combinedMatch = timeStrLower.match(/(\d+)\s*h(?:\s+(\d+)\s*m)?/)
  if (combinedMatch) {
    const hours = parseInt(combinedMatch[1], 10)
    const minutes = combinedMatch[2] ? parseInt(combinedMatch[2], 10) : 0
    totalMs = hours * 60 * 60 * 1000 + minutes * 60 * 1000
    console.log(`[ClickUp] Matched combined format: ${hours}h ${minutes}m = ${totalMs} ms`)
    return totalMs
  }

  // Try to match decimal hours: "1.5 horas", "1,5 horas", "1.5h", etc.
  const decimalHourMatch = timeStrLower.match(/(\d+[,.]\d+)\s*(?:horas?|h(?:\s|$))/)
  if (decimalHourMatch) {
    const hours = parseFloat(decimalHourMatch[1].replace(",", "."))
    const wholeHours = Math.floor(hours)
    const minutes = Math.round((hours - wholeHours) * 60)
    totalMs = wholeHours * 60 * 60 * 1000 + minutes * 60 * 1000
    console.log(`[ClickUp] Matched decimal format: ${hours} hours = ${wholeHours}h ${minutes}m = ${totalMs} ms`)
    return totalMs
  }

  // Match patterns like "2h", "30m", "1d" (simple formats)
  const hourMatch = timeStrLower.match(/(\d+)\s*h(?:\s|$)/)
  const minuteMatch = timeStrLower.match(/(\d+)\s*m(?:\s|$)/)
  const dayMatch = timeStrLower.match(/(\d+)\s*d(?:\s|$)/)

  if (dayMatch) {
    const days = parseInt(dayMatch[1], 10)
    totalMs += days * 24 * 60 * 60 * 1000
    console.log(`[ClickUp] Matched days: ${days}d`)
  }
  if (hourMatch) {
    const hours = parseInt(hourMatch[1], 10)
    totalMs += hours * 60 * 60 * 1000
    console.log(`[ClickUp] Matched hours: ${hours}h`)
  }
  if (minuteMatch) {
    const minutes = parseInt(minuteMatch[1], 10)
    totalMs += minutes * 60 * 1000
    console.log(`[ClickUp] Matched minutes: ${minutes}m`)
  }

  console.log(`[ClickUp] Final parsed time: ${totalMs} ms`)
  return totalMs
}

export async function POST(request: NextRequest) {
  const { title, objective, acceptanceCriteria, primaryListId, assigneeId, sprintId, startDate, dueDate, timeEstimate }: ClickUpTaskPayload = await request.json()

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
    // Determine primary list ID (use provided, then config, then default)
    const backEnGeneralListId = await getBackEnGeneralListIdFromConfig()
    const listId = primaryListId || backEnGeneralListId || process.env.CLICKUP_LIST_ID || DEFAULT_CLICKUP_LIST_ID

    if (!primaryListId && !backEnGeneralListId) {
      console.warn("[ClickUp] Primary list ID not provided and 'Back en general' list ID not found in config, falling back to default list")
    }

    // Parse time estimate to milliseconds
    let timeEstimateMs: number | null = null
    if (timeEstimate) {
      timeEstimateMs = parseTimeEstimate(timeEstimate.trim())
      console.log(`[ClickUp] Time estimate input: "${timeEstimate}", parsed to: ${timeEstimateMs} ms`)
      if (timeEstimateMs === 0) {
        console.warn(`[ClickUp] Time estimate parsed to 0, this might be invalid. Original input: "${timeEstimate}"`)
        timeEstimateMs = null // Don't send 0, as it might be invalid
      }
    }

    // Create the task in primary list
    const taskBody: {
      name: string
      markdown_description: string
      tags: string[]
      assignees?: string[]
      start_date?: number
      due_date?: number
      time_estimate?: number
      } = {
        name: title.trim(),
        markdown_description: buildClickUpDescription(title, objective, acceptanceCriteria ?? ""),
      tags: [],
    }

    // Add assignee if provided
    if (assigneeId) {
      taskBody.assignees = [assigneeId]
    }

    // Add start date if provided
    if (startDate) {
      taskBody.start_date = startDate
    }

    // Add due date if provided
    if (dueDate) {
      taskBody.due_date = dueDate
    }

    // Add time estimate if provided
    if (timeEstimateMs !== null && timeEstimateMs > 0) {
      taskBody.time_estimate = timeEstimateMs
      console.log(`[ClickUp] Adding time_estimate to task body: ${timeEstimateMs} ms`)
    } else {
      console.log(`[ClickUp] No time estimate to add (timeEstimateMs: ${timeEstimateMs})`)
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

    // Update task with sprint (as secondary list) and other parameters if needed
    try {
      const updateBody: {
        assignees?: string[]
        start_date?: number
        due_date?: number
        time_estimate?: number
      } = {}

      // Add assignee if not already set in creation
      if (assigneeId && !taskBody.assignees) {
        updateBody.assignees = [assigneeId]
      }

      // Add start date if not already set in creation
      if (startDate && !taskBody.start_date) {
        updateBody.start_date = startDate
      }

      // Add due date if not already set in creation
      if (dueDate && !taskBody.due_date) {
        updateBody.due_date = dueDate
      }

      // Add time estimate if not already set in creation
      if (timeEstimateMs !== null && !taskBody.time_estimate) {
        updateBody.time_estimate = timeEstimateMs
      }

      // If sprint is provided, add it as secondary list and set sprint_id
      if (sprintId) {
        // Update task with sprint_id, start_date, and due_date
        const sprintUpdateBody: {
          sprint_id?: string
          start_date?: number
          due_date?: number
          assignees?: string[]
          time_estimate?: number
        } = {
          sprint_id: sprintId,
        }

        if (startDate) {
          sprintUpdateBody.start_date = startDate
        }

        if (dueDate) {
          sprintUpdateBody.due_date = dueDate
        }

        // Add assignee if provided and not already set
        if (assigneeId && !taskBody.assignees) {
          sprintUpdateBody.assignees = [assigneeId]
        }

        // Add time estimate if provided and not already set
        if (timeEstimateMs !== null && !taskBody.time_estimate) {
          sprintUpdateBody.time_estimate = timeEstimateMs
        }

        const sprintUpdateResponse = await fetch(`https://api.clickup.com/api/v2/task/${task.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: apiToken,
          },
          body: JSON.stringify(sprintUpdateBody),
        })

        if (!sprintUpdateResponse.ok) {
          const errorText = await sprintUpdateResponse.text()
          console.warn("[ClickUp] Failed to update task with sprint:", errorText)
        } else {
          console.log(`[ClickUp] Task ${task.id} updated with sprint ${sprintId}`)
        }

        // Also add task to sprint list as secondary list (if sprintId is a list ID)
        // Note: In ClickUp, sprints can be folders or lists. If it's a list, we add the task to it
        try {
          const addToListResponse = await fetch(`https://api.clickup.com/api/v2/list/${sprintId}/task/${task.id}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: apiToken,
            },
            body: JSON.stringify({}),
          })

          if (addToListResponse.ok) {
            console.log(`[ClickUp] Task ${task.id} also added to sprint list ${sprintId} as secondary list`)
          } else {
            // This is OK - sprint might not be a list, or task might already be in the list
            console.log(`[ClickUp] Note: Could not add task to sprint list (this is OK if sprint is not a list)`)
          }
        } catch (listError) {
          // This is OK - sprint might not be a list
          console.log(`[ClickUp] Note: Could not add task to sprint list (this is OK if sprint is not a list)`)
        }
      }

      // Apply other updates if needed
      if (Object.keys(updateBody).length > 0) {
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
          console.warn("[ClickUp] Failed to update task:", errorText)
        }
      }
    } catch (updateError) {
      console.error("[ClickUp] Error updating task:", updateError)
      // Don't fail the whole request if update fails
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
