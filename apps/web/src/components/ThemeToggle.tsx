"use client"

import { useEffect, useState } from "react"
import { Sun, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("theme")
    const isDark = stored !== "light" // default to dark
    // localStorage can't be read during SSR/initial render, so the first
    // real read has to happen in an effect — this is a one-time mount sync,
    // not a case where useSyncExternalStore would help (no cross-tab/storage-
    // event subscription needed here, and a DOM mutation follows below).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(isDark)
    document.documentElement.classList.toggle("dark", isDark)
    if (!stored) document.cookie = "theme=dark; path=/; max-age=31536000; SameSite=Lax"
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("theme", next ? "dark" : "light")
    document.cookie = `theme=${next ? "dark" : "light"}; path=/; max-age=31536000; SameSite=Lax`
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={toggle} title={dark ? "Switch to light mode" : "Switch to dark mode"}>
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}
