"use client"

import { useCallback, useEffect, useRef, useState, type SVGProps } from "react"

import { AppHeader } from "@/components/AppHeader"
import { loadSprintConfigFromFirebase } from "@/lib/firebaseSprintConfig"
import { loadTeamMembersFromFirebase } from "@/lib/firebaseTeamMembers"
import { getBackEnGeneralListIdFromConfig } from "@/lib/firebaseSprintConfig"
import { WisprFlowClient } from "@/lib/wisprFlowClient"
import { loadCorrectionsFromFirebase } from "@/lib/wisprCorrections"

type TaskDraft = {
  title: string
  objective: string
  acceptanceCriteria: string
}

type SprintOption = {
  id: string
  name: string
  number: number | null
  firstMonday: number | null
}

type TeamMemberOption = {
  id: string
  name: string
  email: string
  howToAddress: string[]
}

type CreatedTask = {
  id?: string
  name?: string
  publicId?: string | null
  url?: string
  listId?: string
}

interface TaskEditViewProps {
  initialDraft: TaskDraft
  suggestedSprintId?: string | null
  suggestedAssigneeId?: string | null
  suggestedTimeEstimate?: string | null
  onBack?: () => void
  onTaskCreated?: (taskId: string, clickupTaskUrl: string) => Promise<void>
  onBackToList?: () => void // Callback to navigate back to list when task is created from Firebase
  originalText?: string
  firebaseTaskId?: string
  transcript?: string
}

const MicIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z" />
    <path d="M19 11a7 7 0 0 1-14 0" />
    <path d="M12 19v2" />
  </svg>
)

type EditMode = "idle" | "connecting" | "recording" | "finalizing"

export function TaskEditView({
  initialDraft,
  suggestedSprintId,
  suggestedAssigneeId,
  suggestedTimeEstimate,
  onBack,
  onTaskCreated,
  onBackToList,
  originalText,
  firebaseTaskId,
  transcript,
}: TaskEditViewProps) {
  const [draft, setDraft] = useState<TaskDraft>(initialDraft)
  const [primaryListId, setPrimaryListId] = useState<string | null>(null)
  const [assigneeId, setAssigneeId] = useState<string | null>(suggestedAssigneeId || null)
  const [sprintId, setSprintId] = useState<string | null>(suggestedSprintId || null)
  const [timeEstimate, setTimeEstimate] = useState<string>(suggestedTimeEstimate || "")
  const [sprints, setSprints] = useState<SprintOption[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([])

  // Set suggestedTimeEstimate only on initial mount if field is empty
  // This prevents overwriting user input when they type manually
  useEffect(() => {
    if (suggestedTimeEstimate && !timeEstimate.trim()) {
      console.log("[TaskEditView] Setting initial suggestedTimeEstimate:", suggestedTimeEstimate)
      setTimeEstimate(suggestedTimeEstimate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount
  const [loading, setLoading] = useState(true)
  const [isCreatingTask, setIsCreatingTask] = useState(false)
  const [taskInfo, setTaskInfo] = useState<CreatedTask | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<"title" | "objective" | "acceptanceCriteria" | null>(null)
  const [editInstruction, setEditInstruction] = useState("")
  const [isEditingWithAI, setIsEditingWithAI] = useState(false)
  const [editPreview, setEditPreview] = useState<{ field: string; oldValue: string; newValue: string } | null>(null)
  const [editMode, setEditMode] = useState<EditMode>("idle")
  const [editTranscript, setEditTranscript] = useState("")
  const [correctionsDict, setCorrectionsDict] = useState<Record<string, string> | undefined>(undefined)

  const editClientRef = useRef<WisprFlowClient | null>(null)

  // Declare resetEditClient before it's used in useEffect
  const resetEditClient = useCallback(() => {
    editClientRef.current?.dispose()
    editClientRef.current = null
  }, [])

  // Load corrections from Firebase on mount
  useEffect(() => {
    loadCorrectionsFromFirebase().then((corrections) => {
      setCorrectionsDict(Object.keys(corrections).length > 0 ? corrections : undefined)
    })
  }, [])

  // Reset edit state when editing field changes
  useEffect(() => {
    if (!editingField) {
      resetEditClient()
      setEditMode("idle")
      setEditTranscript("")
      setEditInstruction("")
      setEditPreview(null)
    }
  }, [editingField, resetEditClient])

  // Load configuration data
  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true)
      try {
        // Load primary list ID
        const defaultListId = await getBackEnGeneralListIdFromConfig()
        setPrimaryListId(defaultListId)

        // Load sprints
        const sprintConfig = await loadSprintConfigFromFirebase()
        if (sprintConfig && sprintConfig.sprints) {
          const sprintsArray = Object.values(sprintConfig.sprints)
            .filter((s) => s && s.id)
            .map((s) => ({
              id: s.id,
              name: s.name,
              number: s.number,
              firstMonday: s.firstMonday,
            }))
            .sort((a, b) => {
              // Sort by number if available, otherwise by start date
              if (a.number !== null && b.number !== null) {
                return b.number - a.number
              }
              return 0
            })
          setSprints(sprintsArray)

          // Set suggested sprint if provided
          if (suggestedSprintId && sprintsArray.find((s) => s.id === suggestedSprintId)) {
            setSprintId(suggestedSprintId)
          }
        }

        // Load team members
        const membersData = await loadTeamMembersFromFirebase()
        if (membersData && membersData.members) {
          const membersArray = Object.values(membersData.members)
            .filter((m) => m && m.id)
            .map((m) => ({
              id: m.id,
              name: m.name,
              email: m.email,
              howToAddress: m.howToAddress || [],
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
          setTeamMembers(membersArray)

          // Set suggested assignee if provided
          if (suggestedAssigneeId && membersArray.find((m) => m.id === suggestedAssigneeId)) {
            setAssigneeId(suggestedAssigneeId)
          }
        }
      } catch (err) {
        console.error("Failed to load configuration", err)
        setError("Failed to load configuration data")
      } finally {
        setLoading(false)
      }
    }

    loadConfig()
  }, [suggestedSprintId, suggestedAssigneeId])

  const handleFieldChange = useCallback((field: keyof TaskDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }))
  }, [])

  useEffect(() => {
    return () => {
      resetEditClient()
    }
  }, [resetEditClient])

  const startEditRecording = useCallback(async () => {
    if (!editingField) return

    // Reset any previous recording state
    resetEditClient()
    setError(null)
    setEditTranscript("")
    setEditMode("connecting")

    const client = new WisprFlowClient({
      onStatus: (message) => {
        // Update status if needed
      },
      onPartial: (text) => setEditTranscript(text),
      onError: (error) => {
        console.error("Wispr error", error)
        setError(error.message)
        setEditMode("idle")
        resetEditClient()
      },
    })

    editClientRef.current = client

    try {
      await client.start({
        languages: ["es", "en"],
        corrections: correctionsDict,
      })
      setEditMode("recording")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start the audio capture."
      setError(message)
      resetEditClient()
      setEditMode("idle")
    }
  }, [editingField, resetEditClient, correctionsDict])

  const stopEditRecording = useCallback(async () => {
    if (!editClientRef.current || !editingField) {
      return
    }

    setEditMode("finalizing")
    setIsEditingWithAI(true)

    try {
      const finalText = await editClientRef.current.finalize()
      if (finalText) {
        setEditTranscript(finalText)
        // Use the transcript as the instruction
        setEditInstruction(finalText)
        // Automatically process the edit
        await processEditWithAI(finalText)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not complete the transcription."
      setError(message)
    } finally {
      resetEditClient()
      setEditMode("idle")
      setIsEditingWithAI(false)
    }
  }, [editingField, resetEditClient])

  const processEditWithAI = useCallback(
    async (instruction: string) => {
      if (!editingField || !instruction.trim()) {
        return
      }

      setIsEditingWithAI(true)
      setError(null)

      try {
        const response = await fetch("/api/task/edit-field", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            field: editingField,
            currentValue: draft[editingField],
            instruction: instruction.trim(),
            context: {
              title: draft.title,
              objective: draft.objective,
              acceptanceCriteria: draft.acceptanceCriteria,
            },
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || "Failed to edit field with AI")
        }

        const data = await response.json()
        setEditPreview({
          field: editingField,
          oldValue: draft[editingField],
          newValue: data.newValue,
        })
        setEditInstruction("") // Clear instruction after processing
      } catch (err) {
        console.error("Failed to edit field with AI", err)
        setError(err instanceof Error ? err.message : "Unable to edit field with AI")
      } finally {
        setIsEditingWithAI(false)
      }
    },
    [editingField, draft]
  )

  const handleEditWithAI = useCallback(async () => {
    if (!editingField || !editInstruction.trim()) {
      return
    }

    await processEditWithAI(editInstruction)
  }, [editingField, editInstruction, processEditWithAI])

  const handleEditClick = useCallback(async () => {
    if (!editingField) return

    if (editMode === "recording") {
      await stopEditRecording()
    } else if (editMode === "idle") {
      await startEditRecording()
    }
  }, [editingField, editMode, startEditRecording, stopEditRecording])

  const handleAcceptPreview = useCallback(() => {
    if (!editPreview) return

    handleFieldChange(editPreview.field as keyof TaskDraft, editPreview.newValue)
    setEditPreview(null)
    setEditingField(null)
    setEditInstruction("")
  }, [editPreview, handleFieldChange])

  const handleRejectPreview = useCallback(() => {
    setEditPreview(null)
    setEditingField(null)
    setEditInstruction("")
  }, [])

  const handleCreateTask = useCallback(async () => {
    if (!draft.title.trim() || !draft.objective.trim()) {
      setError("Title and Objective are required")
      return
    }

    setIsCreatingTask(true)
    setError(null)

    try {
      // Get first Monday from selected sprint (use as both start and due date)
      let startDate: number | null = null
      let dueDate: number | null = null
      if (sprintId) {
        const selectedSprint = sprints.find((s) => s.id === sprintId)
        if (selectedSprint?.firstMonday) {
          startDate = selectedSprint.firstMonday
          dueDate = selectedSprint.firstMonday // Same date for start and due
        }
      }

      // Get current timeEstimate value directly from state (not from closure)
      // Use a function to get the latest value
      const currentTimeEstimate = timeEstimate.trim()
      const finalTimeEstimate = currentTimeEstimate.length > 0 ? currentTimeEstimate : null

      console.log("[TaskEditView] Creating task with time estimate:", {
        currentState: timeEstimate,
        trimmed: currentTimeEstimate,
        final: finalTimeEstimate,
      })

      const requestBody = {
        title: draft.title.trim(),
        objective: draft.objective.trim(),
        acceptanceCriteria: draft.acceptanceCriteria.trim(),
        primaryListId: primaryListId,
        assigneeId: assigneeId,
        sprintId: sprintId,
        startDate: startDate,
        dueDate: dueDate,
        timeEstimate: finalTimeEstimate,
      }

      console.log("[TaskEditView] Sending task creation request:", {
        ...requestBody,
        timeEstimate: requestBody.timeEstimate,
      })

      const response = await fetch("/api/clickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || "ClickUp did not accept the task request.")
      }

      const payload: { task?: CreatedTask } = await response.json()
      if (!payload.task || !payload.task.url) {
        throw new Error("ClickUp did not return task details or URL.")
      }

      setTaskInfo(payload.task)

      // If onTaskCreated callback exists (from Firebase task), call it
      if (onTaskCreated && payload.task.url && firebaseTaskId) {
        await onTaskCreated(firebaseTaskId, payload.task.url)
      }
    } catch (err) {
      console.error("Failed to create ClickUp task", err)
      setError(err instanceof Error ? err.message : "Unable to create the task in ClickUp.")
    } finally {
      setIsCreatingTask(false)
    }
  }, [draft, primaryListId, assigneeId, sprintId, sprints, timeEstimate, onTaskCreated, firebaseTaskId, onBackToList])

  const selectedSprint = sprints.find((s) => s.id === sprintId)
  const selectedMember = teamMembers.find((m) => m.id === assigneeId)

  // Determine which back handler to use
  // If task was created successfully and comes from Firebase, navigate to list
  // Otherwise, use the regular onBack handler
  const handleBackClick = useCallback(() => {
    if (taskInfo && firebaseTaskId && onBackToList) {
      // Task was created successfully from Firebase, go back to list
      onBackToList()
    } else if (onBack) {
      // Regular back navigation
      onBack()
    }
  }, [taskInfo, firebaseTaskId, onBackToList, onBack])

  return (
    <>
      {(onBack || onBackToList) && <AppHeader title="Edit Task" onBack={handleBackClick} />}
      <main className="flex min-h-dvh flex-col items-center bg-white px-4 py-10 text-zinc-900 sm:px-6">
        <div className="w-full max-w-4xl space-y-8">
          <div className="flex flex-col gap-3 text-center sm:text-left">
            <h1 className="text-2xl font-semibold text-zinc-900">Edit Task Details</h1>
            <p className="text-base text-zinc-600">Review and edit all task parameters before creating.</p>
          </div>

          {/* Show transcript if available */}
          {transcript && (
            <section className="rounded-3xl border border-zinc-900/80 bg-zinc-950 p-6 shadow-[0_25px_120px_rgba(0,0,0,0.45)] sm:p-8">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Your Transcription</h2>
              <p className="text-sm text-zinc-200 whitespace-pre-wrap">{transcript}</p>
            </section>
          )}

          {originalText && (
            <section className="rounded-3xl border border-zinc-900/80 bg-zinc-950 p-6 shadow-[0_25px_120px_rgba(0,0,0,0.45)] sm:p-8">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Original Text</h2>
              <p className="text-sm text-zinc-200 whitespace-pre-wrap">{originalText}</p>
            </section>
          )}

          {error && <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-600">{error}</div>}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="flex items-center gap-2 text-zinc-600">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" aria-hidden="true" />
                Loading configuration...
              </span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Title Field */}
              <section className="rounded-3xl border border-zinc-900/80 bg-zinc-950 p-6 shadow-[0_25px_120px_rgba(0,0,0,0.45)] sm:p-8">
                <div className="mb-4 flex items-center justify-between">
                  <label className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Title *</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (editingField === "title") {
                        resetEditClient()
                        setEditMode("idle")
                        setEditTranscript("")
                        setEditInstruction("")
                        setEditPreview(null)
                      }
                      setEditingField(editingField === "title" ? null : "title")
                    }}
                    className="rounded-full border border-emerald-500/40 px-4 py-1.5 text-xs font-semibold text-emerald-200 transition hover:border-emerald-400 hover:text-emerald-100"
                  >
                    {editingField === "title" ? "Cancel" : "Edit with AI"}
                  </button>
                </div>
                <textarea
                  value={draft.title}
                  onChange={(e) => handleFieldChange("title", e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                  placeholder="Enter task title"
                  rows={2}
                />
                {editingField === "title" && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleEditClick}
                        disabled={editMode === "connecting" || editMode === "finalizing" || isEditingWithAI}
                        className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                          editMode === "recording"
                            ? "border border-red-500/60 bg-red-500/20 text-red-100 hover:border-red-400"
                            : "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400"
                        }`}
                      >
                        <MicIcon className="h-4 w-4" />
                        {editMode === "recording" ? "Stop Recording" : editMode === "connecting" ? "Connecting..." : editMode === "finalizing" ? "Processing..." : "Record Voice"}
                      </button>
                      {editMode === "idle" && editInstruction.trim() && (
                        <button
                          type="button"
                          onClick={handleEditWithAI}
                          disabled={isEditingWithAI}
                          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {isEditingWithAI ? "Processing..." : "Apply AI Edit"}
                        </button>
                      )}
                    </div>
                    {(editTranscript || editInstruction) && (
                      <textarea
                        value={editTranscript || editInstruction}
                        onChange={(e) => {
                          setEditTranscript("")
                          setEditInstruction(e.target.value)
                        }}
                        placeholder="Enter instructions for editing the title or record voice..."
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        rows={3}
                        disabled={editMode === "recording"}
                      />
                    )}
                    {editMode === "idle" && editInstruction.trim() && (
                      <button
                        type="button"
                        onClick={handleEditWithAI}
                        disabled={isEditingWithAI}
                        className="w-full rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isEditingWithAI ? "Processing..." : "Apply AI Edit"}
                      </button>
                    )}
                  </div>
                )}
              </section>

              {/* Objective Field */}
              <section className="rounded-3xl border border-zinc-900/80 bg-zinc-950 p-6 shadow-[0_25px_120px_rgba(0,0,0,0.45)] sm:p-8">
                <div className="mb-4 flex items-center justify-between">
                  <label className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Objective *</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (editingField === "objective") {
                        resetEditClient()
                        setEditMode("idle")
                        setEditTranscript("")
                        setEditInstruction("")
                        setEditPreview(null)
                      }
                      setEditingField(editingField === "objective" ? null : "objective")
                    }}
                    className="rounded-full border border-emerald-500/40 px-4 py-1.5 text-xs font-semibold text-emerald-200 transition hover:border-emerald-400 hover:text-emerald-100"
                  >
                    {editingField === "objective" ? "Cancel" : "Edit with AI"}
                  </button>
                </div>
                <textarea
                  value={draft.objective}
                  onChange={(e) => handleFieldChange("objective", e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="Enter task objective"
                  rows={4}
                />
                {editingField === "objective" && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleEditClick}
                        disabled={editMode === "connecting" || editMode === "finalizing" || isEditingWithAI}
                        className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                          editMode === "recording"
                            ? "border border-red-500/60 bg-red-500/20 text-red-100 hover:border-red-400"
                            : "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400"
                        }`}
                      >
                        <MicIcon className="h-4 w-4" />
                        {editMode === "recording" ? "Stop Recording" : editMode === "connecting" ? "Connecting..." : editMode === "finalizing" ? "Processing..." : "Record Voice"}
                      </button>
                      {editMode === "idle" && editInstruction.trim() && (
                        <button
                          type="button"
                          onClick={handleEditWithAI}
                          disabled={isEditingWithAI}
                          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {isEditingWithAI ? "Processing..." : "Apply AI Edit"}
                        </button>
                      )}
                    </div>
                    {(editTranscript || editInstruction) && (
                      <textarea
                        value={editTranscript || editInstruction}
                        onChange={(e) => {
                          setEditTranscript("")
                          setEditInstruction(e.target.value)
                        }}
                        placeholder="Enter instructions for editing the objective or record voice..."
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        rows={3}
                        disabled={editMode === "recording"}
                      />
                    )}
                    {editMode === "idle" && editInstruction.trim() && (
                      <button
                        type="button"
                        onClick={handleEditWithAI}
                        disabled={isEditingWithAI}
                        className="w-full rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isEditingWithAI ? "Processing..." : "Apply AI Edit"}
                      </button>
                    )}
                  </div>
                )}
              </section>

              {/* Acceptance Criteria Field */}
              <section className="rounded-3xl border border-zinc-900/80 bg-zinc-950 p-6 shadow-[0_25px_120px_rgba(0,0,0,0.45)] sm:p-8">
                <div className="mb-4 flex items-center justify-between">
                  <label className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Acceptance Criteria</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (editingField === "acceptanceCriteria") {
                        resetEditClient()
                        setEditMode("idle")
                        setEditTranscript("")
                        setEditInstruction("")
                        setEditPreview(null)
                      }
                      setEditingField(editingField === "acceptanceCriteria" ? null : "acceptanceCriteria")
                    }}
                    className="rounded-full border border-emerald-500/40 px-4 py-1.5 text-xs font-semibold text-emerald-200 transition hover:border-emerald-400 hover:text-emerald-100"
                  >
                    {editingField === "acceptanceCriteria" ? "Cancel" : "Edit with AI"}
                  </button>
                </div>
                <textarea
                  value={draft.acceptanceCriteria}
                  onChange={(e) => handleFieldChange("acceptanceCriteria", e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="Enter acceptance criteria"
                  rows={6}
                />
                {editingField === "acceptanceCriteria" && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleEditClick}
                        disabled={editMode === "connecting" || editMode === "finalizing" || isEditingWithAI}
                        className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                          editMode === "recording"
                            ? "border border-red-500/60 bg-red-500/20 text-red-100 hover:border-red-400"
                            : "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400"
                        }`}
                      >
                        <MicIcon className="h-4 w-4" />
                        {editMode === "recording" ? "Stop Recording" : editMode === "connecting" ? "Connecting..." : editMode === "finalizing" ? "Processing..." : "Record Voice"}
                      </button>
                      {editMode === "idle" && editInstruction.trim() && (
                        <button
                          type="button"
                          onClick={handleEditWithAI}
                          disabled={isEditingWithAI}
                          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {isEditingWithAI ? "Processing..." : "Apply AI Edit"}
                        </button>
                      )}
                    </div>
                    {(editTranscript || editInstruction) && (
                      <textarea
                        value={editTranscript || editInstruction}
                        onChange={(e) => {
                          setEditTranscript("")
                          setEditInstruction(e.target.value)
                        }}
                        placeholder="Enter instructions for editing the acceptance criteria or record voice..."
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        rows={3}
                        disabled={editMode === "recording"}
                      />
                    )}
                    {editMode === "idle" && editInstruction.trim() && (
                      <button
                        type="button"
                        onClick={handleEditWithAI}
                        disabled={isEditingWithAI}
                        className="w-full rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isEditingWithAI ? "Processing..." : "Apply AI Edit"}
                      </button>
                    )}
                  </div>
                )}
              </section>

              {/* Preview of AI Edits */}
              {editPreview && (
                <section className="rounded-3xl border-2 border-amber-500 bg-zinc-900 p-6 shadow-[0_25px_120px_rgba(0,0,0,0.45)] sm:p-8">
                  <h3 className="mb-4 text-base font-bold uppercase tracking-wide text-amber-400">Preview Changes</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-500">Current:</p>
                      <div className="rounded-lg border-2 border-amber-600/60 bg-amber-950/80 p-4">
                        <p className="text-sm text-amber-100 whitespace-pre-wrap leading-relaxed">{editPreview.oldValue || "(empty)"}</p>
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-500">New:</p>
                      <div className="rounded-lg border-2 border-emerald-600/60 bg-emerald-950/80 p-4">
                        <p className="text-sm text-emerald-100 whitespace-pre-wrap leading-relaxed">{editPreview.newValue}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 flex gap-3">
                    <button
                      type="button"
                      onClick={handleAcceptPreview}
                      className="flex-1 rounded-full bg-emerald-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    >
                      Accept Changes
                    </button>
                    <button
                      type="button"
                      onClick={handleRejectPreview}
                      className="flex-1 rounded-full border-2 border-zinc-600 bg-zinc-800 px-6 py-3 text-sm font-bold text-zinc-200 transition hover:border-zinc-400 hover:bg-zinc-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
                    >
                      Reject Changes
                    </button>
                  </div>
                </section>
              )}

              {/* Task Configuration */}
              <section className="rounded-3xl border border-zinc-900/80 bg-zinc-950 p-6 shadow-[0_25px_120px_rgba(0,0,0,0.45)] sm:p-8">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">Task Configuration</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Primary List */}
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Primary List</label>
                    <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white">General (Backend)</div>
                    <p className="mt-1 text-xs text-zinc-500">Default list for all tasks</p>
                  </div>

                  {/* Assignee */}
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Assignee</label>
                    <select
                      value={assigneeId || ""}
                      onChange={(e) => setAssigneeId(e.target.value || null)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">None</option>
                      {teamMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name} ({member.email})
                        </option>
                      ))}
                    </select>
                    {selectedMember && (
                      <p className="mt-1 text-xs text-zinc-500">
                        Address as: {selectedMember.howToAddress.join(", ")}
                        {suggestedAssigneeId === selectedMember.id && <span className="ml-1 text-emerald-400">(AI suggested)</span>}
                      </p>
                    )}
                  </div>

                  {/* Sprint */}
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Sprint (Secondary List)</label>
                    <select
                      value={sprintId || ""}
                      onChange={(e) => setSprintId(e.target.value || null)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">None</option>
                      {sprints.map((sprint) => (
                        <option key={sprint.id} value={sprint.id}>
                          {sprint.number !== null ? `Sprint ${sprint.number}` : sprint.name}
                        </option>
                      ))}
                    </select>
                    {selectedSprint && (
                      <p className="mt-1 text-xs text-zinc-500">
                        {selectedSprint.firstMonday ? `Start/Due: ${new Date(selectedSprint.firstMonday).toLocaleDateString("es-ES")}` : "No start date"}
                        {suggestedSprintId === selectedSprint.id && <span className="ml-1 text-emerald-400">(AI suggested)</span>}
                      </p>
                    )}
                  </div>

                  {/* Time Estimate */}
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Time Estimate</label>
                    <input
                      type="text"
                      value={timeEstimate}
                      onChange={(e) => {
                        const newValue = e.target.value
                        console.log("[TaskEditView] Time estimate input changed:", newValue)
                        setTimeEstimate(newValue)
                      }}
                      placeholder="e.g., 2h, 30m, 1d"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <p className="mt-1 text-xs text-zinc-500">Format: 2h, 30m, 1d, etc.</p>
                  </div>
                </div>
              </section>

              {/* Create Task Button - Hide if task already created */}
              {!taskInfo && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCreateTask}
                    disabled={isCreatingTask || !draft.title.trim() || !draft.objective.trim()}
                    className="rounded-full bg-white px-8 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isCreatingTask ? "Creating task..." : "Create ClickUp Task"}
                  </button>
                </div>
              )}

              {/* Success Message */}
              {taskInfo && (
                <section className="rounded-3xl border border-emerald-500/40 bg-emerald-500/15 p-6 shadow-[0_25px_120px_rgba(0,0,0,0.45)] sm:p-8">
                  <h3 className="text-base font-semibold text-emerald-300">Task created successfully!</h3>
                  <p className="mt-2 text-sm text-emerald-200">
                    <span className="font-medium">Name:</span> {taskInfo.name}
                  </p>
                  <p className="text-sm text-emerald-200">
                    <span className="font-medium">ID:</span> {taskInfo.publicId || taskInfo.id || "N/A"}
                  </p>
                  {taskInfo.url && (
                    <p className="mt-2">
                      <a className="text-emerald-300 underline" href={taskInfo.url} target="_blank" rel="noreferrer">
                        Open in ClickUp
                      </a>
                    </p>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
