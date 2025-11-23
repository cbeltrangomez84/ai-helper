import { NextRequest, NextResponse } from "next/server"

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2"

function getClickUpToken() {
  const apiToken = process.env.CLICKUP_API_TOKEN
  if (!apiToken) {
    throw new Error("CLICKUP_API_TOKEN is not configured.")
  }
  return apiToken
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get("taskId")
  const customId = searchParams.get("customId") // e.g., PRNT-4185

  if (!taskId && !customId) {
    return NextResponse.json({ ok: false, message: "taskId or customId is required." }, { status: 400 })
  }

  try {
    const token = getClickUpToken()

    let taskResponse
    let task

    // Try to get task by custom_id first if provided
    if (customId) {
      console.log(`[AnalyzeTask] Trying to find task by custom_id: ${customId}`)
      
      // Get team ID
      const teamId = process.env.CLICKUP_TEAM_ID || process.env.CLICKUP_WORKSPACE_ID || "9011185797"
      
      // Search for task by custom_id
      const searchResponse = await fetch(`${CLICKUP_API_BASE}/team/${teamId}/task?custom_ids[]=${customId}&include_closed=true`, {
        headers: {
          Authorization: token,
        },
        cache: "no-store",
      })

      if (searchResponse.ok) {
        const searchData = await searchResponse.json()
        if (searchData.tasks && searchData.tasks.length > 0) {
          task = searchData.tasks[0]
          console.log(`[AnalyzeTask] Found task by custom_id: ${task.id}`)
        }
      }
    }

    // If not found by custom_id or taskId provided, get by taskId
    if (!task && taskId) {
      console.log(`[AnalyzeTask] Fetching task by ID: ${taskId}`)
      taskResponse = await fetch(`${CLICKUP_API_BASE}/task/${taskId}?include_subtasks=true`, {
        headers: {
          Authorization: token,
        },
        cache: "no-store",
      })

      if (!taskResponse.ok) {
        const errorText = await taskResponse.text()
        console.error("[AnalyzeTask] ClickUp task fetch failed:", errorText)
        return NextResponse.json({ 
          ok: false, 
          message: "Failed to load task from ClickUp.", 
          error: errorText,
          statusCode: taskResponse.status 
        }, { status: taskResponse.status })
      }

      task = await taskResponse.json()
    }

    if (!task) {
      return NextResponse.json({ 
        ok: false, 
        message: "Task not found." 
      }, { status: 404 })
    }

    // Extract ALL relevant fields for analysis
    const analysis = {
      basic: {
        id: task.id,
        name: task.name,
        custom_id: task.custom_id,
        url: task.url,
        status: task.status,
      },
      sprint: {
        sprint_id: task.sprint_id,
        sprint: task.sprint,
        // Check if sprint is nested somewhere else
        sprint_name: task.sprint?.name,
        sprint_id_from_sprint: task.sprint?.id,
      },
      assignment: {
        assignees: task.assignees,
        assignee_ids: task.assignees?.map((a: any) => String(a.id)),
        assignee_names: task.assignees?.map((a: any) => a.username || a.name),
      },
      list: {
        list_id: task.list?.id,
        list_name: task.list?.name,
      },
      tags: {
        tags: task.tags,
        tag_names: task.tags?.map((t: any) => t.name),
      },
      dates: {
        due_date: task.due_date,
        start_date: task.start_date,
        date_created: task.date_created,
        date_updated: task.date_updated,
      },
      // Include full task object for complete analysis
      fullTask: task,
    }

    return NextResponse.json({
      ok: true,
      analysis,
      message: "Task analyzed successfully. Check the 'analysis' object for details.",
    })
  } catch (error) {
    console.error("[AnalyzeTask] Unexpected error:", error)
    return NextResponse.json({ 
      ok: false, 
      message: "Unexpected error analyzing task.", 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

