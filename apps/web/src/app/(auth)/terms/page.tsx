import Link from "next/link"
import { getLocale } from "next-intl/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LosporBrand } from "@/components/LosporBrand"

export const metadata = { title: "Terms of Service - LOSPOR" }

export default async function TermsPage() {
  const locale = await getLocale()
  const bg = locale === "bg"

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50 dark:from-[#111] dark:to-[#1a1a2e] p-4 py-12">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <LosporBrand compact linked />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{bg ? "Условия за ползване" : "Terms of Service"}</CardTitle>
            <p className="text-xs text-slate-400 mt-1">{bg ? "В сила от: 3 юли 2026 г. - Версия 4.0" : "Effective date: 3 July 2026 - Version 4.0"}</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 space-y-4 text-sm leading-relaxed">
            {bg ? (
              <>
                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">1. За какво е предназначен LOSPOR</h3>
                  <p>LOSPOR е личен анестезиологичен дневник на случаи и платформа за периоперативни данни за документация, обучение, професионално развитие, одит и псевдонимизиран изследователски износ.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">2. Какво не трябва да въвеждате</h3>
                  <p>С използването на LOSPOR се съгласявате, че няма да въвеждате имена на пациенти, национални идентификатори, номера на медицински досиета, дати на раждане, данни за контакт, адреси или друга информация, идентифицираща пациента пряко, в което и да е поле или качено изображение.</p>
                  <p className="text-amber-700 dark:text-amber-400 text-xs font-medium">LOSPOR не е система за болнична медицинска документация. Вашето болнично медицинско досие остава авторитетният запис за пациента.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">3. Вашият акаунт</h3>
                  <p>Акаунтите са за индивидуална употреба. Вие носите отговорност за опазването на данните си за вход в тайна. Трябва да потвърдите имейл адреса си, преди да можете да влезете в системата. Изтриването на акаунта деактивира достъпа незабавно; допълнителното изтриване или анонимизиране се обработва съгласно политиката за съхранение.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">4. AI сканиране на изображения</h3>
                  <p>LOSPOR предлага опционално AI сканиране на изображения за лабораторни резултати и показания на анестезиологични монитори. Резултатът от AI е чернова на извлечени данни за клиничен преглед и не трябва да се използва като единствена основа за диагностика, лечение или документация. Трябва да изрежете или прикриете идентификатори преди качване.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">5. Медицински отказ от отговорност</h3>
                  <p>LOSPOR е предназначен само за периоперативна документация, изследвания и подкрепа на работния процес. Той не е предназначен да замества клиничната преценка, да предоставя автономно вземане на клинични решения или да служи като сертифицирано медицинско изделие.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">6. Отговорност</h3>
                  <p>LOSPOR се предоставя „както е“, без каквато и да е гаранция. Операторът не носи отговорност за клинични решения, взети с помощта на или на базата на LOSPOR. Използвате услугата на собствен професионален риск.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">7. Отворен код</h3>
                  <p>LOSPOR е публикуван под лиценз <strong>AGPL-3.0</strong>. Ако хоствате модифицирана версия сами, трябва да публикувате изходния код на модификациите си под същия лиценз.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">8. Контакт</h3>
                  <p><a href="mailto:kaloyandjunow@gmail.com" className="text-blue-600 hover:underline">kaloyandjunow@gmail.com</a></p>
                </section>
              </>
            ) : (
              <>
                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">1. What LOSPOR is for</h3>
                  <p>LOSPOR is a personal anaesthetic case log and perioperative data platform for documentation, learning, professional development, audit, and pseudonymised research export.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">2. What you must not enter</h3>
                  <p>By using LOSPOR you agree that you will not enter patient names, national identifiers, hospital record numbers, dates of birth, contact details, addresses, or any other direct patient-identifying information into any field or uploaded image.</p>
                  <p className="text-amber-700 dark:text-amber-400 text-xs font-medium">LOSPOR is not a hospital medical record system. Your hospital medical record remains the authoritative patient record.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">3. Your account</h3>
                  <p>Accounts are for individual use only. You are responsible for keeping your credentials secure. You must verify your email address before you can sign in. Account deletion disables access immediately; additional deletion or anonymisation is handled according to the retention policy.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">4. AI image scanning</h3>
                  <p>LOSPOR provides optional AI-powered image scanning for lab reports and anaesthesia monitor readings. AI output is a draft extraction for clinician review and must not be used as the sole basis for diagnosis, treatment, or documentation. You must crop or obscure identifiers before upload.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">5. Medical disclaimer</h3>
                  <p>LOSPOR is intended for perioperative documentation, research, and workflow support only. It is not intended to replace clinical judgment, provide autonomous clinical decision-making, or serve as a certified medical device.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">6. Liability</h3>
                  <p>LOSPOR is provided as is without warranty of any kind. The operator accepts no liability for clinical decisions made using or based on LOSPOR. You use the service at your own professional risk.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">7. Open source</h3>
                  <p>LOSPOR is published under the <strong>AGPL-3.0</strong> licence. If you self-host a modified version, you must publish the source code of your modifications under the same licence.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">8. Contact</h3>
                  <p><a href="mailto:kaloyandjunow@gmail.com" className="text-blue-600 hover:underline">kaloyandjunow@gmail.com</a></p>
                </section>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400 dark:text-slate-600">
          <Link href="/privacy" className="hover:underline">{bg ? "Политика за поверителност" : "Privacy Policy"}</Link>
          {" - "}
          <Link href="/login" className="hover:underline">{bg ? "Обратно към вход" : "Back to login"}</Link>
        </p>
      </div>
    </div>
  )
}
