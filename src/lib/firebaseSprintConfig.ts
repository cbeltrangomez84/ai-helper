import { ref, get, set } from "firebase/database"

import { authenticateFirebase, getFirebaseDatabase } from "./firebase"

export interface SprintConfig {
  id: string
  name: string
  number: number | null
  startDate: number | null
  endDate: number | null
  firstMonday: number | null
  listId: string | null
  createdAt: number
  updatedAt: number
}

export interface SprintConfigData {
  sprints: Record<string, SprintConfig>
  backEnGeneralListId: string | null
  lastSync: number | null
}

/**
 * Save sprint configuration to Firebase
 */
export async function saveSprintConfigToFirebase(config: SprintConfigData): Promise<void> {
  await authenticateFirebase()
  const database = getFirebaseDatabase()
  const configRef = ref(database, "sprintConfig")

  await set(configRef, {
    ...config,
    lastSync: Date.now(),
  })
}

/**
 * Load sprint configuration from Firebase
 */
export async function loadSprintConfigFromFirebase(): Promise<SprintConfigData | null> {
  await authenticateFirebase()
  const database = getFirebaseDatabase()
  const configRef = ref(database, "sprintConfig")

  try {
    const snapshot = await get(configRef)
    if (!snapshot.exists()) {
      return null
    }

    const data = snapshot.val()
    
    // Validate and normalize the data structure
    if (!data || typeof data !== "object") {
      return null
    }

    // Ensure sprints is an object (or null/undefined)
    const normalizedData: SprintConfigData = {
      sprints: data.sprints && typeof data.sprints === "object" ? data.sprints : {},
      backEnGeneralListId: data.backEnGeneralListId || null,
      lastSync: data.lastSync || null,
    }

    return normalizedData
  } catch (error) {
    console.error("Error loading sprint config from Firebase:", error)
    return null
  }
}

/**
 * Get the next sprint from Firebase config
 */
export async function getNextSprintFromConfig(): Promise<SprintConfig | null> {
  const config = await loadSprintConfigFromFirebase()
  if (!config || !config.sprints) {
    return null
  }

  const now = Date.now()
  const sprints = Object.values(config.sprints)

  // Filter sprints that haven't ended yet
  const activeSprints = sprints.filter((sprint) => {
    if (!sprint.endDate) return true
    return sprint.endDate > now
  })

  if (activeSprints.length === 0) {
    return null
  }

  // Find sprints that haven't started yet (startDate in the future)
  const futureSprints = activeSprints.filter((sprint) => {
    if (!sprint.startDate) return false
    return sprint.startDate > now
  })

  if (futureSprints.length > 0) {
    // Return the earliest future sprint
    return futureSprints.sort((a, b) => (a.startDate || 0) - (b.startDate || 0))[0]
  }

  // If no future sprints, return the earliest active sprint
  return activeSprints.sort((a, b) => (a.startDate || 0) - (b.startDate || 0))[0]
}

/**
 * Get Back en General list ID from Firebase config
 */
export async function getBackEnGeneralListIdFromConfig(): Promise<string | null> {
  const config = await loadSprintConfigFromFirebase()
  return config?.backEnGeneralListId || null
}

