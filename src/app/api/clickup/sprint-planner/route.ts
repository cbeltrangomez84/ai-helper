import { NextRequest, NextResponse } from "next/server"

import { buildClickUpDescription, parseClickUpDescription } from "@/lib/clickupFormatting"
import { loadSprintConfigFromFirebase, getBackEnGeneralListIdFromConfig, type SprintConfig } from "@/lib/firebaseSprintConfig"

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2"

// Control flag for step 3 (team-level search) - set to false during testing as it's very slow
const ENABLE_TEAM_LEVEL_SEARCH = false

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
  list_id?: string
  sprint?: {
    id: string
    name: string
  } | null
  sprint_id?: string | null
  tags?: Array<{
    name: string
    tag_fg?: string
    tag_bg?: string
    creator?: number
  }>
  custom_id?: string | null
  locations?: Array<{
    list_id?: string
    id?: string
    folder_id?: string
    space_id?: string
  }>
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

/**
 * Check if a task belongs to a sprint by verifying:
 * 1. Primary list (home)
 * 2. Secondary locations (locations array)
 */
function taskBelongsToSprint(task: ClickUpTask, sprintListId: string): boolean {
  if (!sprintListId) return false

  const sprintIdStr = String(sprintListId)

  // Method 1: Check primary list (home)
  const primaryListId = String(task.list?.id || task.list_id || "")
  if (primaryListId === sprintIdStr) {
    return true
  }

  // Method 2: Check secondary locations
  if (Array.isArray(task.locations)) {
    return task.locations.some((location) => {
      const locationListId = String(location?.list_id || location?.id || "")
      return locationListId === sprintIdStr
    })
  }

  return false
}

/**
 * Fetch all tasks from a list with pagination
 */
async function fetchTasksFromList(
  listId: string,
  token: string,
  includeClosed: boolean = true
): Promise<ClickUpTask[]> {
  const tasks: ClickUpTask[] = []
  let page = 0
  let hasMore = true

  while (hasMore) {
    const query = new URLSearchParams({
      page: String(page),
      include_closed: String(includeClosed),
      subtasks: "true",
      order_by: "due_date",
    })

    const response = await fetch(`${CLICKUP_API_BASE}/list/${listId}/task?${query.toString()}`, {
      headers: {
        Authorization: token,
      },
      cache: "no-store",
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.warn(`[SprintPlanner] Failed to fetch page ${page} from list ${listId}: ${errorText}`)
      break
    }

    const data = (await response.json()) as { tasks?: ClickUpTask[] }
    const batch = Array.isArray(data.tasks) ? data.tasks : []

    tasks.push(...batch)
    hasMore = batch.length > 0
    page++

    // Safety limit to prevent infinite loops
    if (page > 100) {
      console.warn(`[SprintPlanner] Reached page limit (100) for list ${listId}`)
      break
    }
  }

  return tasks
}

/**
 * Fetch tasks from team/workspace level with pagination
 * CRITICAL: Must use include_location=true to get locations field
 */
async function fetchTasksFromTeam(
  teamId: string,
  token: string,
  sprintListId: string,
  maxPages: number = 20
): Promise<ClickUpTask[]> {
  const sprintTasks: ClickUpTask[] = []
  const seenTaskIds = new Set<string>() // Avoid duplicates
  let page = 0
  let hasMore = true

  while (hasMore && page < maxPages) {
    const query = new URLSearchParams({
      page: String(page),
      include_closed: "true",
      subtasks: "true",
      include_location: "true", // CRITICAL: Without this, locations field won't be included
      order_by: "created",
    })

    const response = await fetch(`${CLICKUP_API_BASE}/team/${teamId}/task?${query.toString()}`, {
      headers: {
        Authorization: token,
      },
      cache: "no-store",
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.warn(`[SprintPlanner] Failed to fetch page ${page} from team: ${errorText}`)
      break
    }

    const data = (await response.json()) as { tasks?: ClickUpTask[] }
    const batch = Array.isArray(data.tasks) ? data.tasks : []

    for (const task of batch) {
      const taskId = String(task.id)

      // Avoid duplicates
      if (seenTaskIds.has(taskId)) continue

      // Check if task belongs to sprint
      if (taskBelongsToSprint(task, sprintListId)) {
        seenTaskIds.add(taskId)
        sprintTasks.push(task)
      }
    }

    hasMore = batch.length > 0
    page++
  }

  return sprintTasks
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
  const assigneeId = searchParams.get("assigneeId") // Optional - if not provided, return all tasks
  const includeDone = searchParams.get("includeDone") === "true"

  console.log(`[SprintPlanner] Request received: sprintId=${sprintId}, assigneeId=${assigneeId || "ALL"}, includeDone=${includeDone}`)

  if (!sprintId) {
    return NextResponse.json({ ok: false, message: "sprintId is required." }, { status: 400 })
  }

  // assigneeId is now optional - if not provided, we return all tasks for the sprint

  try {
    const token = getClickUpToken()
    
    // Get the backend general list ID from config
    const backEnGeneralListId = await getBackEnGeneralListIdFromConfig()
    if (!backEnGeneralListId) {
      return NextResponse.json(
        { ok: false, message: "Backend general list ID not configured. Please sync sprints first." },
        { status: 400 }
      )
    }

    // Get sprint metadata
    const sprintMeta = await getSprintMeta(sprintId)
    const sprintName = sprintMeta?.name || null
    const sprintListId = sprintMeta?.listId || sprintId // Use sprintId as fallback for listId

    // Get team ID
    const teamId = process.env.CLICKUP_TEAM_ID || process.env.CLICKUP_WORKSPACE_ID || "9011185797"

    console.log(`[SprintPlanner] Fetching ALL tasks for sprint_id=${sprintId}${sprintName ? ` (${sprintName})` : ""}`)
    console.log(`[SprintPlanner] Sprint list ID: ${sprintListId}`)
    console.log(`[SprintPlanner] Backend general list ID: ${backEnGeneralListId}`)
    console.log(`[SprintPlanner] Team ID: ${teamId}`)

    // Strategy: Fetch from multiple sources and combine
    const allTasks: ClickUpTask[] = []
    const taskMap = new Map<string, boolean>() // Avoid duplicates

    const addTask = (task: ClickUpTask) => {
      const taskId = String(task.id)
      if (!taskMap.has(taskId)) {
        taskMap.set(taskId, true)
        allTasks.push(task)
      }
    }

    // 1. Fetch tasks directly from sprint list (primary location)
    if (sprintListId) {
      try {
        console.log(`[SprintPlanner] [1/3] Fetching tasks directly from sprint list: ${sprintListId}`)
        const directTasks = await fetchTasksFromList(sprintListId, token, true)
        directTasks.forEach(addTask)
        console.log(`[SprintPlanner] ✓ Found ${directTasks.length} tasks directly in sprint list`)
      } catch (error) {
        console.warn(`[SprintPlanner] Warning: Could not fetch direct sprint tasks:`, error instanceof Error ? error.message : String(error))
      }
    }

    // 2. Fetch from backend general list and filter by locations
    if (backEnGeneralListId) {
      try {
        console.log(`[SprintPlanner] [2/3] Fetching tasks from backend general list: ${backEnGeneralListId}`)
        const backlogTasks = await fetchTasksFromList(backEnGeneralListId, token, true)
        
        // Filter tasks that belong to sprint (check locations)
        const sprintTasksFromBacklog = backlogTasks.filter((task) => taskBelongsToSprint(task, sprintListId))
        sprintTasksFromBacklog.forEach(addTask)
        console.log(`[SprintPlanner] ✓ Found ${sprintTasksFromBacklog.length} tasks in backlog that belong to sprint`)
      } catch (error) {
        console.warn(`[SprintPlanner] Warning: Could not fetch backlog tasks:`, error instanceof Error ? error.message : String(error))
      }
    }

    // 3. Fetch from team level (as last resort, includes all tasks with locations)
    // This step is optional and can be disabled during testing as it's very slow
    if (ENABLE_TEAM_LEVEL_SEARCH) {
      try {
        console.log(`[SprintPlanner] [3/3] Fetching tasks from team level (with include_location=true)`)
        const teamTasks = await fetchTasksFromTeam(teamId, token, sprintListId, 20)
        teamTasks.forEach(addTask)
        console.log(`[SprintPlanner] ✓ Found ${teamTasks.length} tasks from team search`)
      } catch (error) {
        console.warn(`[SprintPlanner] Warning: Could not fetch team tasks:`, error instanceof Error ? error.message : String(error))
      }
    } else {
      console.log(`[SprintPlanner] [3/3] Skipped (ENABLE_TEAM_LEVEL_SEARCH=false)`)
    }

    console.log(`[SprintPlanner] Total unique tasks found for sprint: ${allTasks.length}`)

    // Log sample tasks for debugging
    if (allTasks.length > 0) {
      const sampleTask = allTasks[0]
      console.log(`[SprintPlanner] Sample task: "${sampleTask.name}"`, {
        id: sampleTask.id,
        listId: sampleTask.list?.id,
        listName: sampleTask.list?.name,
        locations: sampleTask.locations?.map((l) => l.list_id || l.id),
        assignees: sampleTask.assignees?.map((a) => String(a.id)),
      })
    }

    // Filter tasks by status first
    let filtered = allTasks.filter((task) => includeDone || !isDoneStatus(task))

    // Filter by assignee if provided (otherwise return all tasks)
    if (assigneeId) {
      filtered = filtered.filter((task) => {
        const assigneeIds = (task.assignees || []).map((user) => String(user.id))
        return assigneeIds.includes(String(assigneeId))
      })
      console.log(`[SprintPlanner] Filtered to ${filtered.length} tasks for assignee ${assigneeId} out of ${allTasks.length} total sprint tasks`)
    } else {
      console.log(`[SprintPlanner] Returning all ${filtered.length} tasks for sprint (no assignee filter)`)
    }

    // Map to PlannerTask format
    const mappedTasks = filtered.map(mapClickUpTask)

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
      tasks: mappedTasks,
      count: mappedTasks.length,
      totalSprintTasks: allTasks.length, // Include total count for reference
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
    
    console.log("[SprintPlanner] PATCH - Received update request:", {
      taskId: payload.taskId,
      currentName: payload.currentName,
      updates: {
        ...updates,
        timeEstimateMs: updates.timeEstimateMs,
        timeEstimateMsType: typeof updates.timeEstimateMs,
        timeEstimateMsFormatted: updates.timeEstimateMs !== null && updates.timeEstimateMs !== undefined 
          ? `${updates.timeEstimateMs}ms (${updates.timeEstimateMs / 3_600_000}h)` 
          : "null/undefined",
      },
    })
    
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
      const timeEstimateValue = typeof updates.timeEstimateMs === "number" ? updates.timeEstimateMs : null
      updateBody.time_estimate = timeEstimateValue
      console.log("[SprintPlanner] PATCH - Setting time_estimate:", {
        timeEstimateMs: updates.timeEstimateMs,
        timeEstimateValue,
        willSendToClickUp: timeEstimateValue,
        formatted: timeEstimateValue !== null ? `${timeEstimateValue}ms (${timeEstimateValue / 3_600_000}h)` : "null",
      })
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

    console.log("[SprintPlanner] PATCH - Sending to ClickUp API:", {
      url: `${CLICKUP_API_BASE}/task/${payload.taskId}`,
      updateBody,
      updateBodyKeys: Object.keys(updateBody),
    })

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

export async function POST(request: NextRequest) {
  let payload: {
    taskId: string
    currentSprintListId: string
    nextSprintListId: string
    nextSprintFirstMonday: number
    currentSprintStartDate: number | null
    currentSprintEndDate: number | null
    taskDueDate: number | null
  }
  try {
    payload = (await request.json()) as typeof payload
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Invalid JSON payload." }, { status: 400 })
  }

  if (!payload?.taskId || !payload.currentSprintListId || !payload.nextSprintListId) {
    return NextResponse.json({ ok: false, message: "taskId, currentSprintListId, and nextSprintListId are required." }, { status: 400 })
  }

  try {
    const token = getClickUpToken()

    // 1. First, fetch the task to see its current structure
    const taskResponse = await fetch(`${CLICKUP_API_BASE}/task/${payload.taskId}?include_location=true`, {
      headers: {
        Authorization: token,
      },
    })

    if (!taskResponse.ok) {
      throw new Error("Failed to fetch current task.")
    }

    const currentTask = (await taskResponse.json()) as ClickUpTask
    const currentSprintListIdStr = String(payload.currentSprintListId)
    const isPrimaryList = String(currentTask.list?.id || currentTask.list_id || "") === currentSprintListIdStr

    // 2. Remove task from current sprint list (only if it's a secondary location)
    // If it's the primary list, we need to change the primary list first
    if (!isPrimaryList) {
      // It's a secondary location, safe to remove
      try {
        const removeResponse = await fetch(`${CLICKUP_API_BASE}/list/${payload.currentSprintListId}/task/${payload.taskId}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: token,
          },
        })

        if (!removeResponse.ok) {
          const errorText = await removeResponse.text()
          console.warn(`[SprintPlanner] Could not remove task from current sprint list: ${errorText}`)
        } else {
          console.log(`[SprintPlanner] Removed task ${payload.taskId} from sprint list ${payload.currentSprintListId} (secondary location)`)
        }
      } catch (error) {
        console.warn(`[SprintPlanner] Error removing task from current sprint list:`, error)
      }
    } else {
      // It's the primary list - we need to get the backend general list to set as primary
      const backEnGeneralListId = await getBackEnGeneralListIdFromConfig()
      if (backEnGeneralListId) {
        // Move task to backend general list as primary, then remove from sprint list
        try {
          // First, add to backend general list (this will make it primary if task is moved)
          const moveToGeneralResponse = await fetch(`${CLICKUP_API_BASE}/list/${backEnGeneralListId}/task/${payload.taskId}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: token,
            },
            body: JSON.stringify({}),
          })

          if (moveToGeneralResponse.ok) {
            console.log(`[SprintPlanner] Moved task ${payload.taskId} to backend general list as primary`)
            
            // Now remove from current sprint list (it should be secondary now)
            const removeResponse = await fetch(`${CLICKUP_API_BASE}/list/${payload.currentSprintListId}/task/${payload.taskId}`, {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                Authorization: token,
              },
            })

            if (removeResponse.ok) {
              console.log(`[SprintPlanner] Removed task ${payload.taskId} from sprint list ${payload.currentSprintListId}`)
            }
          }
        } catch (error) {
          console.warn(`[SprintPlanner] Error moving task from primary sprint list:`, error)
        }
      }
    }

    // 3. Add task to next sprint list as secondary location
    try {
      const addResponse = await fetch(`${CLICKUP_API_BASE}/list/${payload.nextSprintListId}/task/${payload.taskId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
        body: JSON.stringify({}),
      })

      if (!addResponse.ok) {
        const errorText = await addResponse.text()
        console.error(`[SprintPlanner] Failed to add task to next sprint list: ${errorText}`)
        throw new Error("Failed to add task to next sprint list.")
      }

      console.log(`[SprintPlanner] Added task ${payload.taskId} to sprint list ${payload.nextSprintListId} as secondary location`)
    } catch (error) {
      console.error(`[SprintPlanner] Error adding task to next sprint list:`, error)
      throw error
    }

    // 4. Update task dates only if task date is within current sprint range
    // Check if task due date is within current sprint dates
    const shouldUpdateDates =
      payload.taskDueDate !== null &&
      payload.currentSprintStartDate !== null &&
      payload.currentSprintEndDate !== null &&
      payload.taskDueDate >= payload.currentSprintStartDate &&
      payload.taskDueDate <= payload.currentSprintEndDate

    if (shouldUpdateDates) {
      // Task is within sprint dates - move to next sprint's first Monday
      const updateBody: Record<string, unknown> = {
        due_date: payload.nextSprintFirstMonday,
        start_date: payload.nextSprintFirstMonday,
      }

      const updateResponse = await fetch(`${CLICKUP_API_BASE}/task/${payload.taskId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
        body: JSON.stringify(updateBody),
      })

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text()
        console.error(`[SprintPlanner] Failed to update task dates: ${errorText}`)
        throw new Error("Failed to update task dates.")
      }

      console.log(`[SprintPlanner] Updated task dates to next sprint's first Monday (task was within sprint range)`)
    } else {
      // Task is outside sprint dates - keep dates as they are
      console.log(`[SprintPlanner] Task date is outside sprint range - keeping original dates`)
    }

    // 5. Fetch updated task
    const updatedTaskResponse = await fetch(`${CLICKUP_API_BASE}/task/${payload.taskId}?include_location=true`, {
      headers: {
        Authorization: token,
      },
    })

    if (!updatedTaskResponse.ok) {
      throw new Error("Failed to fetch updated task.")
    }

    const updatedTask = (await updatedTaskResponse.json()) as ClickUpTask

    return NextResponse.json({
      ok: true,
      task: mapClickUpTask(updatedTask),
    })
  } catch (error) {
    console.error("[SprintPlanner] Unexpected error moving task to next sprint:", error)
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unexpected error while moving task to next sprint." },
      { status: 500 }
    )
  }
}
