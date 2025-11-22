"use client"

import { useEffect, useState } from "react"

import { CorrectionsManager } from "@/components/CorrectionsManager"
import { FirebaseReminderApp } from "@/components/FirebaseReminderApp"
import { FirebaseTasksManager } from "@/components/FirebaseTasksManager"
import { MainMenu } from "@/components/MainMenu"
import { SettingsMenu } from "@/components/SettingsMenu"
import { SprintConfigManager } from "@/components/SprintConfigManager"
import { TeamMembersManager } from "@/components/TeamMembersManager"
import { TaskCreator } from "@/components/TaskCreator"
import { getActiveApp, setActiveApp, type AppId } from "@/lib/navigation"

export default function Home() {
  const [activeApp, setActiveAppState] = useState<AppId>("home")
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
    const storedApp = getActiveApp()
    setActiveAppState(storedApp)
  }, [])

  const handleNavigate = (appId: AppId) => {
    setActiveApp(appId)
    setActiveAppState(appId)
  }

  const handleBack = () => {
    setActiveApp("home")
    setActiveAppState("home")
  }

  if (!isClient) {
    return null
  }

  return (
    <>
      {activeApp === "home" && <MainMenu onNavigate={handleNavigate} />}
      {activeApp === "settings" && <SettingsMenu onNavigate={handleNavigate} onBack={handleBack} />}
      {activeApp === "task-creator" && <TaskCreator onBack={handleBack} />}
      {activeApp === "firebase-reminder" && <FirebaseReminderApp onBack={handleBack} />}
      {activeApp === "firebase-tasks-manager" && <FirebaseTasksManager onBack={handleBack} />}
      {activeApp === "corrections-manager" && <CorrectionsManager onBack={handleBack} />}
      {activeApp === "sprint-config-manager" && <SprintConfigManager onBack={handleBack} />}
      {activeApp === "team-members-manager" && <TeamMembersManager onBack={handleBack} />}
    </>
  )
}
