import { NextRequest, NextResponse } from "next/server"

import { getClickUpTeamId } from "@/lib/clickupUtils"
import { saveTeamMembersToFirebase, type TeamMember } from "@/lib/firebaseTeamMembers"

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2"

async function clickUpRequest<T>(endpoint: string): Promise<T> {
  const apiToken = process.env.CLICKUP_API_TOKEN
  if (!apiToken) {
    throw new Error("CLICKUP_API_TOKEN is not configured")
  }

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

type ClickUpMember = {
  user: {
    id: string
    username: string
    email: string
    initials: string
    profilePicture: string
  }
}

/**
 * Get team members from ClickUp
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
    console.log(`[ClickUp Team Members] Using team ID: ${teamId}`)

    // Get team members from ClickUp
    const response = await clickUpRequest<{ members: ClickUpMember[] }>(`/team/${teamId}/member`)
    const members = response.members || []

    console.log(`[ClickUp Team Members] Retrieved ${members.length} members`)

    // Process members and create initial data structure
    const processedMembers: Record<string, TeamMember> = {}

    for (const member of members) {
      const userId = member.user.id
      const name = member.user.username || member.user.email.split("@")[0]
      const email = member.user.email

      // Default howToAddress based on name (first name or username)
      const defaultAddress = name.split(" ")[0] || name

      processedMembers[userId] = {
        id: userId,
        name,
        email,
        howToAddress: [defaultAddress],
        team: "Backend", // Default, can be updated manually
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    }

    // Load existing members to preserve custom howToAddress and team assignments
    const existingData = await import("@/lib/firebaseTeamMembers").then((m) => m.loadTeamMembersFromFirebase())
    if (existingData && existingData.members) {
      for (const [memberId, existingMember] of Object.entries(existingData.members)) {
        if (processedMembers[memberId]) {
          // Preserve custom howToAddress and team if they exist
          processedMembers[memberId].howToAddress = existingMember.howToAddress || processedMembers[memberId].howToAddress
          processedMembers[memberId].team = existingMember.team || processedMembers[memberId].team
          processedMembers[memberId].createdAt = existingMember.createdAt || processedMembers[memberId].createdAt
        } else {
          // Keep existing members that might not be in ClickUp anymore
          processedMembers[memberId] = existingMember
        }
      }
    }

    // Save to Firebase
    await saveTeamMembersToFirebase(processedMembers)

    return NextResponse.json({
      ok: true,
      members: Object.values(processedMembers),
      count: Object.keys(processedMembers).length,
    })
  } catch (error) {
    console.error("[ClickUp Team Members] Error fetching team members:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const fullError = error instanceof Error ? error.stack : String(error)
    console.error("[ClickUp Team Members] Full error details:", fullError)

    return NextResponse.json(
      {
        ok: false,
        message: `Failed to fetch team members from ClickUp: ${errorMessage}. Check server logs for details.`,
        error: process.env.NODE_ENV === "development" ? fullError : undefined,
      },
      { status: 500 }
    )
  }
}

