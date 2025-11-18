"use client"

import { useCallback, useEffect, useState } from "react"

import { AppHeader } from "@/components/AppHeader"
import { deleteCorrectionFromFirebase, loadAllCorrectionsFromFirebase, saveCorrectionsToFirebase } from "@/lib/firebaseCorrections"
import { invalidateCorrectionsCache } from "@/lib/wisprCorrections"

export function CorrectionsManager({ onBack }: { onBack: () => void }) {
  const [corrections, setCorrections] = useState<Array<{ key: string; original: string; correction: string }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [newOriginal, setNewOriginal] = useState("")
  const [newCorrection, setNewCorrection] = useState("")
  const [error, setError] = useState<string | null>(null)

  const loadCorrections = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const loadedCorrections = await loadAllCorrectionsFromFirebase()
      setCorrections(loadedCorrections)
    } catch (err) {
      console.error("Error loading corrections:", err)
      setError("Failed to load corrections. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCorrections()
  }, [loadCorrections])

  const handleAddCorrection = useCallback(async () => {
    if (!newOriginal.trim() || !newCorrection.trim()) {
      setError("Both fields are required.")
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      await saveCorrectionsToFirebase([
        {
          original: newOriginal.trim(),
          correction: newCorrection.trim(),
        },
      ])

      invalidateCorrectionsCache()
      setNewOriginal("")
      setNewCorrection("")
      await loadCorrections()
    } catch (err) {
      console.error("Error adding correction:", err)
      setError("Failed to add correction. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }, [newOriginal, newCorrection, loadCorrections])

  const handleDeleteCorrection = useCallback(
    async (original: string) => {
      if (!confirm(`Are you sure you want to delete the correction for "${original}"?`)) {
        return
      }

      setIsDeleting(original)
      setError(null)

      try {
        await deleteCorrectionFromFirebase(original)
        invalidateCorrectionsCache()
        await loadCorrections()
      } catch (err) {
        console.error("Error deleting correction:", err)
        setError("Failed to delete correction. Please try again.")
      } finally {
        setIsDeleting(null)
      }
    },
    [loadCorrections]
  )

  return (
    <>
      <AppHeader title="Corrections Manager" onBack={onBack} />
      <main className="flex min-h-dvh flex-col items-center bg-white px-4 py-10 text-zinc-900 sm:px-6">
        <div className="w-full max-w-4xl space-y-8">
          <div className="flex flex-col gap-3 text-center sm:text-left">
            <p className="text-base text-zinc-600 sm:max-w-2xl">Manage speech recognition corrections. These corrections will be applied in future recordings.</p>
          </div>

          {error && <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}

          {/* Add new correction form */}
          <section className="rounded-3xl border border-zinc-900/80 bg-zinc-950 p-6 shadow-[0_25px_120px_rgba(0,0,0,0.45)] sm:p-8">
            <h2 className="mb-4 text-lg font-semibold text-white">Add New Correction</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="original" className="block text-sm font-medium text-zinc-400 mb-2">
                  Incorrectly understood word
                </label>
                <input
                  id="original"
                  type="text"
                  value={newOriginal}
                  onChange={(e) => setNewOriginal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newOriginal.trim() && newCorrection.trim()) {
                      handleAddCorrection()
                    }
                  }}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="e.g., Moquin Gestor"
                  disabled={isSaving}
                />
              </div>
              <div>
                <label htmlFor="correction" className="block text-sm font-medium text-zinc-400 mb-2">
                  Correct word
                </label>
                <input
                  id="correction"
                  type="text"
                  value={newCorrection}
                  onChange={(e) => setNewCorrection(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newOriginal.trim() && newCorrection.trim()) {
                      handleAddCorrection()
                    }
                  }}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="e.g., Mock Ingestor"
                  disabled={isSaving}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleAddCorrection}
              disabled={isSaving || !newOriginal.trim() || !newCorrection.trim()}
              className="mt-4 w-full rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {isSaving ? "Adding..." : "Add Correction"}
            </button>
          </section>

          {/* Corrections list */}
          <section className="rounded-3xl border border-zinc-900/80 bg-zinc-950 p-6 shadow-[0_25px_120px_rgba(0,0,0,0.45)] sm:p-8">
            <h2 className="mb-4 text-lg font-semibold text-white">Existing Corrections</h2>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400" aria-hidden="true" />
                <span className="ml-3 text-sm text-zinc-400">Loading corrections...</span>
              </div>
            ) : corrections.length === 0 ? (
              <div className="py-12 text-center text-sm text-zinc-400">No corrections found. Add your first correction above.</div>
            ) : (
              <div className="space-y-3">
                {corrections.map((correction) => (
                  <div
                    key={correction.key}
                    className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
                  >
                    <div className="flex-1">
                      <span className="text-zinc-400">"{correction.original}"</span>
                      <span className="mx-2 text-zinc-600">→</span>
                      <span className="text-zinc-200">"{correction.correction}"</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteCorrection(correction.original)}
                      disabled={isDeleting === correction.original}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-red-500/50 bg-red-500/20 text-red-400 transition hover:bg-red-500/30 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Delete correction for ${correction.original}`}
                    >
                      {isDeleting === correction.original ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" aria-hidden="true" />
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  )
}

