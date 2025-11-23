"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type SVGProps } from "react"

import { AppHeader } from "@/components/AppHeader"
import { loadSprintConfigFromFirebase, type SprintConfig } from "@/lib/firebaseSprintConfig"
import { loadTeamMembersFromFirebase, type TeamMember } from "@/lib/firebaseTeamMembers"

const ChevronDownIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

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

type TaskSegment = {
  task: PlannerTask
  dayKey: string
  hours: number // Hours allocated to this specific day
  isStart: boolean // Is this the first day of the task?
  isEnd: boolean // Is this the last day of the task?
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
        // Sort by startDate descending (most recent first) for display purposes
        const sorted = sprintsArray.sort((a, b) => {
          const aDate = a.startDate || 0
          const bDate = b.startDate || 0
          return bDate - aDate
        })
        console.log(`[SprintAgenda] Loaded ${sorted.length} sprints, first sprint: ${sorted[0]?.name}`)
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
      const now = Date.now()
      
      // 1. Find the current sprint (where current date is between startDate and endDate)
      const currentSprint = sprints.find((sprint) => {
        if (!sprint.startDate || !sprint.endDate) return false
        return sprint.startDate <= now && sprint.endDate >= now
      })

      if (currentSprint) {
        console.log(`[SprintAgenda] Found current sprint: ${currentSprint.name}`)
        setSelectedSprintId(currentSprint.id)
        return
      }

      // 2. If no current sprint, find the next upcoming sprint (future)
      const upcomingSprints = sprints.filter((sprint) => {
        if (!sprint.startDate) return false
        return sprint.startDate > now
      }).sort((a, b) => (a.startDate || 0) - (b.startDate || 0))

      if (upcomingSprints.length > 0) {
        console.log(`[SprintAgenda] Found upcoming sprint: ${upcomingSprints[0].name}`)
        setSelectedSprintId(upcomingSprints[0].id)
        return
      }

      // 3. If no upcoming sprint, find the most recent past sprint (ended most recently)
      const pastSprints = sprints.filter((sprint) => {
        if (!sprint.endDate) return false
        return sprint.endDate < now
      }).sort((a, b) => (b.endDate || 0) - (a.endDate || 0))

      if (pastSprints.length > 0) {
        console.log(`[SprintAgenda] Found most recent past sprint: ${pastSprints[0].name}`)
        setSelectedSprintId(pastSprints[0].id)
        return
      }

      // 4. Fallback: use first sprint if nothing else found
      console.log(`[SprintAgenda] Using fallback sprint: ${sprints[0].name}`)
      setSelectedSprintId(sprints[0].id)
    }
  }, [sprints, selectedSprintId])

  // State to store ALL tasks for the current sprint (before filtering by assignee)
  const [allSprintTasks, setAllSprintTasks] = useState<PlannerTask[]>([])

  // Tasks filtered by selected member - computed automatically from allSprintTasks
  // This eliminates the need for useEffect and prevents race conditions
  const tasks = useMemo(() => {
    if (!selectedMemberId) {
      return []
    }
    return allSprintTasks.filter((task) => task.assigneeIds.includes(selectedMemberId))
  }, [allSprintTasks, selectedMemberId])

  // Fetch ALL tasks when sprint changes (without assignee filter)
  useEffect(() => {
    if (!selectedSprintId) {
      setAllSprintTasks([])
      return
    }

    const controller = new AbortController()
    setTasksLoading(true)
    setTasksError(null)
    setRemoteSprintMeta(null)
    setDrawerTask(null)

    // Fetch ALL tasks for the sprint (no assigneeId)
    const params = new URLSearchParams({
      sprintId: selectedSprintId,
      // No assigneeId - we want ALL tasks
    })

    console.log(`[SprintAgenda] Fetching ALL tasks for sprint: ${selectedSprintId}`)

    fetch(`/api/clickup/sprint-planner?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok || !data.ok) {
          throw new Error(data?.message || "No pudimos cargar las tareas desde ClickUp.")
        }
        const allTasks = Array.isArray(data.tasks) ? data.tasks : []
        setAllSprintTasks(allTasks)
        setRemoteSprintMeta(data.sprint || null)
        console.log(`[SprintAgenda] Loaded ${allTasks.length} total tasks for sprint`)
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return
        }
        console.error("[SprintAgenda] Failed to load tasks:", error)
        setAllSprintTasks([])
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
  }, [selectedSprintId]) // Only depend on sprintId, not memberId

  // Tasks are now computed automatically via useMemo above - no useEffect needed!

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
      segments: [] as TaskSegment[],
    }))
    const bucketMap = new Map<string, TaskSegment[]>()
    buckets.forEach(({ day }) => bucketMap.set(day.key, []))

    const unplanned: PlannerTask[] = []
    const processedTaskIds = new Set<string>()

    tasks.forEach((task) => {
      // Create segments for tasks that span multiple days
      const segments = createTaskSegments(task, sprintDays)
      
      if (segments.length === 0) {
        // Task has no valid days, add to unplanned
        unplanned.push(task)
        return
      }

      // Add each segment to its corresponding day bucket
      segments.forEach((segment) => {
        const bucket = bucketMap.get(segment.dayKey)
        if (bucket) {
          bucket.push(segment)
        }
      })

      // Track that we've processed this task
      processedTaskIds.add(task.id)
    })

    return {
      dayBuckets: buckets.map(({ day }) => ({
        day,
        segments: bucketMap.get(day.key) ?? [],
      })),
      unplannedTasks: unplanned,
    }
  }, [tasks, sprintDays])

  const totalHours = useMemo(() => {
    return tasks.reduce((sum, task) => sum + msToHours(task.timeEstimate), 0)
  }, [tasks])

  // Helper function to get color based on hours
  const getHoursColor = useCallback((hours: number) => {
    if (hours < 6.5) {
      return "bg-green-100 text-green-700" // Verde claro
    } else if (hours >= 6.5 && hours <= 8) {
      return "bg-yellow-100 text-yellow-700" // Amarillo
    } else {
      return "bg-red-100 text-red-700" // Rojo
    }
  }, [])

  // Calculate hours per day for weekdays only (Monday to Friday)
  const weekdayHours = useMemo(() => {
    const weekdayBuckets = dayBuckets.slice(0, 5) // Only Monday to Friday (first 5 days)
    return weekdayBuckets.map(({ day, segments }) => {
      const hours = segments.reduce((sum, segment) => sum + segment.hours, 0)
      return {
        day,
        hours,
        colorClass: getHoursColor(hours),
      }
    })
  }, [dayBuckets, getHoursColor])

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
        
        // Simply update allSprintTasks - tasks will be recalculated automatically via useMemo
        setAllSprintTasks((prev) => {
          return prev.map((t) => (t.id === taskId ? updatedTask : t))
        })
        
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
    [tasks, updateTaskOnServer, setTaskPending, selectedMemberId]
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
        
        // Save to ClickUp (same as handleTaskMove does)
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
        
        // Preserve assigneeIds from original task to prevent task from disappearing
        // ClickUp might return only the assignee we sent, losing other assignees
        // We merge: use updated assignees if they exist and include selectedMemberId, otherwise keep original
        const preservedAssignees = 
          updatedTask.assigneeIds && 
          updatedTask.assigneeIds.length > 0 && 
          updatedTask.assigneeIds.includes(selectedMemberId)
            ? updatedTask.assigneeIds
            : drawerTask.assigneeIds // Always fallback to original if updated doesn't include current member
        
        const taskWithAssignees = {
          ...updatedTask,
          assigneeIds: preservedAssignees,
        }
        
        // Update allSprintTasks exactly like handleTaskMove does
        // The useMemo will automatically recalculate tasks, so the task will move to the correct day
        setAllSprintTasks((prev) => {
          return prev.map((t) => (t.id === drawerTask.id ? taskWithAssignees : t))
        })
        
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

  const handleMoveToNextSprint = useCallback(async () => {
    if (!drawerTask || !selectedSprint) {
      return
    }

    // Find next sprint
    const sortedSprints = [...sprints].sort((a, b) => {
      const aDate = a.startDate || 0
      const bDate = b.startDate || 0
      return aDate - bDate
    })

    const currentIndex = sortedSprints.findIndex((s) => s.id === selectedSprint.id)
    if (currentIndex === -1 || currentIndex === sortedSprints.length - 1) {
      setBanner({ type: "error", message: "No hay un sprint siguiente disponible." })
      return
    }

    const nextSprint = sortedSprints[currentIndex + 1]
    if (!nextSprint.listId) {
      setBanner({ type: "error", message: "El siguiente sprint no tiene lista configurada." })
      return
    }

    if (!selectedSprint.listId) {
      setBanner({ type: "error", message: "El sprint actual no tiene lista configurada." })
      return
    }

    // Get next sprint's first Monday
    const nextSprintFirstMonday = nextSprint.firstMonday || nextSprint.startDate
    if (!nextSprintFirstMonday) {
      setBanner({ type: "error", message: "El siguiente sprint no tiene fecha de inicio configurada." })
      return
    }

    setDrawerSaving(true)
    setDrawerError(null)
    try {
      const response = await fetch("/api/clickup/sprint-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: drawerTask.id,
          currentSprintListId: selectedSprint.listId,
          nextSprintListId: nextSprint.listId,
          nextSprintFirstMonday,
          currentSprintStartDate: selectedSprint.startDate,
          currentSprintEndDate: selectedSprint.endDate,
          taskDueDate: drawerTask.dueDate,
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.ok) {
        throw new Error(data?.message || "No pudimos mover la tarea al siguiente sprint.")
      }

      // Remove task from current sprint's tasks
      setAllSprintTasks((prev) => {
        return prev.filter((t) => t.id !== drawerTask.id)
      })

      setDrawerTask(null)
      setBanner({ type: "success", message: `Tarea movida al ${nextSprint.name}.` })
    } catch (error) {
      console.error("[SprintAgenda] Failed to move task to next sprint:", error)
      setDrawerError(error instanceof Error ? error.message : "No pudimos mover la tarea al siguiente sprint.")
    } finally {
      setDrawerSaving(false)
    }
  }, [drawerTask, selectedSprint, sprints])

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
                <div className="relative">
                  <select
                    value={selectedMemberId}
                    onChange={(event) => setSelectedMemberId(event.target.value)}
                    disabled={membersLoading || members.length === 0}
                    className="w-full appearance-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 pr-12 text-base text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:cursor-not-allowed disabled:bg-zinc-100"
                  >
                    {members.length === 0 && <option value="">Sin miembros disponibles</option>}
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} {member.howToAddress.length > 0 ? `(${member.howToAddress[0]})` : ""}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500">
                    <ChevronDownIcon className="h-5 w-5" />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-600">Sprint</label>
                <div className="relative">
                  <select
                    value={selectedSprintId}
                    onChange={(event) => setSelectedSprintId(event.target.value)}
                    disabled={sprintsLoading || sprints.length === 0}
                    className="w-full appearance-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 pr-12 text-base text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:cursor-not-allowed disabled:bg-zinc-100"
                  >
                    {sprints.length === 0 && <option value="">Sin sprints disponibles</option>}
                    {sprints.map((sprint) => (
                      <option key={sprint.id} value={sprint.id}>
                        {sprint.name}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500">
                    <ChevronDownIcon className="h-5 w-5" />
                  </div>
                </div>
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
              {/* Weekday summary cards (Monday to Friday only) */}
              <section className="mb-6">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                  {weekdayHours.map(({ day, hours, colorClass }) => {
                    const weekdayName = day.date.toLocaleDateString("es-ES", { weekday: "long" })
                    return (
                      <div
                        key={day.key}
                        className={`rounded-2xl border border-zinc-200 p-3 sm:p-4 ${colorClass}`}
                      >
                        <p className="text-xs sm:text-sm font-semibold capitalize">{weekdayName}</p>
                        <p className="mt-1 text-base sm:text-lg font-bold">({hours.toFixed(1)} h)</p>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-zinc-900">Agenda semanal</h2>
                  <p className="text-sm text-zinc-500">Arrastra tareas o usa el selector rápido por día.</p>
                </div>

                <div className="overflow-x-auto pb-3">
                  <div className="flex min-w-full gap-4">
                    {dayBuckets.slice(0, 5).map(({ day, segments: daySegments }) => {
                      const dayHours = daySegments.reduce((sum, segment) => sum + segment.hours, 0)
                      const colorClass = getHoursColor(dayHours)
                      
                      return (
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
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${colorClass}`}>
                              {dayHours.toFixed(1)} h
                            </span>
                          </div>
                          <div className="mt-4 flex flex-1 flex-col gap-3">
                            {daySegments.length === 0 ? (
                              <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-center text-sm text-zinc-500">
                                Suelta tareas aquí
                              </div>
                            ) : (
                              daySegments.map((segment) => (
                                <TaskCard
                                  key={`${segment.task.id}-${segment.dayKey}`}
                                  task={segment.task}
                                  segment={segment}
                                  sprintDays={sprintDays}
                                  extraDayKeySet={dayKeySet}
                                  pending={Boolean(pendingTaskIds[segment.task.id])}
                                  isDragging={draggingTaskId === segment.task.id}
                                  onSelectDay={(value) => handleTaskMove(segment.task.id, value)}
                                  onOpen={() => setDrawerTask(segment.task)}
                                  onDragStart={() => {
                                    if (!pendingTaskIds[segment.task.id]) {
                                      setDraggingTaskId(segment.task.id)
                                    }
                                  }}
                                  onDragEnd={() => setDraggingTaskId(null)}
                                />
                              ))
                            )}
                          </div>
                        </div>
                      )
                    })}
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
          onMoveToNextSprint={handleMoveToNextSprint}
          canMoveToNextSprint={selectedSprint !== null && sprints.length > 0}
        />
      )}
    </>
  )
}

function TaskCard({
  task,
  segment,
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
  segment?: TaskSegment
  sprintDays: SprintDay[]
  extraDayKeySet: Set<string>
  pending: boolean
  isDragging: boolean
  onSelectDay: (value: string) => void
  onOpen: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  // Use segment hours if available, otherwise use full task hours
  const hours = segment ? segment.hours : msToHours(task.timeEstimate)
  const dayKey = segment ? segment.dayKey : getTaskDayKey(task)
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
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{task.status || "Sin estado"}</p>
          <p className="mt-1 text-sm font-medium text-white break-words">{task.name}</p>
          {segment && !segment.isStart && !segment.isEnd && (
            <p className="mt-1 text-xs text-zinc-400">Continuación</p>
          )}
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-200 whitespace-nowrap flex-shrink-0">
          {hours.toFixed(1)} h
        </span>
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
  onMoveToNextSprint,
  canMoveToNextSprint,
}: {
  task: PlannerTask
  members: TeamMember[]
  sprintDays: SprintDay[]
  extraDayKeySet: Set<string>
  isSaving: boolean
  error: string | null
  onClose: () => void
  onSave: (payload: DrawerSubmitPayload) => Promise<void>
  onMoveToNextSprint?: () => void
  canMoveToNextSprint?: boolean
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
      <div className="relative z-10 w-full max-w-xl max-h-[90vh] rounded-3xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between gap-3 p-6 sm:p-8 border-b border-zinc-200">
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
        <form className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-4" onSubmit={handleSubmit}>
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

          {canMoveToNextSprint && onMoveToNextSprint && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <button
                type="button"
                onClick={onMoveToNextSprint}
                disabled={isSaving}
                className="w-full rounded-full border border-blue-300 bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-200 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving ? "Moviendo..." : "Mover al siguiente sprint"}
              </button>
              <p className="mt-2 text-xs text-blue-600">
                Esto moverá la tarea al siguiente sprint y la programará para el primer lunes.
              </p>
            </div>
          )}

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

/**
 * Calculate which days a task spans based on startDate and dueDate
 * Returns an array of day keys that the task occupies
 */
function getTaskDays(task: PlannerTask, sprintDays: SprintDay[]): string[] {
  if (!task.startDate || !task.dueDate) {
    // If no startDate or dueDate, use the old behavior (single day based on dueDate)
    const key = getTaskDayKey(task)
    return key === UNPLANNED_KEY ? [] : [key]
  }

  const start = new Date(task.startDate)
  const end = new Date(task.dueDate)
  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)

  const days: string[] = []
  const sprintDayKeys = new Set(sprintDays.map((d) => d.key))

  // Iterate through each day from start to end
  const current = new Date(start)
  while (current <= end) {
    const dayKey = formatDateKey(current)
    // Only include days that are in the sprint
    if (sprintDayKeys.has(dayKey)) {
      days.push(dayKey)
    }
    current.setDate(current.getDate() + 1)
  }

  return days.length > 0 ? days : [getTaskDayKey(task)]
}

/**
 * Create segments for a task, dividing it across multiple days
 */
function createTaskSegments(task: PlannerTask, sprintDays: SprintDay[]): TaskSegment[] {
  const days = getTaskDays(task, sprintDays)
  
  if (days.length === 0) {
    return []
  }

  const totalHours = msToHours(task.timeEstimate)
  const hoursPerDay = totalHours / days.length

  return days.map((dayKey, index) => ({
    task,
    dayKey,
    hours: hoursPerDay,
    isStart: index === 0,
    isEnd: index === days.length - 1,
  }))
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
