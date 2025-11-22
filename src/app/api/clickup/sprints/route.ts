import { NextRequest, NextResponse } from "next/server"

import {
  getSprints,
  findBackEnGeneralList,
  getFirstMondayOfSprint,
  dateToClickUpTimestamp,
  getClickUpTeamId,
  type ClickUpSprint,
} from "@/lib/clickupUtils"
import { saveSprintConfigToFirebase, type SprintConfig } from "@/lib/firebaseSprintConfig"

/**
 * Extract sprint number from sprint name
 * Examples: "Sprint 28", "Sprint28", "Sprint-28", etc.
 */
function extractSprintNumber(name: string): number | null {
  const match = name.match(/\b(\d+)\b/)
  return match ? parseInt(match[1], 10) : null
}

/**
 * Extract dates from sprint name
 * Format: "Sprint 28 (11/16 - 11/22)" or "Sprint 28 (11/16-11/22)"
 * Returns: { startDate: timestamp, endDate: timestamp } or null
 */
function extractDatesFromSprintName(name: string, year: number = 2025): { startDate: number; endDate: number } | null {
  // Match pattern: (MM/DD - MM/DD) or (MM/DD-MM/DD)
  const dateMatch = name.match(/\((\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})\)/)
  
  if (!dateMatch) {
    return null
  }

  const [, startMonth, startDay, endMonth, endDay] = dateMatch.map(Number)

  try {
    // Create dates for the specified year (2025)
    const startDate = new Date(year, startMonth - 1, startDay) // Month is 0-indexed
    const endDate = new Date(year, endMonth - 1, endDay)

    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return null
    }

    return {
      startDate: startDate.getTime(),
      endDate: endDate.getTime(),
    }
  } catch (error) {
    console.warn(`[Sprint Dates] Failed to parse dates from "${name}":`, error)
    return null
  }
}

/**
 * Calculate the first Monday of a sprint based on start date
 * If sprint starts on Monday, return that date. Otherwise, return the next Monday.
 */
function getFirstMondayOfSprintFromDate(startDateTimestamp: number): number {
  const startDate = new Date(startDateTimestamp)
  const dayOfWeek = startDate.getDay() // 0 = Sunday, 1 = Monday, etc.

  let daysUntilMonday: number
  if (dayOfWeek === 1) {
    // Already Monday, return same date
    daysUntilMonday = 0
  } else if (dayOfWeek === 0) {
    // Sunday, next Monday is tomorrow
    daysUntilMonday = 1
  } else {
    // Tuesday-Saturday, calculate days until next Monday
    daysUntilMonday = 8 - dayOfWeek
  }

  const monday = new Date(startDate)
  monday.setDate(startDate.getDate() + daysUntilMonday)
  monday.setHours(0, 0, 0, 0) // Set to start of day

  return monday.getTime()
}

/**
 * Process sprints and return configuration data
 */
export async function GET(request: NextRequest) {
  try {
    const apiToken = process.env.CLICKUP_API_TOKEN
    if (!apiToken) {
      return NextResponse.json(
        {
          ok: false,
          message: "CLICKUP_API_TOKEN is not configured.",
        },
        { status: 500 }
      )
    }

    const teamId = await getClickUpTeamId()
    console.log(`[ClickUp Sprints] Using team ID: ${teamId}`)

    // Get sprints from ClickUp
    const sprints = await getSprints(teamId)
    console.log(`[ClickUp Sprints] Retrieved ${sprints.length} sprints`)

    if (sprints.length === 0) {
      console.warn("[ClickUp Sprints] No sprints found. This might indicate:")
      console.warn("  1. The ClickApp de Sprints is not activated")
      console.warn("  2. There are no sprints in the workspace")
      console.warn("  3. The API endpoint might need different parameters")
    }

    // Find Back en General list
    const backEnGeneralList = await findBackEnGeneralList(teamId)
    console.log(`[ClickUp Sprints] Back en General list: ${backEnGeneralList?.name || "Not found"} (${backEnGeneralList?.id || "N/A"})`)

    // Process each sprint
    const processedSprints: Record<string, SprintConfig> = {}

    if (sprints && Array.isArray(sprints)) {
      for (const sprint of sprints) {
        if (!sprint || !sprint.id) {
          console.warn("[ClickUp Sprints] Skipping invalid sprint:", sprint)
          continue
        }

        const sprintName = sprint.name || "Unnamed Sprint"
        const sprintNumber = extractSprintNumber(sprintName)
        
        // Try to extract dates from sprint name first (for sprints from lists)
        let startDate: number | null = sprint.start_date || null
        let endDate: number | null = sprint.end_date || null
        
        const extractedDates = extractDatesFromSprintName(sprintName)
        if (extractedDates) {
          startDate = extractedDates.startDate
          endDate = extractedDates.endDate
          console.log(`[ClickUp Sprints] Extracted dates from "${sprintName}": ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`)
        }

        // Calculate first Monday based on start date
        let firstMonday: number | null = null
        if (startDate) {
          firstMonday = getFirstMondayOfSprintFromDate(startDate)
          console.log(`[ClickUp Sprints] First Monday for "${sprintName}": ${new Date(firstMonday).toLocaleDateString()}`)
        }

        const sprintConfig: SprintConfig = {
          id: sprint.id,
          name: sprintName,
          number: sprintNumber,
          startDate,
          endDate,
          firstMonday,
          listId: sprint.id, // For sprints from lists, the list ID is the sprint ID
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        processedSprints[sprint.id] = sprintConfig
      }
    } else {
      console.warn("[ClickUp Sprints] Sprints is not an array:", sprints)
    }

    // Save to Firebase
    await saveSprintConfigToFirebase({
      sprints: processedSprints,
      backEnGeneralListId: backEnGeneralList?.id || null,
      lastSync: Date.now(),
    })

    return NextResponse.json({
      ok: true,
      sprints: Object.values(processedSprints),
      backEnGeneralListId: backEnGeneralList?.id || null,
      backEnGeneralListName: backEnGeneralList?.name || null,
      count: sprints.length,
    })
  } catch (error) {
    console.error("[ClickUp Sprints] Error fetching sprints:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const fullError = error instanceof Error ? error.stack : String(error)
    console.error("[ClickUp Sprints] Full error details:", fullError)
    
    return NextResponse.json(
      {
        ok: false,
        message: `Failed to fetch sprints from ClickUp: ${errorMessage}. Check server logs for details.`,
        error: process.env.NODE_ENV === "development" ? fullError : undefined,
      },
      { status: 500 }
    )
  }
}

