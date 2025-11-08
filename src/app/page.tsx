"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { WisprFlowClient } from "@/lib/wisprFlowClient"

type Mode = "idle" | "recording" | "finalizing"

export default function Home() {
  const [status, setStatus] = useState("Ready to capture speech with Wispr")
  const [transcript, setTranscript] = useState("")
  const [mode, setMode] = useState<Mode>("idle")
  const [formattedOutput, setFormattedOutput] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const clientRef = useRef<WisprFlowClient | null>(null)

  const resetClient = useCallback(() => {
    clientRef.current?.dispose()
    clientRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      resetClient()
    }
  }, [resetClient])

  const sendToBackend = useCallback(
    async (text: string) => {
      try {
        const response = await fetch("/api/wispr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || "The backend did not accept the transcription.")
        }

        const payload: { formatted?: string | null } = await response.json()
        setFormattedOutput(payload.formatted ?? null)
      } catch (error) {
        console.error("Failed to notify backend", error)
        const message = error instanceof Error ? error.message : "Unable to contact the backend."
        setErrorMessage(message)
        setStatus(message)
      }
    },
    [setErrorMessage, setFormattedOutput, setStatus]
  )

  const startSession = useCallback(async () => {
    resetClient()
    setErrorMessage(null)
    setTranscript("")
    setFormattedOutput(null)

    const client = new WisprFlowClient({
      onStatus: (message) => setStatus(message),
      onPartial: (text) => setTranscript(text),
      onError: (error) => {
        console.error("Wispr error", error)
        setErrorMessage(error.message)
        setStatus("Wispr Flow reported an error.")
        setMode("idle")
        resetClient()
      },
    })

    clientRef.current = client

    try {
      await client.start({ languages: ["es", "en"] })
      setMode("recording")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start the Wispr session."
      setErrorMessage(message)
      setStatus(message)
      resetClient()
    }
  }, [resetClient])

  const stopSession = useCallback(async () => {
    if (!clientRef.current) {
      return
    }

    setMode("finalizing")
    setStatus("Sending commit to Wispr...")

    try {
      const finalText = await clientRef.current.finalize()
      if (finalText) {
        setTranscript(finalText)
        await sendToBackend(finalText)
        setStatus("Final transcript delivered to the backend and formatted.")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not complete the Wispr transcription."
      setErrorMessage(message)
      setStatus(message)
    } finally {
      resetClient()
      setMode("idle")
    }
  }, [resetClient, sendToBackend])

  const handleClick = useCallback(async () => {
    if (mode === "recording") {
      await stopSession()
    } else if (mode === "idle") {
      await startSession()
    }
  }, [mode, startSession, stopSession])

  const buttonLabel = mode === "recording" ? "Stop and transcribe" : mode === "finalizing" ? "Processing..." : "Start capture with Wispr"

  const isButtonDisabled = mode === "finalizing"

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-zinc-50 p-8 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50">
      <div className="w-full max-w-xl rounded-3xl bg-white/80 p-10 shadow-2xl backdrop-blur dark:bg-zinc-800/80">
        <h1 className="mb-6 text-center text-3xl font-semibold">Wispr Flow Demo</h1>
        <p className="mb-8 text-center text-base text-zinc-700 dark:text-zinc-300">{status}</p>
        <div className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={handleClick}
            disabled={isButtonDisabled}
            className="w-full rounded-full bg-black px-8 py-4 text-lg font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {buttonLabel}
          </button>
          {mode === "recording" && (
            <button
              type="button"
              onClick={stopSession}
              className="w-full rounded-full border border-zinc-300 px-6 py-3 text-base font-medium text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-100 dark:hover:border-zinc-500"
            >
              Finish and transcribe now
            </button>
          )}
        </div>
        {errorMessage && <div className="mt-6 rounded-2xl border border-red-400 bg-red-50 p-4 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">{errorMessage}</div>}
        <div className="mt-6 min-h-[120px] rounded-2xl border border-zinc-200 bg-zinc-100/70 p-4 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100">
          {transcript ? <p className="whitespace-pre-wrap leading-relaxed">{transcript}</p> : <p className="text-zinc-500 dark:text-zinc-400">Live transcription will appear here.</p>}
        </div>
        {formattedOutput && (
          <div className="mt-6 rounded-2xl border border-indigo-300 bg-indigo-50 p-4 text-sm leading-relaxed text-zinc-900 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-50">
            <h2 className="mb-2 text-base font-semibold text-indigo-600 dark:text-indigo-300">ChatGPT formatted output</h2>
            <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-800 dark:text-indigo-50">{formattedOutput}</pre>
          </div>
        )}
      </div>
    </main>
  )
}
