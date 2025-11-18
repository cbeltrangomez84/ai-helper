"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { applyCorrectionsToText, invalidateCorrectionsCache } from "@/lib/wisprCorrections"
import { saveCorrectionsToFirebase } from "@/lib/firebaseCorrections"

interface SelectableTranscriptProps {
  transcript: string
  className?: string
  onTranscriptUpdate?: (updatedTranscript: string) => void
}

export function SelectableTranscript({ transcript, className = "", onTranscriptUpdate }: SelectableTranscriptProps) {
  const [selectedText, setSelectedText] = useState("")
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false)
  const [correctWord, setCorrectWord] = useState("")
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      return
    }

    const text = selection.toString().trim()
    if (!text || text.length === 0) {
      return
    }

    // Only show dialog if there's actually selected text
    if (text.length > 0) {
      // Get the position of the selected text
      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      
      setSelectedText(text)
      setCorrectWord(text) // By default, the correct word is the same
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
      })
      setShowCorrectionDialog(true)
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const handleMouseUp = (e: MouseEvent) => {
      // Only process if the event happened within our container
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        setTimeout(() => {
          handleTextSelection()
        }, 100)
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      // Only process if the event happened within our container
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        setTimeout(() => {
          handleTextSelection()
        }, 300)
      }
    }

    const container = containerRef.current
    container.addEventListener("mouseup", handleMouseUp)
    container.addEventListener("touchend", handleTouchEnd)

    return () => {
      container.removeEventListener("mouseup", handleMouseUp)
      container.removeEventListener("touchend", handleTouchEnd)
    }
  }, [handleTextSelection])

  const handleAddCorrection = useCallback(async () => {
    if (!selectedText.trim() || !correctWord.trim()) {
      return
    }

    setIsProcessing(true)

    try {
      // Step 1: Apply correction to current transcript
      const correctedTranscript = transcript.replace(selectedText, correctWord)
      onTranscriptUpdate?.(correctedTranscript)

      // Step 2: Extract individual corrections using OpenAI
      const extractResponse = await fetch("/api/corrections/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          original: transcript,
          changed: correctedTranscript,
        }),
      })

      if (!extractResponse.ok) {
        throw new Error("Failed to extract corrections")
      }

      const extractData = await extractResponse.json()
      if (!extractData.ok || !extractData.corrections || extractData.corrections.length === 0) {
        throw new Error("No corrections extracted")
      }

      // Step 3: Save corrections to Firebase
      await saveCorrectionsToFirebase(extractData.corrections)

      // Step 4: Invalidate cache so corrections are reloaded
      invalidateCorrectionsCache()

      setShowCorrectionDialog(false)
      setSelectedText("")
      setCorrectWord("")

      // Clear the selection
      if (window.getSelection) {
        window.getSelection()?.removeAllRanges()
      }

      // Show visual confirmation
      setShowSuccessMessage(true)
      if (containerRef.current) {
        containerRef.current.style.backgroundColor = "rgba(34, 197, 94, 0.2)"
        setTimeout(() => {
          if (containerRef.current) {
            containerRef.current.style.backgroundColor = ""
          }
          setShowSuccessMessage(false)
        }, 2000)
      }
    } catch (error) {
      console.error("Error adding correction:", error)
      alert("Failed to save correction. Please try again.")
    } finally {
      setIsProcessing(false)
    }
  }, [selectedText, correctWord, transcript, onTranscriptUpdate])

  const handleCancel = useCallback(() => {
    setShowCorrectionDialog(false)
    setSelectedText("")
    setCorrectWord("")
    if (window.getSelection) {
      window.getSelection()?.removeAllRanges()
    }
  }, [])

  // Close dialog if clicking outside (with delay to prevent immediate closure)
  useEffect(() => {
    if (!showCorrectionDialog) return

    let cleanup: (() => void) | null = null
    let timeoutId: NodeJS.Timeout

    // Add a delay before enabling click-outside detection to prevent immediate closure
    timeoutId = setTimeout(() => {
      const handleClickOutside = (event: MouseEvent | TouchEvent) => {
        const target = event.target as HTMLElement
        // Don't close if clicking inside the dialog or if clicking on the container (which might trigger selection)
        if (!target.closest(".correction-dialog") && !target.closest(".select-text")) {
          handleCancel()
        }
      }

      document.addEventListener("mousedown", handleClickOutside, true)
      document.addEventListener("touchstart", handleClickOutside, true)

      cleanup = () => {
        document.removeEventListener("mousedown", handleClickOutside, true)
        document.removeEventListener("touchstart", handleClickOutside, true)
      }
    }, 200)

    return () => {
      clearTimeout(timeoutId)
      if (cleanup) {
        cleanup()
      }
    }
  }, [showCorrectionDialog, handleCancel])

  // Focus input when dialog opens
  useEffect(() => {
    if (showCorrectionDialog && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 100)
    }
  }, [showCorrectionDialog])

  return (
    <>
      {showSuccessMessage && (
        <div className="mb-2 rounded-lg border border-emerald-500/50 bg-emerald-500/20 px-3 py-2 text-xs text-emerald-200">
          ✓ Correction applied and saved to Firebase.
        </div>
      )}
      {isProcessing && (
        <div className="mb-2 rounded-lg border border-amber-500/50 bg-amber-500/20 px-3 py-2 text-xs text-amber-200">
          Processing correction...
        </div>
      )}
      <div
        ref={containerRef}
        className={`select-text cursor-text ${className}`}
        style={{ 
          userSelect: "text", 
          WebkitUserSelect: "text",
          WebkitTouchCallout: "default",
          touchAction: "manipulation",
        }}
      >
        {transcript ? (
          <span className="select-all">{transcript}</span>
        ) : (
          <span className="text-zinc-500">Start a recording and the text will appear here in real time.</span>
        )}
      </div>

      {showCorrectionDialog && position && (
        <div
          className="correction-dialog fixed z-50 rounded-lg border border-zinc-700 bg-zinc-800 p-4 shadow-xl sm:max-w-[300px]"
          style={{
            left: window.innerWidth < 640 ? "10px" : `${Math.min(Math.max(position.x - 150, 10), window.innerWidth - 320)}px`,
            top: `${Math.max(position.y - 120, 10)}px`,
            width: window.innerWidth < 640 ? "calc(100vw - 20px)" : "300px",
          }}
        >
          <div className="mb-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Incorrectly understood word
            </label>
            <div className="mt-1 rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
              {selectedText}
            </div>
          </div>

          <div className="mb-3">
            <label htmlFor="correct-word" className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Correct word
            </label>
            <input
              ref={inputRef}
              id="correct-word"
              type="text"
              value={correctWord}
              onChange={(e) => setCorrectWord(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAddCorrection()
                } else if (e.key === "Escape") {
                  handleCancel()
                }
              }}
              className="mt-1 w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Enter the correct word"
              autoFocus
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAddCorrection}
              disabled={!correctWord.trim() || isProcessing}
              className="flex-1 rounded bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessing ? "Processing..." : "Add correction"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}

