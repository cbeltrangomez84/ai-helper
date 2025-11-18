"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { WisprFlowClient } from "@/lib/wisprFlowClient"

export type RecordingMode = "idle" | "connecting" | "recording" | "finalizing"

export interface UseVoiceRecordingOptions {
  onTranscript?: (transcript: string) => void
  onError?: (error: Error) => void
  languages?: string[]
}

export function useVoiceRecording(options: UseVoiceRecordingOptions = {}) {
  const { onTranscript, onError, languages = ["es", "en"] } = options

  const [mode, setMode] = useState<RecordingMode>("idle")
  const [transcript, setTranscript] = useState("")
  const [status, setStatus] = useState("Ready to capture speech whenever you are.")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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

  const startRecording = useCallback(async () => {
    resetClient()
    setErrorMessage(null)
    setTranscript("")
    setMode("connecting")
    setStatus("Preparing the recording...")

    const client = new WisprFlowClient({
      onStatus: (message) => setStatus(formatStatusMessage(message)),
      onPartial: (text) => {
        setTranscript(text)
      },
      onError: (error) => {
        console.error("Wispr error", error)
        const message = error.message
        setErrorMessage(message)
        setStatus("An error occurred while capturing audio.")
        setMode("idle")
        resetClient()
        onError?.(error)
      },
    })

    clientRef.current = client

    try {
      await client.start({ languages })
      setMode("recording")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start the audio capture."
      setErrorMessage(message)
      setStatus(formatStatusMessage(message))
      resetClient()
      setMode("idle")
      onError?.(error instanceof Error ? error : new Error(message))
    }
  }, [formatStatusMessage, languages, onError, resetClient])

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!clientRef.current) {
      return null
    }

    setMode("finalizing")
    setStatus("Processing transcription...")

    try {
      const finalText = await clientRef.current.finalize()
      if (finalText) {
        setTranscript(finalText)
        onTranscript?.(finalText)
        return finalText
      }
      return null
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not complete the transcription."
      setErrorMessage(message)
      setStatus(formatStatusMessage(message))
      onError?.(error instanceof Error ? error : new Error(message))
      return null
    } finally {
      resetClient()
      setMode("idle")
    }
  }, [formatStatusMessage, onError, onTranscript, resetClient])

  const reset = useCallback(() => {
    resetClient()
    setMode("idle")
    setStatus("Ready to capture speech whenever you are.")
    setTranscript("")
    setErrorMessage(null)
  }, [resetClient])

  return {
    mode,
    transcript,
    status,
    errorMessage,
    startRecording,
    stopRecording,
    reset,
    isRecording: mode === "recording",
    isProcessing: mode === "finalizing" || mode === "connecting",
  }
}

