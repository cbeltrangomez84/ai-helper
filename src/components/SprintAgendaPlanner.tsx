"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"

import { AppHeader } from "@/components/AppHeader"
import { loadSprintConfigFromFirebase, type SprintConfig } from "@/lib/firebaseSprintConfig"
import { loadTeamMembersFromFirebase, type TeamMember } from "@/lib/firebaseTeamMembers"

type PlannerTask = {
  id: string
  name: string
  status: string
  dueDate: number | null
  startDate: number | null
  timeEstimate: number | null
  assigneeIds: string[]
  url: string | null
  description: string
  objective: string
  acceptanceCriteria: string
  listId: string | null
  listName: string | null
}

type SprintDay = {
  key: string
  label: string
  date: Date
}

type PlannerUpdateInput = {
  name?: string
  objective?: string
  acceptanceCriteria?: string
  assigneeId?: string | null
  dueDate?: number | null
  startDate?: number | null
  timeEstimateMs?: number | null
}

type DrawerSubmitPayload = {
  name: string
  objective: string
  acceptanceCriteria: string
  assigneeId: string | null
  dayKey: string
  hours: number | null
}

const UNPLANNED_KEY = "unplanned"

export function SprintAgendaPlanner({ onBack }: { onBack: () => void }) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [membersError, setMembersError] = useState<string | null>(null)

  const [sprints, setSprints] = useState<SprintConfig[]>([])
  const [sprintsLoading, setSprintsLoading] = useState(true)
  const [sprintsError, setSprintsError] = useState<string | null>(null)

  const [selectedMemberId, setSelectedMemberId] = useState<string>("")
  const [selectedSprintId, setSelectedSprintId] = useState<string>("")

  const [tasks, setTasks] = useState<PlannerTask[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [tasksError, setTasksError] = useState<string | null>(null)
  const [remoteSprintMeta, setRemoteSprintMeta] = useState<Partial<SprintConfig> | null>(null)

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [pendingTaskIds, setPendingTaskIds] = useState<Record<string, boolean>>({})
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const [drawerTask, setDrawerTask] = useState<PlannerTask | null>(null)
  const [drawerSaving, setDrawerSaving] = useState(false)
  const [drawerError, setDrawerError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setMembersLoading(true)
    setMembersError(null)
    loadTeamMembersFromFirebase()
      .then((data) => {
        if (!active) return
        const membersArray = data?.members ? Object.values(data.members) : []
        const sorted = membersArray.sort((a, b) => a.name.localeCompare(b.name))
        setMembers(sorted)
      })
      .catch((error) => {
        if (!active) return
        console.error("[SprintAgenda] Failed to load members:", error)
        setMembersError(error instanceof Error ? error.message : "No pudimos cargar los miembros del equipo.")
        setMembers([])
      })
      .finally(() => {
        if (active) {
          setMembersLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    setSprintsLoading(true)
    setSprintsError(null)
    loadSprintConfigFromFirebase()
      .then((data) => {
        if (!active) return
        const sprintsArray = data?.sprints ? Object.values(data.sprints) : []
        const sorted = sprintsArray.sort((a, b) => {
          const aDate = a.startDate || 0
          const bDate = b.startDate || 0
          return bDate - aDate
        })
        setSprints(sorted)
      })
      .catch((error) => {
        if (!active) return
        console.error("[SprintAgenda] Failed to load sprints:", error)
        setSprintsError(error instanceof Error ? error.message : "No pudimos cargar los sprints.")
        setSprints([])
      })
      .finally(() => {
        if (active) {
          setSprintsLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!selectedMemberId && members.length > 0) {
      setSelectedMemberId(members[0].id)
    }
  }, [members, selectedMemberId])

  useEffect(() => {
    if (!selectedSprintId && sprints.length > 0) {
      setSelectedSprintId(sprints[0].id)
    }
  }, [sprints, selectedSprintId])

  useEffect(() => {
    if (!selectedMemberId || !selectedSprintId) {
      setTasks([])
      return
    }

    const controller = new AbortController()
    setTasksLoading(true)
    setTasksError(null)
    setRemoteSprintMeta(null)
    setDrawerTask(null)

    const params = new URLSearchParams({
      sprintId: selectedSprintId,
      assigneeId: selectedMemberId,
    })

    fetch(`/api/clickup/sprint-planner?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok || !data.ok) {
          throw new Error(data?.message || "No pudimos cargar las tareas desde ClickUp.")
        }
        setTasks(Array.isArray(data.tasks) ? data.tasks : [])
        setRemoteSprintMeta(data.sprint || null)
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return
        }
        console.error("[SprintAgenda] Failed to load tasks:", error)
        setTasks([])
        setTasksError(error instanceof Error ? error.message : "No pudimos cargar las tareas.")
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setTasksLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [selectedMemberId, selectedSprintId])

  useEffect(() => {
    if (!drawerTask) {
      return
    }
    const updatedTask = tasks.find((task) => task.id === drawerTask.id)
    if (updatedTask) {
      setDrawerTask(updatedTask)
    }
  }, [tasks, drawerTask])

  useEffect(() => {
    if (!banner) {
      return
    }
    const timeout = setTimeout(() => setBanner(null), 4000)
    return () => clearTimeout(timeout)
  }, [banner])

  const selectedMember = members.find((member) => member.id === selectedMemberId) || null
  const selectedSprint = sprints.find((sprint) => sprint.id === selectedSprintId) || null
  const activeSprint = selectedSprint || (remoteSprintMeta as SprintConfig | null) || null

  const sprintDays = useMemo(() => buildSprintDays(activeSprint), [activeSprint])
  const dayKeySet = useMemo(() => new Set(sprintDays.map((day) => day.key)), [sprintDays])

  const { dayBuckets, unplannedTasks } = useMemo(() => {
    const buckets = sprintDays.map((day) => ({
      day,
      tasks: [] as PlannerTask[],
    }))
    const bucketMap = new Map<string, PlannerTask[]>()
    buckets.forEach(({ day }) => bucketMap.set(day.key, []))

    const unplanned: PlannerTask[] = []
    tasks.forEach((task) => {
      const key = getTaskDayKey(task)
      const bucket = bucketMap.get(key)
      if (bucket) {
        bucket.push(task)
      } else {
        unplanned.push(task)
      }
    })

    return {
      dayBuckets: buckets.map(({ day }) => ({
        day,
        tasks: bucketMap.get(day.key) ?? [],
      })),
      unplannedTasks: unplanned,
    }
  }, [tasks, sprintDays])

  const totalHours = useMemo(() => {
    return tasks.reduce((sum, task) => sum + msToHours(task.timeEstimate), 0)
  }, [tasks])

  const weekRangeLabel = useMemo(() => {
    if (sprintDays.length === 0) {
      return "Sin fechas definidas"
    }
    const first = sprintDays[0].date
    const last = sprintDays[sprintDays.length - 1].date
    return `${formatDateRangeLabel(first)} – ${formatDateRangeLabel(last)}`
  }, [sprintDays])

  const setTaskPending = useCallback((taskId: string, pending: boolean) => {
    setPendingTaskIds((prev) => {
      const next = { ...prev }
      if (pending) {
        next[taskId] = true
      } else {
        delete next[taskId]
      }
      return next
    })
  }, [])

  const updateTaskOnServer = useCallback(async (taskId: string, updates: PlannerUpdateInput, currentName: string) => {
    const response = await fetch("/api/clickup/sprint-planner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId,
        currentName,
        updates,
      }),
    })
    const data = await response.json()
    if (!response.ok || !data.ok) {
      throw new Error(data?.message || "No pudimos actualizar la tarea en ClickUp.")
    }
    return data.task as PlannerTask
  }, [])

  const handleTaskMove = useCallback(
    async (taskId: string, targetDayKey: string) => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) {
        return
      }

      const currentKey = getTaskDayKey(task)
      if (currentKey === targetDayKey) {
        return
      }

      const timestamp = targetDayKey === UNPLANNED_KEY ? null : keyToTimestamp(targetDayKey)

      setTaskPending(taskId, true)
      try {
        const updatedTask = await updateTaskOnServer(
          taskId,
          {
            dueDate: timestamp,
            startDate: timestamp,
          },
          task.name
        )
        setTasks((prev) => prev.map((t) => (t.id === taskId ? updatedTask : t)))
        setBanner({ type: "success", message: "Tarea actualizada en ClickUp." })
      } catch (error) {
        console.error("[SprintAgenda] Failed to move task:", error)
        setBanner({
          type: "error",
          message: error instanceof Error ? error.message : "No pudimos mover la tarea.",
        })
      } finally {
        setTaskPending(taskId, false)
        setDraggingTaskId(null)
      }
    },
    [tasks, updateTaskOnServer, setTaskPending]
  )

  const handleDrawerSave = useCallback(
    async (payload: DrawerSubmitPayload) => {
      if (!drawerTask) {
        return
      }
      setDrawerSaving(true)
      setDrawerError(null)
      try {
        const timestamp = payload.dayKey === UNPLANNED_KEY ? null : keyToTimestamp(payload.dayKey)
        const updatedTask = await updateTaskOnServer(
          drawerTask.id,
          {
            name: payload.name,
            objective: payload.objective,
            acceptanceCriteria: payload.acceptanceCriteria,
            assigneeId: payload.assigneeId,
            dueDate: timestamp,
            startDate: timestamp,
            timeEstimateMs: hoursToMs(payload.hours),
          },
          payload.name
        )
        setTasks((prev) => prev.map((task) => (task.id === drawerTask.id ? updatedTask : task)))
        setDrawerTask(null)
        setBanner({ type: "success", message: "Tarea editada y sincronizada." })
      } catch (error) {
        console.error("[SprintAgenda] Failed to edit task:", error)
        setDrawerError(error instanceof Error ? error.message : "No pudimos guardar los cambios.")
      } finally {
        setDrawerSaving(false)
      }
    },
    [drawerTask, updateTaskOnServer]
  )

  const isDataLoading = membersLoading || sprintsLoading
  const showEmptyState = !tasksLoading && tasks.length === 0 && !tasksError && selectedMemberId && selectedSprintId

  return (
    <>
      <AppHeader title="ClickUp Agenda Organizer" onBack={onBack} />
      <main className="flex min-h-dvh flex-col items-center bg-white px-4 py-8 text-zinc-900 sm:px-6">
        <div className="w-full max-w-5xl space-y-6">
          <section className="rounded-3xl border border-zinc-900/10 bg-white p-6 shadow-[0_15px_70px_rgba(0,0,0,0.08)] sm:p-8">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-600">Persona</label>
                <select
                  value={selectedMemberId}
                  onChange={(event) => setSelectedMemberId(event.target.value)}
                  disabled={membersLoading || members.length === 0}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:cursor-not-allowed disabled:bg-zinc-100"
                >
                  {members.length === 0 && <option value="">Sin miembros disponibles</option>}
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} {member.howToAddress.length > 0 ? `(${member.howToAddress[0]})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-600">Sprint</label>
                <select
                  value={selectedSprintId}
                  onChange={(event) => setSelectedSprintId(event.target.value)}
                  disabled={sprintsLoading || sprints.length === 0}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:cursor-not-allowed disabled:bg-zinc-100"
                >
                  {sprints.length === 0 && <option value="">Sin sprints disponibles</option>}
                  {sprints.map((sprint) => (
                    <option key={sprint.id} value={sprint.id}>
                      {sprint.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Horas asignadas</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{totalHours.toFixed(1)} h</p>
                <p className="text-sm text-zinc-500">Total de la semana</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Rango del sprint</p>
                <p className="mt-2 text-lg font-semibold text-zinc-900">{weekRangeLabel}</p>
                {!activeSprint?.firstMonday && (
                  <p className="mt-1 text-xs text-amber-600">Sin primer lunes definido. Usamos la fecha de inicio.</p>
                )}
              </div>
            </div>
          </section>

          {isDataLoading && (
            <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-6 text-center text-zinc-500">
              <LoadingIndicator message="Cargando configuración..." />
            </div>
          )}

          {membersError && <ErrorBanner message={membersError} />}
          {sprintsError && <ErrorBanner message={sprintsError} />}
          {tasksError && <ErrorBanner message={tasksError} />}
          {banner && <StatusBanner type={banner.type} message={banner.message} />}

          {!selectedMemberId || !selectedSprintId ? (
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-center text-zinc-500">
              Selecciona una persona y un sprint para ver las tareas.
            </div>
          ) : tasksLoading ? (
            <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-6 text-center text-zinc-500">
              <LoadingIndicator message="Cargando tareas desde ClickUp..." />
            </div>
          ) : showEmptyState ? (
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-center text-zinc-500">
              No hay tareas asignadas a <strong>{selectedMember?.name}</strong> en este sprint.
            </div>
          ) : (
            <>
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-zinc-900">Agenda semanal</h2>
                  <p className="text-sm text-zinc-500">Arrastra tareas o usa el selector rápido por día.</p>
                </div>

                <div className="overflow-x-auto pb-3">
                  <div className="flex min-w-full gap-4">
                    {dayBuckets.map(({ day, tasks: dayTasks }) => (
                      <div
                        key={day.key}
                        onDragOver={(event) => {
                          event.preventDefault()
                          event.dataTransfer.dropEffect = "move"
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          if (draggingTaskId) {
                            handleTaskMove(draggingTaskId, day.key)
                          }
                        }}
                        className={`flex min-w-[260px] flex-col rounded-3xl border ${
                          draggingTaskId ? "border-zinc-900/30" : "border-zinc-200"
                        } bg-white p-4 shadow-[0_10px_45px_rgba(0,0,0,0.08)]`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{formatWeekdayLabel(day.date)}</p>
                            <p className="text-lg font-semibold text-zinc-900">{day.label}</p>
                          </div>
                          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                            {dayTasks.reduce((sum, task) => sum + msToHours(task.timeEstimate), 0).toFixed(1)} h
                          </span>
                        </div>
                        <div className="mt-4 flex flex-1 flex-col gap-3">
                          {dayTasks.length === 0 ? (
                            <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-center text-sm text-zinc-500">
                              Suelta tareas aquí
                            </div>
                          ) : (
                            dayTasks.map((task) => (
                              <TaskCard
                                key={task.id}
                                task={task}
                                sprintDays={sprintDays}
                                extraDayKeySet={dayKeySet}
                                pending={Boolean(pendingTaskIds[task.id])}
                                isDragging={draggingTaskId === task.id}
                                onSelectDay={(value) => handleTaskMove(task.id, value)}
                                onOpen={() => setDrawerTask(task)}
                                onDragStart={() => {
                                  if (!pendingTaskIds[task.id]) {
                                    setDraggingTaskId(task.id)
                                  }
                                }}
                                onDragEnd={() => setDraggingTaskId(null)}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section
                className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-[0_10px_45px_rgba(0,0,0,0.08)]"
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = "move"
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (draggingTaskId) {
                    handleTaskMove(draggingTaskId, UNPLANNED_KEY)
                  }
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-zinc-900">Sin día dentro del sprint</h2>
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                    {unplannedTasks.length} tareas
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-500">Tareas sin due date o fuera de esta semana.</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {unplannedTasks.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-center text-sm text-zinc-500">
                      Todo listo aquí.
                    </div>
                  ) : (
                    unplannedTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        sprintDays={sprintDays}
                        extraDayKeySet={dayKeySet}
                        pending={Boolean(pendingTaskIds[task.id])}
                        isDragging={draggingTaskId === task.id}
                        onSelectDay={(value) => handleTaskMove(task.id, value)}
                        onOpen={() => setDrawerTask(task)}
                        onDragStart={() => {
                          if (!pendingTaskIds[task.id]) {
                            setDraggingTaskId(task.id)
                          }
                        }}
                        onDragEnd={() => setDraggingTaskId(null)}
                      />
                    ))
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      {drawerTask && (
        <TaskEditorDrawer
          task={drawerTask}
          members={members}
          sprintDays={sprintDays}
          extraDayKeySet={dayKeySet}
          isSaving={drawerSaving}
          error={drawerError}
          onClose={() => setDrawerTask(null)}
          onSave={handleDrawerSave}
        />
      )}
    </>
  )
}

function TaskCard({
  task,
  sprintDays,
  extraDayKeySet,
  pending,
  isDragging,
  onSelectDay,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  task: PlannerTask
  sprintDays: SprintDay[]
  extraDayKeySet: Set<string>
  pending: boolean
  isDragging: boolean
  onSelectDay: (value: string) => void
  onOpen: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const hours = msToHours(task.timeEstimate)
  const dayKey = getTaskDayKey(task)
  const hasCustomDay = dayKey !== UNPLANNED_KEY && !extraDayKeySet.has(dayKey)

  return (
    <button
      type="button"
      draggable={!pending}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={`w-full rounded-2xl border border-zinc-900/15 bg-zinc-950/95 p-4 text-left text-white shadow-[0_15px_60px_rgba(0,0,0,0.35)] transition ${
        pending ? "opacity-60" : "hover:-translate-y-0.5 hover:shadow-[0_20px_70px_rgba(0,0,0,0.4)]"
      } ${isDragging ? "ring-2 ring-emerald-400/70" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{task.status || "Sin estado"}</p>
          <p className="mt-1 text-sm font-medium text-white">{task.name}</p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-200">{hours.toFixed(1)} h</span>
      </div>
      <div className="mt-3 flex flex-col gap-2 text-sm text-zinc-400">
        {task.listName && <p className="text-xs text-zinc-400">{task.listName}</p>}
        <div className="flex items-center gap-2">
          <label className="text-xs uppercase tracking-wide text-zinc-500">Día rápido</label>
          <select
            value={dayKey}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onSelectDay(event.target.value)}
            className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-white focus:border-emerald-400 focus:outline-none"
          >
            {hasCustomDay && (
              <option value={dayKey}>{formatDateLabelFromKey(dayKey)}</option>
            )}
            {sprintDays.map((day) => (
              <option key={day.key} value={day.key}>
                {day.label}
              </option>
            ))}
            <option value={UNPLANNED_KEY}>Sin día</option>
          </select>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {task.url && (
            <a
              href={task.url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="font-semibold text-emerald-300 underline underline-offset-4"
            >
              Abrir en ClickUp
            </a>
          )}
          <span>•</span>
          <span>Tap para editar</span>
        </div>
      </div>
    </button>
  )
}

function TaskEditorDrawer({
  task,
  members,
  sprintDays,
  extraDayKeySet,
  isSaving,
  error,
  onClose,
  onSave,
}: {
  task: PlannerTask
  members: TeamMember[]
  sprintDays: SprintDay[]
  extraDayKeySet: Set<string>
  isSaving: boolean
  error: string | null
  onClose: () => void
  onSave: (payload: DrawerSubmitPayload) => Promise<void>
}) {
  const [name, setName] = useState(task.name)
  const [objective, setObjective] = useState(task.objective)
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(task.acceptanceCriteria)
  const [assigneeId, setAssigneeId] = useState(task.assigneeIds[0] || "")
  const [dayKey, setDayKey] = useState(getTaskDayKey(task))
  const [hours, setHours] = useState(task.timeEstimate ? msToHours(task.timeEstimate).toString() : "")
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    setName(task.name)
    setObjective(task.objective)
    setAcceptanceCriteria(task.acceptanceCriteria)
    setAssigneeId(task.assigneeIds[0] || "")
    setDayKey(getTaskDayKey(task))
    setHours(task.timeEstimate ? msToHours(task.timeEstimate).toString() : "")
  }, [task])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const parsedHours = hours.trim() === "" ? null : Number(hours)
    if (parsedHours !== null && !Number.isFinite(parsedHours)) {
      setLocalError("Ingresa un número válido de horas (por ejemplo 2 o 2.5).")
      return
    }
    setLocalError(null)
    try {
      await onSave({
        name: name.trim(),
        objective: objective.trim(),
        acceptanceCriteria: acceptanceCriteria.trim(),
        assigneeId: assigneeId || null,
        dayKey,
        hours: parsedHours,
      })
    } catch {
      // El componente padre maneja el mensaje de error.
    }
  }

  const hasCustomDay = dayKey !== UNPLANNED_KEY && !extraDayKeySet.has(dayKey)

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 px-4 py-6 sm:items-center sm:justify-center sm:px-6">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{task.status || "Sin estado"}</p>
            <h2 className="text-xl font-semibold text-zinc-900">Editar tarea</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-200 p-2 text-zinc-500 hover:text-zinc-900"
          >
            ✕
          </button>
        </div>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">Título</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">Objetivo</label>
            <textarea
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">Acceptance Criteria</label>
            <textarea
              value={acceptanceCriteria}
              onChange={(event) => setAcceptanceCriteria(event.target.value)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              rows={3}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Persona</label>
              <select
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              >
                <option value="">Sin asignar</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Día del sprint</label>
              <select
                value={dayKey}
                onChange={(event) => setDayKey(event.target.value)}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              >
                {hasCustomDay && (
                  <option value={dayKey}>{formatDateLabelFromKey(dayKey)}</option>
                )}
                {sprintDays.map((day) => (
                  <option key={day.key} value={day.key}>
                    {day.label}
                  </option>
                ))}
                <option value={UNPLANNED_KEY}>Sin día</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">Horas</label>
            <input
              type="number"
              step="0.25"
              min="0"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              placeholder="Ej. 2 o 2.5"
            />
          </div>

          {(localError || error) && <ErrorBanner message={localError || error || ""} />}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            {task.url && (
              <a
                href={task.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
              >
                Abrir en ClickUp
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-full border border-zinc-200 px-5 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSaving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LoadingIndicator({ message }: { message: string }) {
  return (
    <span className="flex items-center justify-center gap-2 text-sm">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" aria-hidden="true" />
      {message}
    </span>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{message}</div>
}

function StatusBanner({ type, message }: { type: "success" | "error"; message: string }) {
  const baseClasses = "rounded-2xl px-4 py-3 text-sm"
  const styles =
    type === "success"
      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border border-amber-200 bg-amber-50 text-amber-700"
  return <div className={`${baseClasses} ${styles}`}>{message}</div>
}

function buildSprintDays(sprint: Pick<SprintConfig, "firstMonday" | "startDate"> | null): SprintDay[] {
  if (!sprint) {
    return []
  }
  const base = sprint.firstMonday ?? sprint.startDate
  if (!base) {
    return []
  }
  const start = new Date(base)
  start.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      date,
      key: formatDateKey(date),
      label: formatDayLabel(date),
    }
  })
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getTaskDayKey(task: PlannerTask): string {
  if (!task.dueDate) {
    return UNPLANNED_KEY
  }
  return formatDateKey(new Date(task.dueDate))
}

function keyToTimestamp(key: string): number | null {
  if (key === UNPLANNED_KEY) {
    return null
  }
  const [year, month, day] = key.split("-").map(Number)
  if (!year || !month || !day) {
    return null
  }
  const date = new Date(year, month - 1, day, 12, 0, 0, 0)
  return date.getTime()
}

function msToHours(value: number | null | undefined): number {
  if (!value || value <= 0) {
    return 0
  }
  return Math.round((value / 3_600_000) * 10) / 10
}

function hoursToMs(value: number | null): number | null {
  if (value === null || Number.isNaN(value)) {
    return null
  }
  return Math.round(value * 3_600_000)
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

function formatWeekdayLabel(date: Date): string {
  return date.toLocaleDateString("es-ES", {
    weekday: "short",
  })
}

function formatDateRangeLabel(date: Date): string {
  return date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  })
}

function formatDateLabelFromKey(key: string): string {
  if (key === UNPLANNED_KEY) {
    return "Sin día"
  }
  const timestamp = keyToTimestamp(key)
  if (!timestamp) {
    return "Sin día"
  }
  const date = new Date(timestamp)
  return formatDayLabel(date)
}
