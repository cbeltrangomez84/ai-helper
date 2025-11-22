import { ref, get, set, update, remove } from "firebase/database"

import { authenticateFirebase, getFirebaseDatabase } from "./firebase"

export interface TeamMember {
  id: string
  name: string
  email: string
  howToAddress: string[] // Array of nicknames/how to address them
  team: string // "Backend" or "Frontend"
  createdAt: number
  updatedAt: number
}

export interface TeamMembersData {
  members: Record<string, TeamMember>
  lastSync: number | null
}

/**
 * Save team members to Firebase
 */
export async function saveTeamMembersToFirebase(members: Record<string, TeamMember>): Promise<void> {
  await authenticateFirebase()
  const database = getFirebaseDatabase()
  const membersRef = ref(database, "teamMembers")

  await set(membersRef, {
    members,
    lastSync: Date.now(),
  })
}

/**
 * Load team members from Firebase
 */
export async function loadTeamMembersFromFirebase(): Promise<TeamMembersData | null> {
  await authenticateFirebase()
  const database = getFirebaseDatabase()
  const membersRef = ref(database, "teamMembers")

  try {
    const snapshot = await get(membersRef)
    if (!snapshot.exists()) {
      return null
    }

    const data = snapshot.val()

    // Validate and normalize the data structure
    if (!data || typeof data !== "object") {
      return null
    }

    const normalizedData: TeamMembersData = {
      members: data.members && typeof data.members === "object" ? data.members : {},
      lastSync: data.lastSync || null,
    }

    return normalizedData
  } catch (error) {
    console.error("Error loading team members from Firebase:", error)
    return null
  }
}

/**
 * Update a team member's howToAddress field
 */
export async function updateTeamMemberAddress(memberId: string, howToAddress: string[]): Promise<void> {
  await authenticateFirebase()
  const database = getFirebaseDatabase()
  const memberRef = ref(database, `teamMembers/members/${memberId}`)

  await update(memberRef, {
    howToAddress,
    updatedAt: Date.now(),
  })
}

/**
 * Get all team members as an array
 */
export async function getAllTeamMembers(): Promise<TeamMember[]> {
  const data = await loadTeamMembersFromFirebase()
  if (!data || !data.members) {
    return []
  }

  return Object.values(data.members)
}

