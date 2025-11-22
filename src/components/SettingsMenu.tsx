"use client"

import { setActiveApp, type AppId } from "@/lib/navigation"
import type { SVGProps } from "react"

type SettingsApp = {
  id: AppId
  name: string
  description: string
}

const settingsApps: SettingsApp[] = [
  {
    id: "corrections-manager",
    name: "Corrections Manager",
    description: "Manage speech recognition corrections for better transcription accuracy.",
  },
  {
    id: "sprint-config-manager",
    name: "Sprint Configuration",
    description: "Configure and sync sprints from ClickUp.",
  },
  {
    id: "team-members-manager",
    name: "Team Members",
    description: "Manage team members and how to address them.",
  },
]

const SettingsIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export function SettingsMenu({ onNavigate, onBack }: { onNavigate: (appId: AppId) => void; onBack: () => void }) {
  const handleAppClick = (appId: AppId) => {
    setActiveApp(appId)
    onNavigate(appId)
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-white px-4 py-10 text-zinc-900 sm:px-6">
      <div className="w-full max-w-4xl space-y-8">
        <header className="flex flex-col gap-3 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
            </button>
            <h1 className="text-3xl font-semibold sm:text-4xl text-zinc-900">Settings</h1>
          </div>
          <p className="text-base text-zinc-600 sm:max-w-2xl">Configure application settings and preferences.</p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {settingsApps.map((app) => (
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

