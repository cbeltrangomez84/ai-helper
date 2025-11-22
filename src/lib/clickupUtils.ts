type ClickUpSprint = {
  id: string
  name: string
  start_date: number | null
  end_date: number | null
  status: "open" | "closed"
}

type ClickUpList = {
  id: string
  name: string
  archived?: boolean
  folder?: {
    id: string
    name: string
  }
}

type ClickUpTeam = {
  id: string
  name: string
}

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2"

async function getClickUpApiToken(): Promise<string> {
  const apiToken = process.env.CLICKUP_API_TOKEN
  if (!apiToken) {
    throw new Error("CLICKUP_API_TOKEN is not configured")
  }
  return apiToken
}

export async function getClickUpTeamId(): Promise<string> {
  // Try CLICKUP_TEAM_ID first, then CLICKUP_WORKSPACE_ID, then use default
  const teamId = process.env.CLICKUP_TEAM_ID || process.env.CLICKUP_WORKSPACE_ID || "9011185797"
  return teamId
}

async function clickUpRequest<T>(endpoint: string): Promise<T> {
  const apiToken = await getClickUpApiToken()
  const response = await fetch(`${CLICKUP_API_BASE}${endpoint}`, {
    headers: {
      Authorization: apiToken,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`ClickUp API error: ${errorText}`)
  }

  return response.json()
}

/**
 * Get all teams (workspaces) for the authenticated user
 */
export async function getTeams(): Promise<ClickUpTeam[]> {
  const response = await clickUpRequest<{ teams: ClickUpTeam[] }>("/team")
  return response.teams || []
}

/**
 * Get sprints via direct team endpoint (Method 1)
 */
async function fetchSprintsViaTeamEndpoint(teamId: string): Promise<ClickUpSprint[] | null> {
  try {
    const response = await clickUpRequest<{ sprints?: ClickUpSprint[] }>(`/team/${teamId}/sprint?include_closed=true`)
    const sprints = response.sprints || []
    if (sprints.length > 0) {
      console.log(`[ClickUp] Fetched ${sprints.length} sprints via team endpoint`)
      return sprints
    }
    return null
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      console.log("[ClickUp] Team sprint endpoint not available (404), will try fallback method")
      return null
    }
    console.warn("[ClickUp] Error fetching sprints via team endpoint:", error)
    return null
  }
}

/**
 * Get sprints by navigating through spaces and folders (Method 2 - Fallback)
 */
async function fetchSprintsFromLists(teamId: string): Promise<ClickUpSprint[]> {
  const sprints: ClickUpSprint[] = []
  
  try {
    // 1. Get spaces
    const spaces = await getSpaces(teamId)
    console.log(`[ClickUp] Found ${spaces.length} spaces`)
    
    // 2. For each space, get folders
    for (const space of spaces) {
      try {
        const folders = await getFolders(space.id)
        console.log(`[ClickUp] Space "${space.name}" has ${folders.length} folders`)
        
        // 3. Filter folders named "Sprints" (case-insensitive)
        const sprintFolders = folders.filter(
          (folder) => folder.name?.trim().toLowerCase() === "sprints"
        )
        
        console.log(`[ClickUp] Found ${sprintFolders.length} "Sprints" folders in space "${space.name}"`)
        
        // 4. For each "Sprints" folder, get lists
        for (const folder of sprintFolders) {
          try {
            const lists = await getLists(folder.id)
            console.log(`[ClickUp] Folder "${folder.name}" has ${lists.length} lists`)
            
            // 5. Each list is a sprint (filter archived)
            for (const list of lists) {
              if (!list.archived) {
                // Try to extract dates from list name or use null
                // Format: "Sprint 28 (11/16 - 11/22)" or similar
                const dateMatch = list.name.match(/\((\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})\)/)
                
                sprints.push({
                  id: list.id,
                  name: list.name,
                  start_date: null, // We'll need to parse this from the name or get it another way
                  end_date: null,
                  status: "open", // Assume open if not archived
                })
              }
            }
          } catch (listError) {
            console.warn(`[ClickUp] Error fetching lists from folder "${folder.name}":`, listError)
          }
        }
      } catch (folderError) {
        console.warn(`[ClickUp] Error fetching folders from space "${space.name}":`, folderError)
      }
    }
    
    console.log(`[ClickUp] Fetched ${sprints.length} sprints via lists method`)
    return sprints
  } catch (error) {
    console.error("[ClickUp] Error fetching sprints from lists:", error)
    return []
  }
}

/**
 * Get all sprints for a team using two methods with fallback
 */
export async function getSprints(teamId: string): Promise<ClickUpSprint[]> {
  // Try Method 1 first (direct endpoint)
  const directSprints = await fetchSprintsViaTeamEndpoint(teamId)
  if (directSprints && directSprints.length > 0) {
    return directSprints
  }
  
  // If Method 1 fails or returns empty, use Method 2 (navigate structure)
  return await fetchSprintsFromLists(teamId)
}

/**
 * Get all spaces for a team
 */
export async function getSpaces(teamId: string): Promise<Array<{ id: string; name: string }>> {
  const response = await clickUpRequest<{ spaces: Array<{ id: string; name: string }> }>(`/team/${teamId}/space`)
  return response.spaces || []
}

/**
 * Get all folders for a space
 */
export async function getFolders(spaceId: string): Promise<Array<{ id: string; name: string }>> {
  try {
    const response = await clickUpRequest<{ folders: Array<{ id: string; name: string }> }>(`/space/${spaceId}/folder`)
    return response.folders || []
  } catch (error) {
    // If folders endpoint fails, return empty array
    console.warn("Failed to fetch folders:", error)
    return []
  }
}

/**
 * Get all lists for a folder
 */
export async function getLists(folderId: string): Promise<ClickUpList[]> {
  const response = await clickUpRequest<{ lists: ClickUpList[] }>(`/folder/${folderId}/list`)
  return response.lists || []
}

/**
 * Get all lists for a space (lists not in folders)
 */
export async function getSpaceLists(spaceId: string): Promise<ClickUpList[]> {
  const response = await clickUpRequest<{ lists: ClickUpList[] }>(`/space/${spaceId}/list`)
  return response.lists || []
}

/**
 * Find "General" list in "Backend" folder by searching through all spaces and folders
 */
export async function findBackEnGeneralList(teamId: string): Promise<ClickUpList | null> {
  const spaces = await getSpaces(teamId)

  for (const space of spaces) {
    // Check lists in folders - look for "Backend" folder
    const folders = await getFolders(space.id)
    for (const folder of folders) {
      // Check if this folder is "Backend" or contains "Backend" in name
      const isBackendFolder = folder.name.toLowerCase().includes("backend")
      
      if (isBackendFolder) {
        const lists = await getLists(folder.id)
        // Look for "General" list in Backend folder
        const found = lists.find((list) => {
          const listName = list.name.toLowerCase()
          return listName === "general" || listName.includes("general")
        })
        if (found) {
          // Include folder info in the result
          return {
            ...found,
            folder: {
              id: folder.id,
              name: folder.name,
            },
          }
        }
      }
    }
  }

  return null
}

/**
 * Find the next sprint (first open sprint with start_date in the future, or earliest open sprint)
 */
export async function findNextSprint(teamId: string): Promise<ClickUpSprint | null> {
  const sprints = await getSprints(teamId)

  if (sprints.length === 0) {
    return null
  }

  const now = Date.now()

  // Filter open sprints
  const openSprints = sprints.filter((sprint) => sprint.status === "open")

  if (openSprints.length === 0) {
    return null
  }

  // Find sprints that haven't started yet (start_date in the future)
  const futureSprints = openSprints.filter((sprint) => sprint.start_date && sprint.start_date > now)

  if (futureSprints.length > 0) {
    // Return the earliest future sprint
    return futureSprints.sort((a, b) => (a.start_date || 0) - (b.start_date || 0))[0]
  }

  // If no future sprints, return the earliest open sprint
  return openSprints.sort((a, b) => (a.start_date || 0) - (b.start_date || 0))[0]
}

/**
 * Calculate the first Monday of a sprint
 * If sprint starts on Monday, return that date. Otherwise, return the next Monday.
 */
export function getFirstMondayOfSprint(sprint: ClickUpSprint): Date {
  if (!sprint.start_date) {
    // If no start date, use current date
    const today = new Date()
    return getFirstMonday(today)
  }

  const startDate = new Date(sprint.start_date)
  return getFirstMonday(startDate)
}

/**
 * Get the first Monday from a given date
 * If the date is already a Monday, return that date. Otherwise, return the next Monday.
 */
function getFirstMonday(date: Date): Date {
  const dayOfWeek = date.getDay() // 0 = Sunday, 1 = Monday, etc.
  
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

  const monday = new Date(date)
  monday.setDate(date.getDate() + daysUntilMonday)
  monday.setHours(0, 0, 0, 0) // Set to start of day

  return monday
}

/**
 * Convert Date to ClickUp timestamp (milliseconds)
 */
export function dateToClickUpTimestamp(date: Date): number {
  return date.getTime()
}

