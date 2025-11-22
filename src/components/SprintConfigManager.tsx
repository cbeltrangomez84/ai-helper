"use client"

import { useCallback, useEffect, useState } from "react"

import { AppHeader } from "@/components/AppHeader"
import { loadSprintConfigFromFirebase, type SprintConfig } from "@/lib/firebaseSprintConfig"

export function SprintConfigManager({ onBack }: { onBack: () => void }) {
  const [sprints, setSprints] = useState<SprintConfig[]>([])
  const [backEnGeneralListId, setBackEnGeneralListId] = useState<string | null>(null)
  const [backEnGeneralListName, setBackEnGeneralListName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<number | null>(null)

  const loadConfig = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const config = await loadSprintConfigFromFirebase()
      if (config && config.sprints && typeof config.sprints === "object") {
        const sprintsArray = Object.values(config.sprints).filter((sprint) => sprint && sprint.id)
        setSprints(
          sprintsArray.sort((a, b) => {
            // Sort by sprint number if available, otherwise by start date
            if (a.number !== null && b.number !== null) {
              return b.number - a.number // Descending order (newest first)
            }
            const aDate = a.startDate || 0
            const bDate = b.startDate || 0
            return bDate - aDate
          })
        )
        setBackEnGeneralListId(config.backEnGeneralListId || null)
        setLastSync(config.lastSync || null)
      } else {
        setSprints([])
        setBackEnGeneralListId(null)
        setLastSync(null)
      }
    } catch (err) {
      console.error("Failed to load sprint config", err)
      setError(err instanceof Error ? err.message : "Unable to load sprint configuration.")
      setSprints([])
      setBackEnGeneralListId(null)
      setLastSync(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setError(null)

    try {
      const response = await fetch("/api/clickup/sprints", {
        method: "GET",
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || "Failed to sync sprints from ClickUp.")
      }

      const data = await response.json()
      if (data.ok) {
        console.log(`[SprintConfig] Sync successful: ${data.count || 0} sprints, list ID: ${data.backEnGeneralListId || "N/A"}`)
        setBackEnGeneralListId(data.backEnGeneralListId)
        setBackEnGeneralListName(data.backEnGeneralListName)
        setSprints(
          data.sprints.sort((a: SprintConfig, b: SprintConfig) => {
            if (a.number !== null && b.number !== null) {
              return b.number - a.number
            }
            const aDate = a.startDate || 0
            const bDate = b.startDate || 0
            return bDate - aDate
          })
        )
        setLastSync(Date.now())
        
        if (data.count === 0) {
          setError("No sprints found. Make sure the ClickApp de Sprints is activated in your ClickUp workspace.")
        }
      } else {
        throw new Error(data.message || "Failed to sync sprints.")
      }
    } catch (err) {
      console.error("Failed to sync sprints", err)
      setError(err instanceof Error ? err.message : "Unable to sync sprints from ClickUp.")
    } finally {
      setSyncing(false)
    }
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
      <AppHeader title="Sprint Configuration" onBack={onBack} />
      <main className="flex min-h-dvh flex-col items-center bg-white px-4 py-10 text-zinc-900 sm:px-6">
        <div className="w-full max-w-4xl space-y-8">
          <div className="flex flex-col gap-3 text-center sm:text-left">
            <h1 className="text-2xl font-semibold text-zinc-900">Sprint Configuration</h1>
            <p className="text-base text-zinc-600">Manage sprint settings and sync from ClickUp.</p>
          </div>

          {/* Sync Button Section - Separate at the top */}
          <section className="rounded-3xl border border-zinc-900/80 bg-zinc-950 p-6 shadow-[0_25px_120px_rgba(0,0,0,0.45)] sm:p-8">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Sync from ClickUp</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Fetch all sprints and find the "General" list in the "Backend" folder.
                  </p>
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
              
              {/* Back en General List Info */}
              <div className="mt-4 rounded-2xl border border-zinc-800/70 bg-zinc-900 p-4">
                <h3 className="text-sm font-semibold text-zinc-300">General List (Backend folder)</h3>
                <p className="mt-1 text-sm text-zinc-400">
                  {backEnGeneralListId ? (
                    <>
                      <span className="font-medium text-zinc-200">{backEnGeneralListName || "Found"}</span>
                      <span className="ml-2 text-zinc-500">({backEnGeneralListId})</span>
                    </>
                  ) : (
                    <span className="text-zinc-500">Not configured - will be found during sync</span>
                  )}
                </p>
                {lastSync && (
                  <p className="mt-2 text-xs text-zinc-500">Last sync: {formatDate(lastSync)}</p>
                )}
              </div>
            </div>
          </section>

          {error && <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-600">{error}</div>}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="flex items-center gap-2 text-zinc-600">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" aria-hidden="true" />
                Loading configuration...
              </span>
            </div>
          ) : sprints.length === 0 ? (
            <div className="rounded-3xl border border-zinc-900/80 bg-zinc-950 p-8 text-center shadow-[0_25px_120px_rgba(0,0,0,0.45)]">
              <p className="text-zinc-400">No sprints configured. Click "Sync from ClickUp" to load sprints.</p>
            </div>
          ) : (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-zinc-900">Sprints ({sprints.length})</h2>
              {sprints.map((sprint) => (
                <div
                  key={sprint.id}
                  className="rounded-2xl border border-zinc-900/80 bg-zinc-950 p-6 shadow-[0_25px_120px_rgba(0,0,0,0.45)]"
                >
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Name</p>
                      <p className="mt-1 text-sm text-white">{sprint.name}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Sprint Number</p>
                      <p className="mt-1 text-sm text-white">{sprint.number !== null ? `Sprint ${sprint.number}` : "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Dates</p>
                      <p className="mt-1 text-sm text-white">
                        {sprint.startDate && sprint.endDate ? (
                          <>
                            {formatDate(sprint.startDate)} - {formatDate(sprint.endDate)}
                          </>
                        ) : (
                          "N/A"
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">First Monday</p>
                      <p className="mt-1 text-sm text-white">{formatDate(sprint.firstMonday)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      </main>
    </>
  )
}

