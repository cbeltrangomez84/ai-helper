import { initializeApp, getApps, type FirebaseApp } from "firebase/app"
import { getAuth, signInWithEmailAndPassword, type Auth } from "firebase/auth"
import { getDatabase, type Database } from "firebase/database"

let app: FirebaseApp | null = null
let auth: Auth | null = null
let database: Database | null = null

function getFirebaseConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID

  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is required. Please set it in your .env.local file.")
  }

  if (!authDomain || !databaseURL || !projectId || !appId) {
    throw new Error("Firebase configuration is incomplete. Please check your .env.local file.")
  }

  return {
    apiKey,
    authDomain: authDomain!,
    databaseURL: databaseURL!,
    projectId: projectId!,
    storageBucket: storageBucket || "",
    messagingSenderId: messagingSenderId || "",
    appId: appId!,
    measurementId: measurementId || "",
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    const existingApps = getApps()
    if (existingApps.length > 0) {
      app = existingApps[0]
    } else {
      const firebaseConfig = getFirebaseConfig()
      app = initializeApp(firebaseConfig)
    }
  }
  return app
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp())
  }
  return auth
}

export function getFirebaseDatabase(): Database {
  if (!database) {
    database = getDatabase(getFirebaseApp())
  }
  return database
}

export async function authenticateFirebase(): Promise<void> {
  const authInstance = getFirebaseAuth()
  const email = process.env.NEXT_PUBLIC_FIREBASE_EMAIL
  const password = process.env.NEXT_PUBLIC_FIREBASE_PASSWORD

  if (!email || !password) {
    throw new Error("NEXT_PUBLIC_FIREBASE_EMAIL and NEXT_PUBLIC_FIREBASE_PASSWORD are required. Please set them in your .env.local file.")
  }

  try {
    const userCredential = await signInWithEmailAndPassword(authInstance, email, password)
    console.log("Firebase authenticated:", userCredential.user.email)
  } catch (error) {
    console.error("Firebase authentication error:", error)
    throw error
  }
}
