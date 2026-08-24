import { CompareCohorts } from "@/components/compare-cohorts"
import { PageHeading } from "@/components/page-heading"

export default function ComparePage() {
  return (
    <>
      <PageHeading
        titleKey="compareCohorts"
        descriptionKey="compareDescription"
      />
      <CompareCohorts />
    </>
  )
}
