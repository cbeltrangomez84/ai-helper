"use client"

import { useCallback, useEffect, useState } from "react"

import { AppHeader } from "@/components/AppHeader"
import { getPendingTasks, moveTaskToCompleted, type FirebaseTaskWithId } from "@/lib/firebaseTasks"
import { TaskDetailView } from "./TaskDetailView"

export function FirebaseTasksManager({ onBack }: { onBack: () => void }) {
  const [tasks, setTasks] = useState<FirebaseTaskWithId[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<FirebaseTaskWithId | null>(null)

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const pendingTasks = await getPendingTasks()
      setTasks(pendingTasks)
    } catch (err) {
      console.error("Failed to load tasks", err)
      setError(err instanceof Error ? err.message : "Unable to load tasks from Firebase.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const handleTaskClick = useCallback((task: FirebaseTaskWithId) => {
    setSelectedTask(task)
  }, [])

  const handleTaskCreated = useCallback(
    async (taskId: string, clickupTaskUrl: string) => {
      try {
        await moveTaskToCompleted(taskId, clickupTaskUrl)
        // Reload tasks to remove the completed one (but stay on detail view)
        await loadTasks()
        // Don't navigate back - let user see the success message and click back manually
      } catch (err) {
        console.error("Failed to move task to completed", err)
        throw err
      }
    },
    [loadTasks]
  )

  const handleBackFromDetail = useCallback(() => {
    setSelectedTask(null)
  }, [])

  if (selectedTask) {
    return <TaskDetailView task={selectedTask} onBack={handleBackFromDetail} onTaskCreated={handleTaskCreated} />
  }

  return (
    <>
      <AppHeader title="Firebase Tasks Manager" onBack={onBack} />
      <main className="flex min-h-dvh flex-col items-center bg-white px-4 py-10 text-zinc-900 sm:px-6">
        <div className="w-full max-w-4xl space-y-8">
          <div className="flex flex-col gap-3 text-center sm:text-left">
            <h1 className="text-2xl font-semibold text-zinc-900">Pending Tasks</h1>
            <p className="text-base text-zinc-600">
              {loading ? "Loading..." : `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} pending`}
            </p>
          </div>

          {error && <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-600">{error}</div>}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="flex items-center gap-2 text-zinc-600">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" aria-hidden="true" />
                Loading tasks...
              </span>
            </div>
          ) : tasks.length === 0 ? (
            <div className="rounded-3xl border border-zinc-900/80 bg-zinc-950 p-8 text-center shadow-[0_25px_120px_rgba(0,0,0,0.45)]">
              <p className="text-zinc-400">No pending tasks. All tasks have been completed!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => handleTaskClick(task)}
                  className="w-full rounded-2xl border border-zinc-900/80 bg-zinc-950 p-6 text-left shadow-[0_25px_120px_rgba(0,0,0,0.45)] transition hover:border-zinc-700 hover:shadow-[0_25px_120px_rgba(0,0,0,0.55)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-300"
                >
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-zinc-400">
                      {new Date(task.createdAt).toLocaleDateString("es-ES", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-base text-white whitespace-pre-wrap">{task.text}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}

