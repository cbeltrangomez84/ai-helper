import { ref, get, set, remove } from "firebase/database"

import { authenticateFirebase, getFirebaseDatabase } from "./firebase"

export interface Correction {
  original: string
  correction: string
  createdAt: number
}

export interface FirebaseCorrection {
  original: string
  correction: string
  createdAt: number
}

/**
 * Saves corrections to Firebase
 */
export async function saveCorrectionsToFirebase(corrections: Array<{ original: string; correction: string }>): Promise<void> {
  await authenticateFirebase()
  const database = getFirebaseDatabase()
  const correctionsRef = ref(database, "corrections")

  const timestamp = Date.now()

  // Save each correction
  for (const correction of corrections) {
    const newCorrection: FirebaseCorrection = {
      original: correction.original.trim(),
      correction: correction.correction.trim(),
      createdAt: timestamp,
    }

    // Use original as key to avoid duplicates (or use push for multiple entries)
    const correctionKey = correction.original.toLowerCase().trim().replace(/\s+/g, "_")
    const correctionRef = ref(database, `corrections/${correctionKey}`)
    await set(correctionRef, newCorrection)
  }
}

/**
 * Loads all corrections from Firebase
 */
export async function loadCorrectionsFromFirebase(): Promise<Record<string, string>> {
  await authenticateFirebase()
  const database = getFirebaseDatabase()
  const correctionsRef = ref(database, "corrections")

  try {
    const snapshot = await get(correctionsRef)
    if (!snapshot.exists()) {
      return {}
    }

    const correctionsData = snapshot.val() as Record<string, FirebaseCorrection>
    const correctionsDict: Record<string, string> = {}

    // Convert Firebase structure to dictionary
    for (const key in correctionsData) {
      const correction = correctionsData[key]
      if (correction.original && correction.correction) {
        correctionsDict[correction.original.toLowerCase().trim()] = correction.correction.trim()
      }
    }

    return correctionsDict
  } catch (error) {
    console.error("Error loading corrections from Firebase:", error)
    return {}
  }
}

/**
 * Loads all corrections from Firebase with their keys
 */
export async function loadAllCorrectionsFromFirebase(): Promise<Array<{ key: string; original: string; correction: string }>> {
  await authenticateFirebase()
  const database = getFirebaseDatabase()
  const correctionsRef = ref(database, "corrections")

  try {
    const snapshot = await get(correctionsRef)
    if (!snapshot.exists()) {
      return []
    }

    const correctionsData = snapshot.val() as Record<string, FirebaseCorrection>
    const correctionsList: Array<{ key: string; original: string; correction: string }> = []

    for (const key in correctionsData) {
      const correction = correctionsData[key]
      if (correction.original && correction.correction) {
        correctionsList.push({
          key,
          original: correction.original.trim(),
          correction: correction.correction.trim(),
        })
      }
    }

    return correctionsList
  } catch (error) {
    console.error("Error loading all corrections from Firebase:", error)
    return []
  }
}

/**
 * Deletes a correction from Firebase
 */
export async function deleteCorrectionFromFirebase(originalWord: string): Promise<void> {
  await authenticateFirebase()
  const database = getFirebaseDatabase()

  const correctionKey = originalWord.toLowerCase().trim().replace(/\s+/g, "_")
  const correctionRef = ref(database, `corrections/${correctionKey}`)
  await remove(correctionRef)
}

