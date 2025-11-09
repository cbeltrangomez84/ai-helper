"use client"

import { useCallback, useEffect, useRef, useState, type SVGProps } from "react"

import { WisprFlowClient } from "@/lib/wisprFlowClient"

type Mode = "idle" | "connecting" | "recording" | "finalizing"

type TaskDraft = {
  title: string
  objective: string
  acceptanceCriteria: string
  formatted: string
}

type CaptureIntent = "create" | "edit"

type DraftHistoryEntry = {
  version: number
  draft: TaskDraft
  transcript: string
}

type CreatedTask = {
  id?: string
  name?: string
  publicId?: string | null
  url?: string
  listId?: string
}

const MicIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z" />
    <path d="M19 11a7 7 0 0 1-14 0" />
    <path d="M12 19v2" />
  </svg>
)

const IS_NON_PROD = process.env.NODE_ENV !== "production"

export default function Home() {
  const [status, setStatus] = useState("Ready to capture speech whenever you are.")
  const [transcript, setTranscript] = useState("")
  const [mode, setMode] = useState<Mode>("idle")
  const [formattedOutput, setFormattedOutput] = useState<string | null>(null)
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null)
  const [taskInfo, setTaskInfo] = useState<CreatedTask | null>(null)
  const [isCreatingTask, setIsCreatingTask] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [captureIntent, setCaptureIntent] = useState<CaptureIntent>("create")
  const [draftHistory, setDraftHistory] = useState<DraftHistoryEntry[]>([])
  const [editButtonState, setEditButtonState] = useState<"idle" | "starting" | "recording" | "processing">("idle")
  const [isProcessingSummary, setIsProcessingSummary] = useState(false)
  const [isClearingCache, setIsClearingCache] = useState(false)

  const clientRef = useRef<WisprFlowClient | null>(null)

  const resetClient = useCallback(() => {
    clientRef.current?.dispose()
    clientRef.current = null
  }, [])

  const formatStatusMessage = useCallback((message: string) => {
    const trimmed = message?.trim() ?? ""
    if (!trimmed) {
      return trimmed
    }

    const lower = trimmed.toLowerCase()

    if (lower.includes("wispr received all audio")) {
      return "Processing the audio. Generating the final transcript..."
    }

    if (lower.includes("conectando con wispr flow")) {
      return "Connecting to the capture service..."
    }

    if (lower.includes("streaming audio to wispr")) {
      return "Streaming audio..."
    }

    if (lower.includes("session authenticated. requesting microphone access")) {
      return "Session authenticated. Requesting microphone access..."
    }

    return trimmed.replace(/wispr flow/gi, "capture service").replace(/wispr/gi, "capture service")
  }, [])

  useEffect(() => {
    return () => {
      resetClient()
    }
  }, [resetClient])

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return
    }

    let isMounted = true
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (isMounted) {
          console.info("Service worker registered:", registration.scope)
        }
      })
      .catch((error) => {
        console.error("Failed to register service worker", error)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const sendToBackend = useCallback(
    async ({ transcript: transcriptPayload, mode: intent, baseDraft, history }: { transcript: string; mode: CaptureIntent; baseDraft?: TaskDraft | null; history: DraftHistoryEntry[] }) => {
      try {
        const response = await fetch("/api/wispr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: transcriptPayload,
            mode: intent,
            text: transcriptPayload,
            previousDraft: baseDraft ?? null,
            history: history.map((entry) => ({
              version: entry.version,
              transcript: entry.transcript,
              draft: entry.draft,
            })),
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || "The backend did not accept the transcription.")
        }

        const payload: {
          formatted?: string | null
          title?: string
          objective?: string
          acceptanceCriteria?: string
        } = await response.json()

        const newDraft: TaskDraft = {
          title: payload.title?.trim() ?? "",
          objective: payload.objective?.trim() ?? "",
          acceptanceCriteria: payload.acceptanceCriteria?.trim() ?? "",
          formatted: payload.formatted?.trim() ?? "",
        }

        setFormattedOutput(newDraft.formatted || null)
        setTaskDraft(newDraft)
        setTaskInfo(null)
        setErrorMessage(null)
        setStatus(intent === "edit" ? "Updated summary with your edits." : "Summary ready. Review before creating the task.")
        setDraftHistory((previousHistory) => {
          if (intent === "create" || previousHistory.length === 0) {
            return [
              {
                version: 1,
                draft: newDraft,
                transcript: transcriptPayload,
              },
            ]
          }

          const nextVersion = (previousHistory.at(-1)?.version ?? previousHistory.length) + 1
          return [
            ...previousHistory,
            {
              version: nextVersion,
              draft: newDraft,
              transcript: transcriptPayload,
            },
          ]
        })
        setCaptureIntent("create")
        setIsProcessingSummary(false)
        if (intent === "edit") {
          setEditButtonState("idle")
        }
      } catch (error) {
        console.error("Failed to notify backend", error)
        const message = error instanceof Error ? error.message : "Unable to contact the backend."
        setErrorMessage(message)
        setStatus(formatStatusMessage(message))
        setCaptureIntent("create")
        setIsProcessingSummary(false)
        if (intent === "edit") {
          setEditButtonState("idle")
        }
      }
    },
    [formatStatusMessage]
  )

  const startSession = useCallback(
    async (intent: CaptureIntent) => {
      resetClient()
      setErrorMessage(null)
      setTranscript("")
      setCaptureIntent(intent)
      setIsProcessingSummary(false)
      setMode("connecting")
      if (intent === "create") {
        setFormattedOutput(null)
        setTaskDraft(null)
        setTaskInfo(null)
        setDraftHistory([])
        setStatus("Preparing the recording...")
      } else {
        setStatus("Preparing to capture your edits...")
      }

      const client = new WisprFlowClient({
        onStatus: (message) => setStatus(formatStatusMessage(message)),
        onPartial: (text) => setTranscript(text),
        onError: (error) => {
          console.error("Wispr error", error)
          setErrorMessage(error.message)
          setStatus("An error occurred while capturing audio.")
          setMode("idle")
          resetClient()
          setCaptureIntent("create")
          if (intent === "edit") {
            setEditButtonState("idle")
          }
        },
      })

      clientRef.current = client

      try {
        await client.start({ languages: ["es", "en"] })
        setMode("recording")
        if (intent === "edit") {
          setEditButtonState("recording")
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not start the audio capture."
        setErrorMessage(message)
        setStatus(formatStatusMessage(message))
        resetClient()
        setMode("idle")
        setCaptureIntent("create")
        if (intent === "edit") {
          setEditButtonState("idle")
        }
      }
    },
    [formatStatusMessage, resetClient]
  )

  const stopSession = useCallback(async () => {
    if (!clientRef.current) {
      return
    }

    if (captureIntent === "edit") {
      setEditButtonState("processing")
    }
    setMode("finalizing")
    setStatus("Processing transcription...")
    setIsProcessingSummary(true)

    try {
      const finalText = await clientRef.current.finalize()
      if (finalText) {
        setTranscript(finalText)
        setIsProcessingSummary(true)
        await sendToBackend({
          transcript: finalText,
          mode: captureIntent,
          baseDraft: captureIntent === "edit" ? taskDraft : null,
          history: draftHistory,
        })
      } else {
        setIsProcessingSummary(false)
        if (captureIntent === "edit") {
          setEditButtonState("idle")
        }
        setCaptureIntent("create")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not complete the transcription."
      setErrorMessage(message)
      setStatus(formatStatusMessage(message))
      setCaptureIntent("create")
      setIsProcessingSummary(false)
      if (captureIntent === "edit") {
        setEditButtonState("idle")
      }
    } finally {
      resetClient()
      setMode("idle")
    }
  }, [captureIntent, draftHistory, formatStatusMessage, resetClient, sendToBackend, taskDraft])

  const handleClick = useCallback(async () => {
    if (mode === "recording") {
      await stopSession()
    } else if (mode === "idle") {
      await startSession(captureIntent)
    } else if (mode === "connecting") {
      setStatus("Still connecting to the capture service...")
    }
  }, [captureIntent, mode, startSession, stopSession])

  const buttonLabel =
    mode === "recording" ? (captureIntent === "edit" ? "Recording edit..." : "Stop recording") : mode === "finalizing" ? "Processing..." : mode === "connecting" ? "Connecting..." : "Start recording"
  const buttonSubtext =
    mode === "recording"
      ? captureIntent === "edit"
        ? "Describe the adjustments you want to make to the current draft."
        : "Tap again when you're done to generate the summary."
      : mode === "finalizing"
      ? "Processing the transcription..."
      : mode === "connecting"
      ? "Preparing the capture session..."
      : "Tap the microphone button to begin."

  const isButtonDisabled = mode === "finalizing" || mode === "connecting"
  const editButtonLabel =
    editButtonState === "starting" ? "Connecting..." : editButtonState === "recording" ? "Stop edit capture" : editButtonState === "processing" ? "Processing edit..." : "Edit with voice"

  const editButtonClassName =
    editButtonState === "recording"
      ? "border border-red-500/60 bg-red-500/20 text-red-100 hover:border-red-400 hover:text-red-50"
      : editButtonState === "processing"
      ? "border border-zinc-700 bg-zinc-800 text-zinc-400"
      : editButtonState === "starting"
      ? "border border-emerald-500/40 text-emerald-200 animate-pulse"
      : "border border-emerald-500/40 text-emerald-200 hover:border-emerald-400 hover:text-emerald-100"

  const isEditButtonDisabled =
    !taskDraft ||
    isProcessingSummary ||
    editButtonState === "processing" ||
    editButtonState === "starting" ||
    mode === "finalizing" ||
    mode === "connecting" ||
    (mode === "recording" && captureIntent !== "edit")

  const showEditSpinner = editButtonState === "starting" || editButtonState === "processing"

  const handleStartOver = useCallback(() => {
    resetClient()
    setMode("idle")
    setStatus("Ready to capture speech whenever you are.")
    setTranscript("")
    setFormattedOutput(null)
    setTaskDraft(null)
    setTaskInfo(null)
    setErrorMessage(null)
    setCaptureIntent("create")
    setDraftHistory([])
    setIsProcessingSummary(false)
    setEditButtonState("idle")
  }, [resetClient])

  const handleEditDraft = useCallback(async () => {
    if (!taskDraft) {
      return
    }

    if (captureIntent === "edit" && mode === "recording") {
      await stopSession()
      return
    }

    if (mode !== "idle" || editButtonState === "starting" || editButtonState === "processing") {
      return
    }

    setCaptureIntent("edit")
    setEditButtonState("starting")
    await startSession("edit")
  }, [captureIntent, editButtonState, mode, startSession, stopSession, taskDraft])

  const handleCreateTask = useCallback(async () => {
    if (!taskDraft?.title || !taskDraft.objective) {
      setErrorMessage("The formatted content is missing a title or objective. Please try again.")
      return
    }

    setIsCreatingTask(true)
    setErrorMessage(null)
    setTaskInfo(null)
    setStatus("Creating ClickUp task...")

    try {
      const response = await fetch("/api/clickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskDraft.title,
          objective: taskDraft.objective,
          acceptanceCriteria: taskDraft.acceptanceCriteria,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || "ClickUp did not accept the task request.")
      }

      const payload: { task?: CreatedTask } = await response.json()
      if (!payload.task) {
        throw new Error("ClickUp did not return task details.")
      }

      setTaskInfo(payload.task)
      setStatus("Task created successfully in ClickUp.")
    } catch (error) {
      console.error("Failed to create ClickUp task", error)
      const message = error instanceof Error ? error.message : "Unable to create the task in ClickUp."
      setErrorMessage(message)
      setStatus(formatStatusMessage(message))
    } finally {
      setIsCreatingTask(false)
    }
  }, [taskDraft])

  const handleClearCaches = useCallback(async () => {
    if (isClearingCache || typeof window === "undefined") {
      return
    }

    setIsClearingCache(true)
    setStatus("Clearing local cache...")

    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((registration) => registration.unregister()))
      }

      if ("caches" in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map((name) => caches.delete(name)))
      }

      setStatus("Cache cleared. Reloading...")
      window.location.reload()
    } catch (error) {
      console.error("Failed to clear caches", error)
      setErrorMessage("Unable to clear the cache automatically.")
      setStatus("Please reload the page manually to apply the latest version.")
    } finally {
      setIsClearingCache(false)
    }
  }, [isClearingCache])

  return (
    <main className="flex min-h-dvh flex-col items-center bg-white px-4 py-10 text-zinc-900 sm:px-6">
      <div className="w-full max-w-4xl space-y-8">
        <header className="flex flex-col gap-3 text-center sm:text-left">
          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
            <h1 className="text-3xl font-semibold sm:text-4xl text-zinc-900">Print Task Creator</h1>
            {IS_NON_PROD && (
              <button
                type="button"
                onClick={handleClearCaches}
                disabled={isClearingCache}
                className="flex items-center gap-2 rounded-full border border-zinc-400 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-600 transition hover:border-zinc-700 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isClearingCache && <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" aria-hidden="true" />}
                <span>{isClearingCache ? "Clearing..." : "Clean cache"}</span>
              </button>
            )}
          </div>
          <p className="text-base text-zinc-600 sm:max-w-2xl">Record a quick note, get a structured summary, and push it straight to ClickUp.</p>
        </header>

        <section className="rounded-3xl border border-zinc-900/80 bg-zinc-950 p-6 shadow-[0_25px_120px_rgba(0,0,0,0.45)] sm:p-8">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
            <button
              type="button"
              onClick={handleClick}
              disabled={isButtonDisabled}
              className={`flex w-full items-center justify-center gap-3 rounded-full px-8 py-4 text-lg font-semibold text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto ${
                mode === "recording" ? "bg-red-600 hover:bg-red-500 focus-visible:outline-red-400" : "bg-zinc-900 hover:bg-zinc-800 focus-visible:outline-zinc-300"
              }`}
            >
              <span className={`flex h-12 w-12 items-center justify-center rounded-full ${mode === "recording" ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-100"}`}>
                <MicIcon className="h-6 w-6" />
              </span>
              <span className="whitespace-nowrap">{buttonLabel}</span>
            </button>
            <p className="text-center text-sm text-zinc-400 sm:text-left" aria-live="polite">
              {buttonSubtext}
            </p>
          </div>

          <p className="mt-6 text-sm text-zinc-400" aria-live="polite">
            {status}
          </p>

          {errorMessage && <div className="mt-4 rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-200">{errorMessage}</div>}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <article className="min-h-[160px] rounded-2xl border border-zinc-800/70 bg-zinc-900 p-4 text-sm text-zinc-200">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Live transcript</h2>
              {transcript ? <p className="whitespace-pre-wrap leading-relaxed">{transcript}</p> : <p className="text-zinc-500">Start a capture and the text will appear here in real time.</p>}
            </article>

            <article className="flex min-h-[160px] flex-col rounded-2xl border border-zinc-800/70 bg-zinc-900 p-4 text-sm leading-relaxed text-zinc-100">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Generated summary</h2>
                {formattedOutput && (
                  <span
                    className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                      isProcessingSummary ? "border border-amber-400/60 text-amber-200" : "border border-emerald-400/40 text-emerald-300"
                    }`}
                  >
                    {isProcessingSummary ? "Updating..." : "Ready"}
                  </span>
                )}
              </div>

              {formattedOutput ? (
                <>
                  <pre className="mt-3 flex-1 whitespace-pre-wrap font-sans text-sm text-zinc-100">{formattedOutput}</pre>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={handleEditDraft}
                      disabled={isEditButtonDisabled}
                      className={`w-full rounded-full px-6 py-3 text-sm font-semibold transition sm:w-auto ${editButtonClassName} disabled:cursor-not-allowed disabled:opacity-70`}
                    >
                      <span className="flex items-center justify-center gap-2">
                        {showEditSpinner && <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-300/60 border-t-transparent" aria-hidden="true" />}
                        <span>{editButtonLabel}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleStartOver}
                      className="w-full rounded-full border border-zinc-600 px-6 py-3 text-sm font-semibold text-zinc-200 transition hover:border-zinc-400 hover:text-white sm:w-auto"
                    >
                      Start over
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateTask}
                      disabled={isCreatingTask}
                      className="w-full rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                    >
                      {isCreatingTask ? "Creating task..." : "Create ClickUp task"}
                    </button>
                  </div>
                  {taskInfo && (
                    <div className="mt-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/15 p-4 text-sm text-emerald-200">
                      <h3 className="text-base font-semibold text-emerald-300">Task created</h3>
                      <p>
                        <span className="font-medium text-emerald-200/80">Name:</span> {taskInfo.name}
                      </p>
                      <p>
                        <span className="font-medium text-emerald-200/80">ID:</span> {taskInfo.publicId || taskInfo.id || "N/A"}
                      </p>
                      {taskInfo.url && (
                        <p>
                          <a className="text-emerald-300 underline" href={taskInfo.url} target="_blank" rel="noreferrer">
                            Open in ClickUp
                          </a>
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-3 flex flex-1 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/80 p-4 text-center text-sm text-zinc-500">
                  {isProcessingSummary ? (
                    <span className="flex items-center justify-center gap-2 text-zinc-300">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400" aria-hidden="true" />
                      Processing transcription...
                    </span>
                  ) : (
                    "The structured summary will appear here after you stop the recording."
                  )}
                </div>
              )}
            </article>
          </div>
        </section>
      </div>
    </main>
  )
}
