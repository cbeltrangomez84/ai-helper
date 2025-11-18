"use client"

import { setActiveApp } from "@/lib/navigation"

type BackButtonProps = {
  onBack: () => void
}

export function BackButton({ onBack }: BackButtonProps) {
  const handleClick = () => {
    setActiveApp("home")
    onBack()
  }

  return (
    <button
      onClick={handleClick}
      className="group flex items-center justify-center rounded-full border border-zinc-900/20 bg-white p-3 text-zinc-700 shadow-lg transition-all hover:border-zinc-900/40 hover:bg-zinc-50 hover:text-zinc-900 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-300"
      aria-label="Go back to main menu"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5 transition-transform group-hover:-translate-x-1"
      >
        <path d="m12 19-7-7 7-7" />
        <path d="M19 12H5" />
      </svg>
    </button>
  )
}

