import Link from "next/link"
import { getLocale } from "next-intl/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LosporBrand } from "@/components/LosporBrand"

export const metadata = { title: "Privacy Notice - LOSPOR Hospital" }

export default async function PrivacyPage() {
  const bg = await getLocale() === "bg"
  const sections = bg
    ? [
        {
          title: "1. Оператор на инсталацията",
          body: "Тази инсталация на LOSPOR Hospital се управлява от Вашето лечебно заведение. Лечебното заведение определя целите, правното основание, срока за съхранение и лицата с достъп. За въпроси и упражняване на права се обърнете към местния администратор или длъжностното лице по защита на данните.",
        },
        {
          title: "2. Данни, съхранявани в лечебното заведение",
          body: "Локалният сървър съхранява данни за акаунта, периоперативни записи, одитна следа и болничен номер на пациента. Болничният номер се съхранява отделно от клиничните данни, криптиран е и се използва за свързване на процедурите на един пациент само в рамките на лечебното заведение.",
        },
        {
          title: "3. Изследователски обмен",
          body: "Само завършени случаи, разрешени от местната политика, могат да бъдат преобразувани в псевдонимизиран OMOP пакет и изпратени към одобрен централен регистър. Болничният номер, ключовете за локална идентификация и необработените клинични записи не се изпращат. Централният регистър няма достъп до локалната база данни.",
        },
        {
          title: "4. Офлайн данни и външни услуги",
          body: "PWA клиентът може временно да пази криптографски токени, чернови и чакащи промени на използваното устройство. Имейл и AI услуги се използват само ако лечебното заведение ги е конфигурирало и разрешило. Условията за тези услуги се определят от местната политика.",
        },
        {
          title: "5. Съхранение, достъп и сигурност",
          body: "Сроковете за съхранение, архивиране, коригиране, ограничаване и изтриване се определят от лечебното заведение и приложимото право. Достъпът е ролеви, действията се одитират, а мрежовият трафик се защитава с HTTPS. Клиничният запис в LOSPOR не заменя официалното болнично досие, освен ако лечебното заведение изрично не е утвърдило такава употреба.",
        },
      ]
    : [
        {
          title: "1. Installation operator",
          body: "This LOSPOR Hospital installation is operated by your healthcare institution. The institution determines purpose, legal basis, retention, and access. Contact the local administrator or data protection officer for questions or data-subject requests.",
        },
        {
          title: "2. Data retained by the institution",
          body: "The local server stores account data, perioperative records, audit history, and a hospital patient number. The patient number is encrypted, kept separate from clinical data, and used to link procedures for the same patient only within the institution.",
        },
        {
          title: "3. Research exchange",
          body: "Only complete cases allowed by local policy may be transformed into a pseudonymised OMOP package and sent to an approved central registry. Hospital patient numbers, local identity keys, and raw clinical records are not sent. Central has no access to the local database.",
        },
        {
          title: "4. Offline data and external services",
          body: "The PWA may temporarily retain cryptographic tokens, drafts, and queued changes on the device. Email and AI services are used only when configured and authorised by the institution. Their use is governed by local policy.",
        },
        {
          title: "5. Retention, access, and security",
          body: "Retention, backup, correction, restriction, and deletion are governed by the institution and applicable law. Access is role-based, actions are audited, and network traffic is protected with HTTPS. A LOSPOR record does not replace the official hospital record unless the institution has explicitly approved that use.",
        },
      ]

  return (
    <div className="min-h-screen bg-slate-100 p-4 py-12 dark:bg-[#111]">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center"><LosporBrand compact linked /></div>
        <Card>
          <CardHeader>
            <CardTitle>{bg ? "Информация за поверителност" : "Privacy Notice"}</CardTitle>
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
          <Link href="/terms" className="hover:underline">
            {bg ? "Условия за ползване" : "Terms of Use"}
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
