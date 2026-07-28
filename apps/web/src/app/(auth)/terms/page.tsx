import Link from "next/link"
import { getLocale } from "next-intl/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LosporBrand } from "@/components/LosporBrand"

export const metadata = { title: "Terms of Use - LOSPOR Hospital" }

export default async function TermsPage() {
  const bg = await getLocale() === "bg"
  const sections = bg
    ? [
        {
          title: "1. Предназначение",
          body: "LOSPOR Hospital подпомага периоперативната документация, одита и псевдонимизирания изследователски обмен. Той не заменя клиничната преценка и не взема автономни клинични решения.",
        },
        {
          title: "2. Болничен номер на пациента",
          body: "Въвеждайте болничния номер само в специално обозначеното поле. Не въвеждайте имена, ЕГН, адреси, телефони или други директни идентификатори в свободен текст, изображения или клинични полета. Специалното поле пази номера криптирано и отделно от клиничните данни.",
        },
        {
          title: "3. Акаунти и отговорност",
          body: "Акаунтите се създават от лечебното заведение и са за индивидуална употреба. Пазете данните си за вход, не споделяйте сесия и съобщавайте незабавно за съмнение за неразрешен достъп. Използването се урежда и от вътрешните правила на лечебното заведение.",
        },
        {
          title: "4. AI и извлечени данни",
          body: "Ако AI функции са разрешени, техният резултат е само чернова за преглед от клиницист. Премахнете идентификаторите от изображенията и проверете всяка извлечена стойност преди запис.",
        },
        {
          title: "5. Изследователски износ",
          body: "Локалната политика определя кои завършени случаи могат да бъдат изпратени като псевдонимизирани OMOP данни. Потребителите не трябва да заобикалят ограниченията за износ, одита или подписаните потвърждения.",
        },
        {
          title: "6. Местни правила",
          body: "Лечебното заведение трябва да утвърди приложимите условия, политика за поверителност, клинична употреба, срокове за съхранение и процедура за поддръжка. При противоречие следвайте приложимото право и официалните вътрешни правила.",
        },
      ]
    : [
        {
          title: "1. Intended use",
          body: "LOSPOR Hospital supports perioperative documentation, audit, and pseudonymised research exchange. It does not replace clinical judgement or make autonomous clinical decisions.",
        },
        {
          title: "2. Hospital patient number",
          body: "Enter the hospital patient number only in its dedicated field. Do not place names, national identifiers, addresses, telephone numbers, or other direct identifiers in free text, images, or clinical fields. The dedicated field keeps the number encrypted and separate from clinical data.",
        },
        {
          title: "3. Accounts and responsibility",
          body: "Accounts are created by the healthcare institution and are for individual use. Protect credentials, do not share sessions, and report suspected unauthorised access immediately. Use is also governed by institutional policy.",
        },
        {
          title: "4. AI and extracted data",
          body: "When AI features are authorised, their output is a draft for clinician review. Remove identifiers from images and verify every extracted value before saving it.",
        },
        {
          title: "5. Research export",
          body: "Local policy determines which complete cases may be sent as pseudonymised OMOP data. Users must not bypass export controls, audit records, or signed receipt processing.",
        },
        {
          title: "6. Local rules",
          body: "The healthcare institution must approve the applicable terms, privacy notice, clinical use, retention, and support procedure. Where rules conflict, follow applicable law and the institution's official policy.",
        },
      ]

  return (
    <div className="min-h-screen bg-slate-100 p-4 py-12 dark:bg-[#111]">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center"><LosporBrand compact linked /></div>
        <Card>
          <CardHeader>
            <CardTitle>{bg ? "Условия за ползване" : "Terms of Use"}</CardTitle>
            <p className="mt-1 text-xs text-slate-400">
              {bg ? "LOSPOR Hospital - локална инсталация" : "LOSPOR Hospital - local installation"}
            </p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {sections.map(section => (
              <section key={section.title}>
                <h3 className="mb-1 font-semibold text-slate-800 dark:text-slate-100">
                  {section.title}
                </h3>
                <p>{section.body}</p>
              </section>
            ))}
          </CardContent>
        </Card>
        <p className="text-center text-xs text-slate-400 dark:text-slate-600">
          <Link href="/privacy" className="hover:underline">
            {bg ? "Информация за поверителност" : "Privacy Notice"}
          </Link>
          {" - "}
          <Link href="/login" className="hover:underline">
            {bg ? "Обратно към вход" : "Back to login"}
          </Link>
        </p>
      </div>
    </div>
  )
}
