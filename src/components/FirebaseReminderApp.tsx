"use client"

import { useCallback, useEffect, useState, type SVGProps } from "react"

import { AppHeader } from "@/components/AppHeader"
import { SelectableTranscript } from "@/components/SelectableTranscript"
import { useVoiceRecording } from "@/hooks/useVoiceRecording"
import { addTaskToFirebase } from "@/lib/firebaseTasks"
import { getAllCorrections, loadCorrectionsFromFirebase } from "@/lib/wisprCorrections"

const MicIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z" />
    <path d="M19 11a7 7 0 0 1-14 0" />
    <path d="M12 19v2" />
  </svg>
)

export function FirebaseReminderApp({ onBack }: { onBack: () => void }) {
  const [isSaving, setIsSaving] = useState(false)
  const [savedTaskId, setSavedTaskId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [correctedTranscript, setCorrectedTranscript] = useState<string>("")
  const [correctionsLoaded, setCorrectionsLoaded] = useState(false)
  const [additionalInfo, setAdditionalInfo] = useState<string>("")

  const [correctionsDict, setCorrectionsDict] = useState<Record<string, string> | undefined>(undefined)

  const { mode, transcript, status, errorMessage, startRecording, stopRecording, reset, isRecording, isProcessing } = useVoiceRecording({
    corrections: correctionsDict,
  })

  // Load corrections from Firebase on mount
  useEffect(() => {
    loadCorrectionsFromFirebase().then((corrections) => {
      setCorrectionsDict(Object.keys(corrections).length > 0 ? corrections : undefined)
      setCorrectionsLoaded(true)
    })
  }, [])

  // Update corrected transcript when transcript changes
  useEffect(() => {
    if (transcript && !correctedTranscript) {
      setCorrectedTranscript(transcript)
    }
  }, [transcript, correctedTranscript])

  const handleClick = useCallback(async () => {
    if (isRecording) {
      await stopRecording()
    } else if (mode === "idle") {
      await startRecording()
    }
  }, [isRecording, mode, startRecording, stopRecording])

  const handleStartOver = useCallback(() => {
    reset()
    setSavedTaskId(null)
    setSaveError(null)
    setCorrectedTranscript("")
    setAdditionalInfo("")
  }, [reset])

  const handleTranscriptUpdate = useCallback((updatedTranscript: string) => {
    setCorrectedTranscript(updatedTranscript)
  }, [])

  const handleSaveToFirebase = useCallback(async () => {
    // Use corrected transcript if available, otherwise use original
    const textToSave = correctedTranscript.trim() || transcript.trim()
    if (!textToSave) {
      return
    }

    // Combine transcript with additional info if provided
    let finalText = textToSave
    if (additionalInfo.trim()) {
      finalText = `${textToSave}\n\nadicional info: ${additionalInfo.trim()}`
    }

    setIsSaving(true)
    setSaveError(null)
    setSavedTaskId(null)

    try {
      const taskId = await addTaskToFirebase(finalText)
      setSavedTaskId(taskId)
    } catch (error) {
      console.error("Failed to save task to Firebase", error)
      const message = error instanceof Error ? error.message : "Unable to save the task to Firebase."
      setSaveError(message)
    } finally {
      setIsSaving(false)
    }
  }, [correctedTranscript, transcript, additionalInfo])

  const buttonLabel = isRecording ? "Stop recording" : isProcessing ? "Processing..." : mode === "connecting" ? "Connecting..." : "Start recording"
  const buttonSubtext = isRecording
    ? "Tap again when you're done recording."
    : isProcessing
    ? "Processing the transcription..."
    : mode === "connecting"
    ? "Preparing the capture session..."
    : "Tap the microphone button to begin recording your task."

  const isButtonDisabled = isProcessing || mode === "connecting"

  return (
    <>
      <AppHeader title="Firebase Reminder App" onBack={onBack} />
      <main className="flex min-h-dvh flex-col items-center bg-white px-4 py-10 text-zinc-900 sm:px-6">
        <div className="w-full max-w-4xl space-y-8">
          <div className="flex flex-col gap-3 text-center sm:text-left">
            <p className="text-base text-zinc-600 sm:max-w-2xl">Record a task, review the transcription, and save it to Firebase Realtime Database.</p>
          </div>

          <section className="rounded-3xl border border-zinc-900/80 bg-zinc-950 p-6 shadow-[0_25px_120px_rgba(0,0,0,0.45)] sm:p-8">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
              <button
                type="button"
                onClick={handleClick}
                disabled={isButtonDisabled}
                className={`flex w-full items-center justify-center gap-3 rounded-full px-8 py-4 text-lg font-semibold text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto ${
                  isRecording ? "bg-red-600 hover:bg-red-500 focus-visible:outline-red-400" : "bg-zinc-900 hover:bg-zinc-800 focus-visible:outline-zinc-300"
                }`}
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-full ${isRecording ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-100"}`}>
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

            {(errorMessage || saveError) && <div className="mt-4 rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-200">{errorMessage || saveError}</div>}

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <article className="min-h-[160px] rounded-2xl border border-zinc-800/70 bg-zinc-900 p-4 text-sm text-zinc-200">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Live transcript</h2>
                <SelectableTranscript transcript={correctedTranscript || transcript} className="whitespace-pre-wrap leading-relaxed" onTranscriptUpdate={handleTranscriptUpdate} />
              </article>

              <article className="flex min-h-[160px] flex-col rounded-2xl border border-zinc-800/70 bg-zinc-900 p-4 text-sm leading-relaxed text-zinc-100">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Task status</h2>

                {isSaving ? (
                  <div className="mt-3 flex flex-1 items-center justify-center gap-2 text-zinc-300">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400" aria-hidden="true" />
                    Saving task to Firebase...
                  </div>
                ) : savedTaskId ? (
                  <div className="mt-3 flex flex-1 flex-col gap-3">
                    <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/15 p-4 text-sm text-emerald-200">
                      <h3 className="text-base font-semibold text-emerald-300">Task saved successfully!</h3>
                      <p className="mt-2">
                        <span className="font-medium text-emerald-200/80">Task ID:</span> {savedTaskId}
                      </p>
                      <p className="mt-1 text-xs text-emerald-200/70">The task has been added to Firebase Realtime Database.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleStartOver}
                      className="w-full rounded-full border border-zinc-600 px-6 py-3 text-sm font-semibold text-zinc-200 transition hover:border-zinc-400 hover:text-white"
                    >
                      Record another task
                    </button>
                  </div>
                ) : (correctedTranscript || transcript) && !isProcessing ? (
                  <div className="mt-3 flex flex-1 flex-col gap-3">
                    <p className="text-sm text-zinc-400">Review the transcription and save when ready.</p>

                    <div>
                      <label htmlFor="additional-info" className="block text-xs font-medium text-zinc-400 mb-2">
                        Additional info (optional)
                      </label>
                      <textarea
                        id="additional-info"
                        value={additionalInfo}
                        onChange={(e) => setAdditionalInfo(e.target.value)}
                        placeholder="e.g., Token address: 0x1234..."
                        rows={3}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveToFirebase}
                      disabled={isSaving || !(correctedTranscript.trim() || transcript.trim())}
                      className="w-full rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Save to Firebase
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-1 items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/80 p-4 text-center text-sm text-zinc-500">
                    {isProcessing ? (
                      <span className="flex items-center justify-center gap-2 text-zinc-300">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400" aria-hidden="true" />
                        Processing transcription...
                      </span>
                    ) : (
                      "The transcription will appear here after you stop recording."
                    )}
                  </div>
                )}
              </article>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
