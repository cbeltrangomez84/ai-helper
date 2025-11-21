import { ref, push, set, get, remove } from "firebase/database"

import { authenticateFirebase, getFirebaseDatabase } from "./firebase"

export interface FirebaseTask {
  text: string
  createdAt: number
  completed: boolean
}

export interface FirebaseTaskWithId extends FirebaseTask {
  id: string
}

export interface CompletedTask {
  text: string
  createdAt: number
  completed: boolean
  completedAt: number
  clickupTaskUrl: string
}

export async function addTaskToFirebase(taskText: string): Promise<string> {
  // Ensure we're authenticated
  await authenticateFirebase()

  const database = getFirebaseDatabase()
  const tasksRef = ref(database, "tasks")

  const newTask: FirebaseTask = {
    text: taskText.trim(),
    createdAt: Date.now(),
    completed: false,
  }

  const newTaskRef = push(tasksRef)
  await set(newTaskRef, newTask)

  return newTaskRef.key || ""
}

export async function getPendingTasks(): Promise<FirebaseTaskWithId[]> {
  await authenticateFirebase()

  const database = getFirebaseDatabase()
  const tasksRef = ref(database, "tasks")

  const snapshot = await get(tasksRef)
  if (!snapshot.exists()) {
    return []
  }

  const tasks: FirebaseTaskWithId[] = []
  const data = snapshot.val()

  for (const [id, task] of Object.entries(data)) {
    const taskData = task as FirebaseTask
    if (!taskData.completed) {
      tasks.push({
        ...taskData,
        id,
      })
    }
  }

  // Sort by createdAt descending (newest first)
  return tasks.sort((a, b) => b.createdAt - a.createdAt)
}

export async function moveTaskToCompleted(taskId: string, clickupTaskUrl: string): Promise<void> {
  await authenticateFirebase()

  const database = getFirebaseDatabase()
  const taskRef = ref(database, `tasks/${taskId}`)
  const completedTasksRef = ref(database, "completedTasks")

  // Get the task data
  const snapshot = await get(taskRef)
  if (!snapshot.exists()) {
    throw new Error(`Task with id ${taskId} not found`)
  }

  const taskData = snapshot.val() as FirebaseTask

  // Create completed task
  const completedTask: CompletedTask = {
    ...taskData,
    completed: true,
    completedAt: Date.now(),
    clickupTaskUrl,
  }

  // Add to completedTasks
  const newCompletedTaskRef = push(completedTasksRef)
  await set(newCompletedTaskRef, completedTask)

  // Remove from tasks
  await remove(taskRef)
}

