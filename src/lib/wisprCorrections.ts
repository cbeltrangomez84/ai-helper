/**
 * Correction dictionary for Wispr Flow
 *
 * This dictionary is used to improve speech recognition across all flows
 * that use Wispr Flow (ClickUp Task Creator and Firebase Reminder App).
 *
 * Keys are the words that Wispr Flow is misunderstanding,
 * and values are the correct words it should transcribe.
 *
 * Corrections are now stored in Firebase and loaded at runtime.
 */
export const WISPR_CORRECTIONS: Record<string, string> = {
  // Static corrections can be added here, but they will be merged with Firebase corrections
}

let firebaseCorrectionsCache: Record<string, string> | null = null
let isLoadingCorrections = false

/**
 * Loads corrections from Firebase (cached after first load)
 */
export async function loadCorrectionsFromFirebase(): Promise<Record<string, string>> {
  if (typeof window === "undefined") {
    return WISPR_CORRECTIONS
  }

  // Return cache if available
  if (firebaseCorrectionsCache !== null) {
    return { ...WISPR_CORRECTIONS, ...firebaseCorrectionsCache }
  }

  // Prevent multiple simultaneous loads
  if (isLoadingCorrections) {
    return WISPR_CORRECTIONS
  }

  isLoadingCorrections = true

  try {
    const { loadCorrectionsFromFirebase } = await import("./firebaseCorrections")
    firebaseCorrectionsCache = await loadCorrectionsFromFirebase()
    return { ...WISPR_CORRECTIONS, ...firebaseCorrectionsCache }
  } catch (error) {
    console.error("Error loading corrections from Firebase:", error)
    return WISPR_CORRECTIONS
  } finally {
    isLoadingCorrections = false
  }
}

/**
 * Gets all corrections (loads from Firebase if not cached)
 */
export async function getAllCorrections(): Promise<Record<string, string>> {
  if (firebaseCorrectionsCache === null) {
    return await loadCorrectionsFromFirebase()
  }
  return { ...WISPR_CORRECTIONS, ...firebaseCorrectionsCache }
}

/**
 * Invalidates the corrections cache (call after adding new corrections)
 */
export function invalidateCorrectionsCache(): void {
  firebaseCorrectionsCache = null
}

/**
 * Applies corrections to a text string
 */
export function applyCorrectionsToText(text: string, corrections: Record<string, string>): string {
  let correctedText = text

  // Apply corrections (case-insensitive)
  for (const [incorrect, correct] of Object.entries(corrections)) {
    const regex = new RegExp(incorrect.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
    correctedText = correctedText.replace(regex, correct)
  }

  return correctedText
}
