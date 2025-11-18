const ACTIVE_APP_KEY = "activeApp"

export type AppId = "home" | "task-creator" | "firebase-reminder"

export function getActiveApp(): AppId {
  if (typeof window === "undefined") {
    return "home"
  }
  const stored = localStorage.getItem(ACTIVE_APP_KEY)
  return (stored as AppId) || "home"
}

export function setActiveApp(appId: AppId): void {
  if (typeof window === "undefined") {
    return
  }
  localStorage.setItem(ACTIVE_APP_KEY, appId)
}

