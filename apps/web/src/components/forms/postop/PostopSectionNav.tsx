"use client"

import { StepTabBar } from "@/components/forms/StepTabBar"
import { SectionJumpStrip } from "@/components/forms/SectionJumpStrip"

export type PostopSectionId = "vitals" | "score" | "pain" | "discharge"
export type PostopNavSection = { id: PostopSectionId; label: string; missing: boolean }

/**
 * The postoperative step's sections (10.0.0) without the case panel: the
 * shared tab bar, one section at a time, or the shared strip of jump links
 * over the scrolling page. The sidebar layout uses the case panel instead.
 */
export function PostopSectionNav({ layout, sections, activeTab, onTab, label }: {
  /** The bar's accessible name. */
  label: string
  layout: "sidebar" | "scroll" | "tabs"
  sections: PostopNavSection[]
  activeTab: PostopSectionId
  onTab: (id: PostopSectionId) => void
}) {
  if (layout === "tabs") {
    return (
      <StepTabBar
        tabs={sections.map(section => ({ value: section.id, label: section.label, flagged: section.missing }))}
        active={activeTab}
        onSelect={onTab}
        label={label}
        testId="postop-tabs"
      />
    )
  }
  return <SectionJumpStrip sections={sections} anchorPrefix="postop-sec-" testId="postop-section-strip" />
}
