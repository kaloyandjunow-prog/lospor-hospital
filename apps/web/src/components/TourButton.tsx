"use client"

import { useState } from "react"
import { HelpCircle, LayoutDashboard, ClipboardList, Activity, Heart, FileText, BookOpen, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useTour, type TourId } from "@/context/TourContext"

const STEP_TOUR_ID: TourId[] = ["preop", "intraop", "postop", "summary"]

export function TourButton() {
  const { startTour, currentFormStep } = useTour()
  const router = useRouter()
  const t = useTranslations()

  const [dropOpen,       setDropOpen]       = useState(false)
  const [showDemoPrompt, setShowDemoPrompt] = useState(false)
  const [demoLoading,    setDemoLoading]    = useState(false)

  // Which tour is "primary" for the current form step
  const activeTourId: TourId | null = currentFormStep !== null ? STEP_TOUR_ID[currentFormStep] ?? null : null

  function triggerTour(id: TourId) {
    startTour(id)
    setDropOpen(false)
  }

  function triggerDashboard() {
    localStorage.removeItem("tourCompleted")
    startTour("dashboard")
    setDropOpen(false)
  }

  async function openDemoCase() {
    setShowDemoPrompt(false)
    setDemoLoading(true)
    try {
      const res  = await fetch("/api/cases/demo")
      const data = await res.json()
      if (data.id) {
        localStorage.setItem("demoWalkthrough", "1")
        router.push(`/cases/new?continue=${data.id}&step=0`)
      }
    } finally {
      setDemoLoading(false)
    }
  }

  return (
    <>
      {/* Demo confirmation dialog */}
      {showDemoPrompt && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowDemoPrompt(false)}>
          <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  {t("tour.exampleCase")}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t("tour.exampleCaseDesc")}
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t("tour.exampleCaseIntro")}
            </p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowDemoPrompt(false)}
                className="flex-1 text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
                {t("tour.noThanks")}
              </button>
              <button onClick={openDemoCase}
                className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                {t("tour.letsGo")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        {/* Single ? button — opens dropdown with all guides */}
        <button
          type="button"
          onClick={() => setDropOpen(v => !v)}
          title={t("tour.guidesHelp")}
          className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] transition-colors"
        >
          {demoLoading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <HelpCircle className="h-4 w-4" />}
        </button>

        {dropOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setDropOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 w-60 bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-xl py-1.5 overflow-hidden">

              {/* Form-specific guides */}
              <p className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {t("tour.formGuides")}
              </p>
              {([
                { id: "preop",   icon: <ClipboardList className="h-3.5 w-3.5" />, label: t("tour.preop")   },
                { id: "intraop", icon: <Activity      className="h-3.5 w-3.5" />, label: t("tour.intraop") },
                { id: "postop",  icon: <Heart         className="h-3.5 w-3.5" />, label: t("tour.postop")  },
                { id: "summary", icon: <FileText      className="h-3.5 w-3.5" />, label: t("tour.summary") },
              ] as { id: TourId; icon: React.ReactNode; label: string }[]).map(opt => (
                <button key={opt.id} onClick={() => triggerTour(opt.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left
                    ${opt.id === activeTourId
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a]"
                    }`}>
                  <span className={opt.id === activeTourId ? "text-blue-500" : "text-slate-400 dark:text-slate-500"}>
                    {opt.icon}
                  </span>
                  {opt.label}
                  {opt.id === activeTourId && <span className="ml-auto text-[10px] text-blue-400">{t("tour.currentLabel")}</span>}
                </button>
              ))}

              <div className="border-t border-slate-100 dark:border-[#2a2a2a] my-1" />

              {/* Dashboard tour */}
              <p className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {t("tour.general")}
              </p>
              <button onClick={triggerDashboard}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors text-left">
                <span className="text-slate-400 dark:text-slate-500"><LayoutDashboard className="h-3.5 w-3.5" /></span>
                {t("tour.dashboardTour")}
              </button>

              {/* Example case */}
              <button onClick={() => { setDropOpen(false); setShowDemoPrompt(true) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors text-left">
                <span className="text-slate-400 dark:text-slate-500"><BookOpen className="h-3.5 w-3.5" /></span>
                {t("tour.exampleCase")}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
