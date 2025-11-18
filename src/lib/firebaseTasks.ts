import { ref, push, set } from "firebase/database"

import { authenticateFirebase, getFirebaseDatabase } from "./firebase"

export interface FirebaseTask {
  text: string
  createdAt: number
  completed: boolean
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

