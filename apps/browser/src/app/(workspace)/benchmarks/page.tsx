import { BenchmarkWorkspace } from "@/components/benchmark-workspace"
import { PageHeading } from "@/components/page-heading"

export default function BenchmarksPage() {
  return (
    <>
      <PageHeading
        title="Benchmarks"
        titleBg="Сравнителни показатели"
        description="Track trends over time and compare only the institutions included in your authorized scope."
        descriptionBg="Проследявайте тенденции и сравнявайте само институции от разрешения обхват."
      />
      <BenchmarkWorkspace />
    </>
  )
}
