import { NextRequest, NextResponse } from "next/server"

import { buildClickUpDescription, parseClickUpDescription } from "@/lib/clickupFormatting"
import { loadSprintConfigFromFirebase, type SprintConfig } from "@/lib/firebaseSprintConfig"

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2"

type ClickUpTask = {
  id: string
  name: string
  description?: string | null
  status?: {
    status: string
    type: string
    color: string
    orderindex?: number
  }
  due_date?: string | null
  start_date?: string | null
  time_estimate?: number | null
  assignees?: Array<{ id: string | number }>
  url?: string
  list?: {
    id: string
    name: string
  }
}

type PlannerTask = {
  id: string
  name: string
  status: string
  dueDate: number | null
  startDate: number | null
  timeEstimate: number | null
  assigneeIds: string[]
  url: string | null
  description: string
  objective: string
  acceptanceCriteria: string
  listId: string | null
  listName: string | null
}

type SprintPlannerUpdatePayload = {
  taskId: string
  currentName?: string
  updates: {
    name?: string
    objective?: string
    acceptanceCriteria?: string
    assigneeId?: string | null
    dueDate?: number | null
    startDate?: number | null
    timeEstimateMs?: number | null
  }
}

function getClickUpToken() {
  const apiToken = process.env.CLICKUP_API_TOKEN
  if (!apiToken) {
    throw new Error("CLICKUP_API_TOKEN is not configured.")
  }
  return apiToken
}

function mapClickUpTask(task: ClickUpTask): PlannerTask {
  const parsedDescription = parseClickUpDescription(task.description || "")
  return {
    id: task.id,
    name: task.name,
    status: task.status?.status || "unknown",
    dueDate: task.due_date ? Number(task.due_date) : null,
    startDate: task.start_date ? Number(task.start_date) : null,
    timeEstimate: typeof task.time_estimate === "number" ? task.time_estimate : null,
    assigneeIds: (task.assignees || []).map((user) => String(user.id)),
    url: task.url || null,
    description: parsedDescription.raw,
    objective: parsedDescription.objective,
    acceptanceCriteria: parsedDescription.acceptanceCriteria,
    listId: task.list?.id ?? null,
    listName: task.list?.name ?? null,
  }
}

function isDoneStatus(task: ClickUpTask): boolean {
  const status = task.status?.status?.toLowerCase() ?? ""
  const type = task.status?.type?.toLowerCase() ?? ""
  return status === "done" || status === "complete" || status === "closed" || type === "done"
}

async function getSprintMeta(sprintId: string): Promise<SprintConfig | null> {
  try {
    const config = await loadSprintConfigFromFirebase()
    if (!config?.sprints) {
      return null
    }
    return config.sprints[sprintId] ?? null
  } catch (error) {
    console.warn("[SprintPlanner] Unable to load sprint metadata from Firebase:", error)
    return null
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sprintId = searchParams.get("sprintId")
  const assigneeId = searchParams.get("assigneeId")
  const includeDone = searchParams.get("includeDone") === "true"

  if (!sprintId) {
    return NextResponse.json({ ok: false, message: "sprintId is required." }, { status: 400 })
  }

  if (!assigneeId) {
    return NextResponse.json({ ok: false, message: "assigneeId is required." }, { status: 400 })
  }

  try {
    const token = getClickUpToken()
    const query = new URLSearchParams({
      subtasks: "true",
      order_by: "due_date",
    })

    const response = await fetch(`${CLICKUP_API_BASE}/list/${sprintId}/task?${query.toString()}`, {
      headers: {
        Authorization: token,
      },
      cache: "no-store",
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[SprintPlanner] ClickUp list fetch failed:", errorText)
      return NextResponse.json({ ok: false, message: "Failed to load sprint tasks from ClickUp." }, { status: response.status })
    }

    const payload = (await response.json()) as { tasks?: ClickUpTask[] }
    const tasks = Array.isArray(payload.tasks) ? payload.tasks : []

    const filtered = tasks
      .filter((task) => includeDone || !isDoneStatus(task))
      .filter((task) => {
        const assigneeIds = (task.assignees || []).map((user) => String(user.id))
        return assigneeIds.includes(String(assigneeId))
      })
      .map(mapClickUpTask)

    const sprintMeta = await getSprintMeta(sprintId)

    return NextResponse.json({
      ok: true,
      sprint: sprintMeta
        ? {
            id: sprintMeta.id,
            name: sprintMeta.name,
            startDate: sprintMeta.startDate,
            endDate: sprintMeta.endDate,
            firstMonday: sprintMeta.firstMonday,
          }
        : { id: sprintId },
      tasks: filtered,
      count: filtered.length,
    })
  } catch (error) {
    console.error("[SprintPlanner] Unexpected error loading tasks:", error)
    return NextResponse.json({ ok: false, message: "Unexpected error loading ClickUp tasks." }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  let payload: SprintPlannerUpdatePayload
  try {
    payload = (await request.json()) as SprintPlannerUpdatePayload
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Invalid JSON payload." }, { status: 400 })
  }

  if (!payload?.taskId || !payload.updates) {
    return NextResponse.json({ ok: false, message: "taskId and updates are required." }, { status: 400 })
  }

  try {
    const token = getClickUpToken()
    const { updates } = payload
    const updateBody: Record<string, unknown> = {}

    if (typeof updates.name === "string") {
      updateBody.name = updates.name.trim()
    }

    if ("objective" in updates || "acceptanceCriteria" in updates) {
      const titleForDescription = typeof updates.name === "string" && updates.name.trim().length > 0 ? updates.name : payload.currentName || "Task"
      updateBody.markdown_description = buildClickUpDescription(titleForDescription, updates.objective ?? "", updates.acceptanceCriteria ?? "")
    }

    if ("dueDate" in updates) {
      updateBody.due_date = updates.dueDate ?? null
    }

    if ("startDate" in updates) {
      updateBody.start_date = updates.startDate ?? null
    } else if ("dueDate" in updates) {
      updateBody.start_date = updates.dueDate ?? null
    }

    if ("timeEstimateMs" in updates) {
      updateBody.time_estimate = typeof updates.timeEstimateMs === "number" ? updates.timeEstimateMs : null
    }

    if ("assigneeId" in updates) {
      if (updates.assigneeId) {
        updateBody.assignees = [updates.assigneeId]
      } else {
        updateBody.assignees = []
      }
    }

    if (Object.keys(updateBody).length === 0) {
      return NextResponse.json({ ok: false, message: "No valid fields provided for update." }, { status: 400 })
    }

    const response = await fetch(`${CLICKUP_API_BASE}/task/${payload.taskId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: token,
      },
      body: JSON.stringify(updateBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[SprintPlanner] Failed to update ClickUp task:", errorText)
      return NextResponse.json({ ok: false, message: "Failed to update ClickUp task." }, { status: response.status })
    }

    const updatedTask = (await response.json()) as ClickUpTask

    return NextResponse.json({
      ok: true,
      task: mapClickUpTask(updatedTask),
    })
  } catch (error) {
    console.error("[SprintPlanner] Unexpected error updating task:", error)
    return NextResponse.json({ ok: false, message: "Unexpected error while updating the task." }, { status: 500 })
  }
}
