import { CompareCohorts } from "@/components/compare-cohorts"
import { PageHeading } from "@/components/page-heading"

export default function ComparePage() {
  return (
    <>
      <PageHeading
        title="Compare cohorts"
        titleBg="Сравнение на кохорти"
        description="Evaluate the same outcomes across two independently defined populations."
        descriptionBg="Оценете едни и същи резултати в две независимо определени популации."
      />
      <CompareCohorts />
    </>
  )
}
