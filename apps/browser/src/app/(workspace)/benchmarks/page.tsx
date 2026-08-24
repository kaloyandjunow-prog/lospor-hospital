import { BenchmarkWorkspace } from "@/components/benchmark-workspace"
import { PageHeading } from "@/components/page-heading"

export default function BenchmarksPage() {
  return (
    <>
      <PageHeading
        titleKey="benchmarksTitle"
        descriptionKey="benchmarksDescription"
      />
      <BenchmarkWorkspace />
    </>
  )
}
