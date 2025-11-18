"use client"

import { setActiveApp } from "@/lib/navigation"

type AppHeaderProps = {
  title: string
  onBack: () => void
}

export function AppHeader({ title, onBack }: AppHeaderProps) {
  const handleClick = () => {
    setActiveApp("home")
    onBack()
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-4xl items-center gap-4 px-4 py-4 sm:px-6">
        <button
          onClick={handleClick}
          className="group flex items-center justify-center rounded-full border border-zinc-900/20 bg-white p-2 text-zinc-700 shadow-sm transition-all hover:border-zinc-900/40 hover:bg-zinc-50 hover:text-zinc-900 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-300"
          aria-label="Go back to main menu"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 transition-transform group-hover:-translate-x-0.5"
          >
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
        </button>
        <h1 className="flex-1 text-xl font-semibold text-zinc-900 sm:text-2xl">{title}</h1>
      </div>
    </header>
  )
}

