"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { usePathname } from "next/navigation"
import { useLocale } from "next-intl"
import { TourContext, type TourId } from "@/context/TourContext"
import type { Driver, Side, Alignment } from "driver.js"

type StepDef = {
  element?: string
  popover: { title: string; description: string; side?: Side; align?: Alignment }
}

const TOURS: Record<TourId, { en: StepDef[]; bg: StepDef[] }> = {
  dashboard: {
    en: [
      { popover: { title: "Welcome to LOSPOR 👋", description: "Let's take a quick tour of the app. Click <strong>Next →</strong> to begin." } },
      { element: "[data-tour='nav-new-case']",    popover: { title: "Create a case",          description: "Start a new anaesthesia record here. Fill in preoperative, intraoperative, and postoperative data step by step.", side: "bottom", align: "start" } },
      { element: "[data-tour='nav-ongoing']",     popover: { title: "Ongoing cases",           description: "Quick access to all cases currently in progress.", side: "bottom", align: "start" } },
      { element: "[data-tour='dashboard-stats']", popover: { title: "Your statistics",         description: "Total cases recorded, cases this month, and ICU admissions at a glance.", side: "bottom", align: "start" } },
      { element: "[data-tour='case-list']",       popover: { title: "Case list",               description: "All your recorded cases. Each row shows the procedure, status, and ASA score. Click any row to open or continue it.", side: "top", align: "start" } },
      { element: "[data-tour='settings-menu']",   popover: { title: "Settings & preferences",  description: "Change language, theme, layout, and monitoring defaults. Also request a Head of Department role here.", side: "bottom", align: "end" } },
      { popover: { title: "You're all set! 🎉", description: "Restart this tour anytime with the <strong>?</strong> button. On any form the <strong>?</strong> starts a guide for that specific form." } },
    ],
    bg: [
      { popover: { title: "Добре дошли в LOSPOR 👋", description: "Нека разгледаме приложението. Натиснете <strong>Напред →</strong>, за да започнете." } },
      { element: "[data-tour='nav-new-case']",    popover: { title: "Създайте случай",             description: "Тук започнете нов анестезиологичен запис — предоперативни, интраоперативни и следоперативни данни стъпка по стъпка.", side: "bottom", align: "start" } },
      { element: "[data-tour='nav-ongoing']",     popover: { title: "Текущи случаи",               description: "Бърз достъп до всички случаи в процес на работа.", side: "bottom", align: "start" } },
      { element: "[data-tour='dashboard-stats']", popover: { title: "Вашата статистика",           description: "Общ брой случаи, случаи за месеца и приети в ИТО.", side: "bottom", align: "start" } },
      { element: "[data-tour='case-list']",       popover: { title: "Списък с случаи",             description: "Всички записани случаи. Всеки ред показва интервенцията, статуса и ASA оценката.", side: "top", align: "start" } },
      { element: "[data-tour='settings-menu']",   popover: { title: "Настройки",                   description: "Език, тема, изглед и мониторинг по подразбиране. Поискайте и роля Началник на отделение.", side: "bottom", align: "end" } },
      { popover: { title: "Готови сте! 🎉", description: "Рестартирайте обиколката с бутона <strong>?</strong>. В рамките на всяка форма бутонът <strong>?</strong> стартира наръчник за тази форма." } },
    ],
  },

  preop: {
    en: [
      { popover: { title: "Preoperative Assessment 📋", description: "This form captures all pre-anaesthesia information about the patient. Let's walk through the key sections." } },
      { element: "[data-tour='preop-demographics']", popover: { title: "Patient demographics",  description: "Age, sex, height, weight, and BMI. IBW and ABW are calculated automatically — important for drug dosing.", side: "right" } },
      { element: "[data-tour='preop-diagnosis']",    popover: { title: "Diagnosis & procedure", description: "Enter the working diagnosis and planned procedure. You can search ICD-10 codes or type freely.", side: "right" } },
      { element: "[data-tour='preop-airway']",       popover: { title: "Airway assessment",     description: "Mallampati class, mouth opening, thyromental distance, neck mobility. Flag difficult airway history if relevant.", side: "right" } },
      { element: "[data-tour='preop-scores']",       popover: { title: "Risk scores",           description: "ASA classification is required. RCRI, Apfel, and STOP-BANG scores calculate automatically from the answers you fill in.", side: "right" } },
      { element: "[data-tour='preop-submit']",       popover: { title: "Save & continue →",     description: "All set! Click this button to save the preoperative assessment and move to intraoperative recording.", side: "top" } },
    ],
    bg: [
      { popover: { title: "Предоперативна оценка 📋", description: "Тази форма събира цялата предоперативна информация за пациента. Нека разгледаме основните секции." } },
      { element: "[data-tour='preop-demographics']", popover: { title: "Демографски данни",     description: "Възраст, пол, ръст, тегло и ИТМ. ИТТ и ИКТ се изчисляват автоматично — важно за дозиране на медикаменти.", side: "right" } },
      { element: "[data-tour='preop-diagnosis']",    popover: { title: "Диагноза и интервенция", description: "Въведете диагнозата и планираната интервенция. Можете да търсите ICD-10 кодове или да въведете свободен текст.", side: "right" } },
      { element: "[data-tour='preop-airway']",       popover: { title: "Оценка на дихателния път", description: "Клас по Mallampati, разстояние между резците, тиромандибулярно разстояние и подвижност на шията.", side: "right" } },
      { element: "[data-tour='preop-scores']",       popover: { title: "Рискови скали",          description: "ASA класификацията е задължителна. RCRI, Apfel и STOP-BANG се изчисляват автоматично.", side: "right" } },
      { element: "[data-tour='preop-submit']",       popover: { title: "Запази и продължи →",    description: "Готово! Натиснете тук, за да запазите предоперативната оценка и преминете към интраоперативния запис.", side: "top" } },
    ],
  },

  intraop: {
    en: [
      { popover: { title: "Intraoperative Recording ⏱", description: "Document the anaesthesia in real time — or retrospectively. The live timetable is the centrepiece." } },
      { element: "[data-tour='intraop-timing']",     popover: { title: "Timing",              description: "Set date, start and end times. Use <strong>Start Case</strong> to stamp the current time instantly — the orange live-clock bar begins.", side: "bottom" } },
      { element: "[data-tour='intraop-technique']",  popover: { title: "Anaesthesia technique", description: "Select the technique(s): GA inhalational, TIVA, spinal, epidural, or combinations. Airway options appear based on your choice.", side: "right" } },
      { element: "[data-tour='intraop-monitoring']", popover: { title: "Monitoring",          description: "Tick all active monitors. These populate the monitoring section of the printed protocol.", side: "right" } },
      { element: "[data-tour='intraop-timetable']",  popover: { title: "Intraoperative timetable", description: "The visual heart of LOSPOR. Record vitals, drug boluses, infusions, volatile agents, and IV fluids on a live timeline. Everything exports to the protocol.", side: "top" } },
      { element: "[data-tour='intraop-submit']",     popover: { title: "Save & continue →",   description: "Intraop complete! Click here to save and move to postoperative recovery documentation.", side: "top" } },
    ],
    bg: [
      { popover: { title: "Интраоперативен запис ⏱", description: "Документирайте анестезията в реално време или ретроспективно. Хронологичната таблица е основният инструмент." } },
      { element: "[data-tour='intraop-timing']",     popover: { title: "Времева рамка",        description: "Задайте дата, начален и краен час. Натиснете <strong>Начало на случая</strong> — живият часовник стартира.", side: "bottom" } },
      { element: "[data-tour='intraop-technique']",  popover: { title: "Техника на анестезия", description: "Изберете техниката: обща инхалационна, ТИВА, спинална, епидурална или комбинации.", side: "right" } },
      { element: "[data-tour='intraop-monitoring']", popover: { title: "Мониторинг",           description: "Отбележете всички активни монитори. Те се включват в протокола.", side: "right" } },
      { element: "[data-tour='intraop-timetable']",  popover: { title: "Интраоперативна таблица", description: "Визуалното ядро на LOSPOR. Запишете жизнени показатели, болуси, инфузии и течности върху хронологична ос.", side: "top" } },
      { element: "[data-tour='intraop-submit']",     popover: { title: "Запази и продължи →",  description: "Интраоперативният запис е готов! Натиснете, за да преминете към следоперативното събуждане.", side: "top" } },
    ],
  },

  postop: {
    en: [
      { popover: { title: "Postoperative Recovery 🏥", description: "Document the patient's recovery — Aldrete score, vitals, disposition, and handover instructions." } },
      { element: "[data-tour='postop-aldrete']",    popover: { title: "Aldrete score",     description: "Score activity, respiration, circulation, consciousness, and SpO₂ from 0–2. A total ≥ 9 indicates readiness for discharge from recovery.", side: "bottom" } },
      { element: "[data-tour='postop-recovery']",   popover: { title: "Recovery vitals",  description: "Temperature, pain NRS (0–10), PONV status, and time in the recovery room.", side: "right" } },
      { element: "[data-tour='postop-disposition']",popover: { title: "Disposition",       description: "Where is the patient going — ward, PACU, or ICU? Add clinical notes for the receiving team.", side: "right" } },
      { element: "[data-tour='postop-handover']",   popover: { title: "Handover instructions", description: "Tick the standard instructions relevant to this patient. These appear in full on the printed protocol.", side: "right" } },
      { element: "[data-tour='postop-submit']",     popover: { title: "Complete case →",   description: "All done! Click here to finalise the case and generate the printable anaesthesia protocol.", side: "top" } },
    ],
    bg: [
      { popover: { title: "Следоперативно събуждане 🏥", description: "Документирайте възстановяването — скала на Aldrete, жизнени показатели, извеждане и препоръки." } },
      { element: "[data-tour='postop-aldrete']",    popover: { title: "Скала на Aldrete",   description: "Оценете двигателна активност, дишане, кръвообращение, съзнание и SpO₂. Общ резултат ≥ 9 = готовност за извеждане.", side: "bottom" } },
      { element: "[data-tour='postop-recovery']",   popover: { title: "Жизнени показатели", description: "Температура, болкова скала NRS (0–10), ПОНВ и престой в залата за събуждане.", side: "right" } },
      { element: "[data-tour='postop-disposition']",popover: { title: "Извежда се към",     description: "Накъде се извежда пациентът — отделение, зала за събуждане или ИТО?", side: "right" } },
      { element: "[data-tour='postop-handover']",   popover: { title: "Препоръки",          description: "Отбележете стандартните препоръки за пациента. Те се отпечатват в пълен текст в протокола.", side: "right" } },
      { element: "[data-tour='postop-submit']",     popover: { title: "Завърши случая →",   description: "Всичко готово! Натиснете тук, за да финализирате случая и генерирате анестезиологичния протокол.", side: "top" } },
    ],
  },

  summary: {
    en: [
      { popover: { title: "Anaesthesia Protocol 📄", description: "This two-page protocol is automatically generated from all the data you've entered." } },
      { element: "[data-tour='summary-page1']", popover: { title: "Page 1 — Intraoperative",   description: "Full intraoperative timetable with vital signs graph, drug totals, fluid balance, and key clinical information.", side: "right" } },
      { element: "[data-tour='summary-page2']", popover: { title: "Page 2 — Pre & Postoperative", description: "Preoperative assessment, risk scores, airway evaluation, comorbidities, and postoperative recovery details.", side: "right" } },
      { element: "[data-tour='summary-print']", popover: { title: "Print / Save as PDF",        description: "Click here to generate the protocol. Enter the patient's name and ID — these are never stored, only printed on the document.", side: "bottom" } },
      { popover: { title: "Case complete ✓",    description: "The case is saved. It will appear in your dashboard case list. The demo walkthrough is complete — you're ready to record real cases!" } },
    ],
    bg: [
      { popover: { title: "Анестезиологичен протокол 📄", description: "Двустраничният протокол е генериран автоматично от всички въведени данни." } },
      { element: "[data-tour='summary-page1']", popover: { title: "Страница 1 — Интраоперативна",      description: "Пълната интраоперативна таблица с графика на жизнени показатели, общо медикаменти и баланс на течности.", side: "right" } },
      { element: "[data-tour='summary-page2']", popover: { title: "Страница 2 — Пред- и следоперативна", description: "Предоперативна оценка, рискови скали, оценка на дихателния път, придружаващи заболявания и следоперативно събуждане.", side: "right" } },
      { element: "[data-tour='summary-print']", popover: { title: "Печат / Запази като PDF",           description: "Натиснете тук за генериране на протокола. Въведете имената и ИЗ на пациента — те не се съхраняват.", side: "bottom" } },
      { popover: { title: "Случаят е приключен ✓", description: "Случаят е записан и ще се появи в таблото. Демото приключи — готови сте да записвате реални случаи!" } },
    ],
  },
}

const STEP_TOUR: TourId[] = ["preop", "intraop", "postop", "summary"]

export function TourManager({ children }: { children: React.ReactNode }) {
  const locale    = useLocale()
  const pathname  = usePathname()
  const driverRef = useRef<Driver | null>(null)
  const [currentFormStep, setCurrentFormStep] = useState<number | null>(null)

  const startTour = useCallback(async (tourId: TourId = "dashboard") => {
    const { driver } = await import("driver.js")
    await import("driver.js/dist/driver.css")

    if (driverRef.current) driverRef.current.destroy()

    const lang  = locale === "bg" ? "bg" : "en"
    const steps = TOURS[tourId][lang]

    const d = driver({
      animate:        true,
      smoothScroll:   true,
      overlayOpacity: 0.45,
      popoverClass:   "lospor-tour",
      nextBtnText:    lang === "bg" ? "Напред →" : "Next →",
      prevBtnText:    lang === "bg" ? "← Назад"  : "← Back",
      doneBtnText:    lang === "bg" ? "Готово ✓"  : "Done ✓",
      progressText:   lang === "bg" ? "{{current}} от {{total}}" : "{{current}} of {{total}}",
      showProgress:   true,
      steps,
      onDestroyStarted: () => {
        if (tourId === "dashboard") localStorage.setItem("tourCompleted", "1")
        // Clear demo flag when summary tour finishes
        if (tourId === "summary") localStorage.removeItem("demoWalkthrough")
        d.destroy()
      },
    })

    driverRef.current = d
    d.drive()
  }, [locale])

  // Auto-start dashboard tour for first-time users.
  //
  // Waits for the screen to be clear: a first-time user who opens settings (or
  // any dialog) in the first moments would otherwise get the tour popping up on
  // top of it, pointing at things the dialog is covering. Rather than racing,
  // hold off and start once the dialog is closed.
  useEffect(() => {
    if (pathname !== "/dashboard") return
    if (localStorage.getItem("tourCompleted")) return

    const timer = setTimeout(() => {
      // Someone who opened a dialog in the first second is busy doing something
      // deliberate. Skip this visit entirely rather than queueing the tour to
      // spring out the moment they close it — that is just a later ambush.
      // `tourCompleted` stays unset, so it offers itself next time they land
      // here with a clear screen.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      startTour("dashboard")
    }, 900)
    return () => clearTimeout(timer)
  }, [pathname, startTour])

  // A dialog opening beats a running tour.
  //
  // Holding the tour back before it starts is not enough: it can already be up
  // when the user opens settings, and it renders above the dialog — pointing at
  // things the dialog now covers. Opening a dialog is a deliberate action, so
  // the automatic tour yields to it.
  //
  // driver.js's public `destroy()` skips the `onDestroyStarted` hook, so this
  // does not mark the tour complete — someone dismissed at step 2 of 7 has not
  // seen it, and it offers itself again next time they open the dashboard.
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return
    const observer = new MutationObserver(() => {
      if (!driverRef.current) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
        driverRef.current.destroy()
        driverRef.current = null
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  // Demo walkthrough: auto-start the right form tour when step changes
  useEffect(() => {
    if (!localStorage.getItem("demoWalkthrough")) return
    if (currentFormStep === null) return
    const tourId = STEP_TOUR[currentFormStep]
    if (!tourId) return
    const t = setTimeout(() => startTour(tourId), 700)
    return () => clearTimeout(t)
  }, [currentFormStep, startTour])

  return (
    <TourContext.Provider value={{ startTour, currentFormStep, setCurrentFormStep }}>
      {children}
    </TourContext.Provider>
  )
}
