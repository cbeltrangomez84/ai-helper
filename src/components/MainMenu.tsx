"use client"

import { setActiveApp, type AppId } from "@/lib/navigation"

type App = {
  id: AppId
  name: string
  description: string
}

const apps: App[] = [
  {
    id: "task-creator",
    name: "ClickUp Task Creator",
    description: "Record a quick note, get a structured summary, and push it straight to ClickUp.",
  },
  {
    id: "firebase-reminder",
    name: "Firebase Reminder App",
    description: "Manage your reminders with Firebase integration.",
  },
]

export function MainMenu({ onNavigate }: { onNavigate: (appId: AppId) => void }) {
  const handleAppClick = (appId: AppId) => {
    setActiveApp(appId)
    onNavigate(appId)
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-white px-4 py-10 text-zinc-900 sm:px-6">
      <div className="w-full max-w-4xl space-y-8">
        <header className="flex flex-col gap-3 text-center sm:text-left">
          <h1 className="text-3xl font-semibold sm:text-4xl text-zinc-900">AI Helper</h1>
          <p className="text-base text-zinc-600 sm:max-w-2xl">Select an application to get started.</p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <button
              key={app.id}
              onClick={() => handleAppClick(app.id)}
              className="group flex flex-col gap-3 rounded-3xl border border-zinc-900/80 bg-zinc-950 p-6 text-left shadow-[0_25px_120px_rgba(0,0,0,0.45)] transition hover:border-zinc-700 hover:shadow-[0_25px_120px_rgba(0,0,0,0.55)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-300"
            >
              <h2 className="text-xl font-semibold text-white group-hover:text-zinc-100">{app.name}</h2>
              <p className="text-sm text-zinc-400 group-hover:text-zinc-300">{app.description}</p>
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}

