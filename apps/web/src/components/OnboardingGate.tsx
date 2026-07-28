"use client"

import { useState } from "react"
import { OnboardingModal } from "./OnboardingModal"

export function OnboardingGate({ needsOnboarding, children }: { needsOnboarding: boolean; children: React.ReactNode }) {
  const [accepted, setAccepted] = useState(!needsOnboarding)

  return (
    <>
      {!accepted && <OnboardingModal onAccepted={() => setAccepted(true)} />}
      {children}
    </>
  )
}
