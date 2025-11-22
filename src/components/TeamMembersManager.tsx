"use client"

import { useCallback, useEffect, useState } from "react"

import { AppHeader } from "@/components/AppHeader"
import { loadTeamMembersFromFirebase, updateTeamMemberAddress, type TeamMember } from "@/lib/firebaseTeamMembers"

// Initial team members data
const INITIAL_TEAM_MEMBERS: Record<string, Omit<TeamMember, "createdAt" | "updatedAt">> = {
  "224459192": {
    id: "224459192",
    name: "Javier manassevitz",
    email: "manassevitz@gmail.com",
    howToAddress: ["Javier"],
    team: "Backend",
  },
  "49571088": {
    id: "49571088",
    name: "Carlos Beltrán",
    email: "cbeltrangomez@gmail.com",
    howToAddress: ["Carlos"],
    team: "Backend",
  },
  "87355293": {
    id: "87355293",
    name: "David Mauricio Gómez",
    email: "davidmaogomezz@gmail.com",
    howToAddress: ["David"],
    team: "Backend",
  },
  "49731210": {
    id: "49731210",
    name: "Julian Lamprea",
    email: "jalamprea@gmail.com",
    howToAddress: ["Julián"],
    team: "Backend",
  },
  "81536724": {
    id: "81536724",
    name: "Esteban Velasquez",
    email: "estebanvelasquezcardeno@gmail.com",
    howToAddress: ["Esteban"],
    team: "Backend",
  },
  "10784275": {
    id: "10784275",
    name: "Juan Pablo Gómez",
    email: "juanpablogomezzapata@gmail.com",
    howToAddress: ["Juanpa"],
    team: "Backend",
  },
  "49641057": {
    id: "49641057",
    name: "Carlos Carvajal",
    email: "andcarva@gmail.com",
    howToAddress: ["Carvajal", "Carva"],
    team: "Backend",
  },
  "87327740": {
    id: "87327740",
    name: "Anthony Vicenti",
    email: "anthony@luckydog.studio",
    howToAddress: ["Anthony"],
    team: "Backend",
  },
  "87327696": {
    id: "87327696",
    name: "Erzum Shirazi",
    email: "0xkernlog@gmail.com",
    howToAddress: ["Erzum"],
    team: "Backend",
  },
  "81390568": {
    id: "81390568",
    name: "Zyruks",
    email: "kuzenshi@gmail.com",
    howToAddress: ["Zyruks"],
    team: "Frontend",
  },
}

export function TeamMembersManager({ onBack }: { onBack: () => void }) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [editingMember, setEditingMember] = useState<string | null>(null)
  const [editAddresses, setEditAddresses] = useState<string>("")

  const loadMembers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadTeamMembersFromFirebase()
      if (data && data.members && typeof data.members === "object") {
        const membersArray = Object.values(data.members).filter((member) => member && member.id)
        setMembers(
          membersArray.sort((a, b) => {
            // Sort by team first, then by name
            if (a.team !== b.team) {
              return a.team.localeCompare(b.team)
            }
            return a.name.localeCompare(b.name)
          })
        )
        setLastSync(data.lastSync)
      } else {
        // If no data exists, initialize with default members
        const initialMembers: Record<string, TeamMember> = {}
        const now = Date.now()
        for (const [id, member] of Object.entries(INITIAL_TEAM_MEMBERS)) {
          initialMembers[id] = {
            ...member,
            createdAt: now,
            updatedAt: now,
          }
        }
        await import("@/lib/firebaseTeamMembers").then((m) => m.saveTeamMembersToFirebase(initialMembers))
        setMembers(Object.values(initialMembers))
        setLastSync(now)
      }
    } catch (err) {
      console.error("Failed to load team members", err)
      setError(err instanceof Error ? err.message : "Unable to load team members.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMembers()
  }, [loadMembers])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setError(null)

    try {
      const response = await fetch("/api/clickup/team-members", {
        method: "GET",
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || "Failed to sync team members from ClickUp.")
      }

      const data = await response.json()
      if (data.ok) {
        setMembers(
          data.members.sort((a: TeamMember, b: TeamMember) => {
            if (a.team !== b.team) {
              return a.team.localeCompare(b.team)
            }
            return a.name.localeCompare(b.name)
          })
        )
        setLastSync(Date.now())
        console.log(`[TeamMembers] Synced ${data.count} members`)
      } else {
        throw new Error(data.message || "Failed to sync team members.")
      }
    } catch (err) {
      console.error("Failed to sync team members", err)
      setError(err instanceof Error ? err.message : "Unable to sync team members from ClickUp.")
    } finally {
      setSyncing(false)
    }
  }, [])

  const handleEdit = useCallback((member: TeamMember) => {
    setEditingMember(member.id)
    setEditAddresses(member.howToAddress.join(", "))
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingMember) return

    const addresses = editAddresses
      .split(",")
      .map((addr) => addr.trim())
      .filter((addr) => addr.length > 0)

    if (addresses.length === 0) {
      setError("At least one address/nickname is required")
      return
    }

    try {
      await updateTeamMemberAddress(editingMember, addresses)
      await loadMembers() // Reload to get updated data
      setEditingMember(null)
      setEditAddresses("")
      setError(null)
    } catch (err) {
      console.error("Failed to update team member", err)
      setError(err instanceof Error ? err.message : "Unable to update team member.")
    }
  }, [editingMember, editAddresses, loadMembers])

  const handleCancelEdit = useCallback(() => {
    setEditingMember(null)
    setEditAddresses("")
  }, [])

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return "N/A"
    return new Date(timestamp).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  return (
    <>
      <AppHeader title="Team Members" onBack={onBack} />
      <main className="flex min-h-dvh flex-col items-center bg-white px-4 py-10 text-zinc-900 sm:px-6">
        <div className="w-full max-w-4xl space-y-8">
          <div className="flex flex-col gap-3 text-center sm:text-left">
            <h1 className="text-2xl font-semibold text-zinc-900">Team Members</h1>
            <p className="text-base text-zinc-600">Manage team members and how to address them.</p>
          </div>

          {/* Sync Button Section */}
          <section className="rounded-3xl border border-zinc-900/80 bg-zinc-950 p-6 shadow-[0_25px_120px_rgba(0,0,0,0.45)] sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Sync from ClickUp</h2>
                <p className="mt-1 text-sm text-zinc-400">Fetch team members from ClickUp workspace.</p>
                {lastSync && <p className="mt-2 text-xs text-zinc-500">Last sync: {formatDate(lastSync)}</p>}
              </div>
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing}
                className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {syncing ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                    Syncing...
                  </span>
                ) : (
                  "Sync from ClickUp"
                )}
              </button>
            </div>
          </section>

          {error && <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-600">{error}</div>}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="flex items-center gap-2 text-zinc-600">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" aria-hidden="true" />
                Loading team members...
              </span>
            </div>
          ) : members.length === 0 ? (
            <div className="rounded-3xl border border-zinc-900/80 bg-zinc-950 p-8 text-center shadow-[0_25px_120px_rgba(0,0,0,0.45)]">
              <p className="text-zinc-400">No team members configured. Click "Sync from ClickUp" to load members.</p>
            </div>
          ) : (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-zinc-900">Members ({members.length})</h2>
              {members.map((member) => (
                <div
                  key={member.id}
                  className="rounded-2xl border border-zinc-900/80 bg-zinc-950 p-6 shadow-[0_25px_120px_rgba(0,0,0,0.45)]"
                >
                  {editingMember === member.id ? (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-semibold text-white">{member.name}</p>
                        <p className="text-xs text-zinc-400">{member.email}</p>
                        <p className="mt-1 text-xs text-zinc-500">Team: {member.team}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                          How to address (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={editAddresses}
                          onChange={(e) => setEditAddresses(e.target.value)}
                          className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          placeholder="e.g., Carva, Carvajal"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="rounded-full border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-400 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Name</p>
                        <p className="mt-1 text-sm text-white">{member.name}</p>
                        <p className="mt-1 text-xs text-zinc-500">{member.email}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Team</p>
                        <p className="mt-1 text-sm text-white">{member.team}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">How to address</p>
                        <p className="mt-1 text-sm text-white">{member.howToAddress.join(", ")}</p>
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => handleEdit(member)}
                          className="w-full rounded-full border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-400 hover:text-white sm:w-auto"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>
      </main>
    </>
  )
}

