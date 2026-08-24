import Link from "next/link"
import { getLocale } from "next-intl/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LosporBrand } from "@/components/LosporBrand"

export const metadata = { title: "Privacy Policy - LOSPOR" }

export default async function PrivacyPage() {
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
            <CardTitle>{bg ? "Политика за поверителност" : "Privacy Policy"}</CardTitle>
            <p className="text-xs text-slate-400 mt-1">{bg ? "В сила от: 3 юли 2026 г. - Версия 4.0" : "Effective date: 3 July 2026 - Version 4.0"}</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 space-y-4 text-sm leading-relaxed">
            {bg ? (
              <>
                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">1. Кои сме ние</h3>
                  <p>LOSPOR е независим инструмент, управляван от Калоян Джунов (контакт: <a href="mailto:kaloyandjunow@gmail.com" className="text-blue-600 hover:underline">kaloyandjunow@gmail.com</a>).</p>
                  <p>Всеки потребител е единствен администратор на данните за клиничните записи, които въвежда. Калоян Джунов управлява инфраструктурата, в която се съхраняват тези данни. С използването на LOSPOR потвърждавате, че носите отговорност да гарантирате, че използването ви съответства на приложимото законодателство за защита на данните.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">2. Какво обработваме</h3>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><strong>Данни за акаунта:</strong> име, имейл адрес, титла, институция, дата на регистрация, час на последно влизане, роля и записи за приемане на условията.</li>
                    <li><strong>Данни за случая:</strong> структурирани периоперативни полета, нормализирани изследователски редове, само-добавящи се интраоперативни събития, времеви маркери, свързаност с институция и одитни метаданни. Не се предвижда съхранение на имена на пациенти, ЕГН, дати на раждане или номера на медицински досиета.</li>
                    <li><strong>Одит лог:</strong> записи за създаване, обновяване, изтриване на случаи, използване на AI, износ на данни и събития на акаунта.</li>
                    <li><strong>Токени за сесия:</strong> краткотрайни бисквитки за уеб сесия и мобилни bearer токени. Мобилните токени се анулират при изход.</li>
                    <li><strong>Локални данни на PWA:</strong> localStorage на браузъра може да съхранява bearer токена, офлайн чернови и изчакващи записи, включително изчакващи интраоперативни събития, до изход или успешна синхронизация.</li>
                    <li><strong>Имейли на акаунта:</strong> имейл адресът ви се използва за изпращане на връзки за потвърждение на имейл (валидни 24 часа) и връзки за нулиране на паролата (валидни 1 час). Токените се съхраняват хеширани и са еднократни.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">3. Правно основание</h3>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><strong>Данни за акаунта:</strong> законен интерес за предоставяне на услугата; изрично съгласие, записано при регистрация.</li>
                    <li><strong>Данни за случая:</strong> законен интерес за личен учебен дневник, одит и псевдонимизирани изследователски набори от данни; вие носите отговорност за записите, които въвеждате.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">4. Подизпълнители</h3>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><strong>Supabase:</strong> хостинг на PostgreSQL база данни.</li>
                    <li><strong>Vercel:</strong> хостинг на приложението и сървърни функции.</li>
                    <li><strong>Mistral AI:</strong> опционален AI извод за изображения на лабораторни резултати, изображения на монитори и структурирани заявки към клиничния съветник. Качените изображения се обработват за извличане на данни и трябва да бъдат изрязани, за да се премахнат идентификатори, преди качване.</li>
                    <li><strong>Brevo:</strong> доставка на транзакционни имейли (потвърждение на акаунт и нулиране на парола). Само вашият имейл адрес и име се споделят за целите на изпращането на тези имейли.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">5. Съхранение на данните</h3>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Данните за случаите се съхраняват, докато акаунтът ви е активен, и се обработват съгласно приложимата институционална или изследователска политика за съхранение след деактивиране на акаунта.</li>
                    <li>Одитните логове се съхраняват за целите на сигурността, целостта на данните и медико-правната проследимост съгласно политиката за съхранение.</li>
                    <li>Изтритите акаунти се деактивират незабавно, представеният мобилен токен се анулира и акаунтът се маркира като изтрит. По-нататъшно изтриване или анонимизиране се обработва съгласно политиката за съхранение.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">6. Вашите права</h3>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><strong>Достъп:</strong> изтеглете JSON износ на акаунта и случаите си от Настройки - Поверителност и данни.</li>
                    <li><strong>Изтриване:</strong> изтрийте акаунта си от Настройки - Поверителност и данни. Достъпът до акаунта се деактивира незабавно. Заявки за допълнително изтриване или анонимизиране могат да бъдат изпратени на посочения по-долу контактен адрес.</li>
                    <li>За други заявки се свържете с нас на <a href="mailto:kaloyandjunow@gmail.com" className="text-blue-600 hover:underline">kaloyandjunow@gmail.com</a>.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">7. Сигурност</h3>
                  <p>Паролите се хешират с bcrypt. Сесиите използват краткотрайни токени с механизъм за анулиране. Целият трафик е криптиран през HTTPS. Свободен текст, изпратен през API, се проверява сървърно за често срещани идентифициращи модели. Контролираните клинични терминологични етикети са в разрешен списък, така че валидните клинични термини не се блокират. Тази проверка е с най-добри усилия и не гарантира, че всички лични идентификатори ще бъдат уловени.</p>
                </section>
              </>
            ) : (
              <>
                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">1. Who we are</h3>
                  <p>LOSPOR is an independent tool operated by Kaloyan Dzhunov (contact: <a href="mailto:kaloyandjunow@gmail.com" className="text-blue-600 hover:underline">kaloyandjunow@gmail.com</a>).</p>
                  <p>Controller and processor roles depend on the actual purposes and means of each processing activity, and are not settled by this page. In most deployments the treating institution or the clinician is the controller for the clinical records entered, while the operator provides and maintains the infrastructure; where the operator determines purposes of its own, joint controllership may arise. Institutions deploying LOSPOR should complete their own role mapping, legal basis assessment under Articles 6 and 9, and where required a data protection impact assessment.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">2. What we process</h3>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><strong>Account data:</strong> name, email address, title, institution, registration date, last login time, role, and terms acceptance records.</li>
                    <li><strong>Case data:</strong> structured perioperative fields, normalized research rows, append-only intraoperative events, timestamps, institution linkage, and audit metadata. Direct identifiers — patient names, national ID numbers, dates of birth and hospital record numbers — are not collected. Case data is therefore <strong>pseudonymised, not anonymous</strong>: age, sex, institution, precise timestamps, rare clinical combinations and free-text entries can in principle single out an individual, particularly in a small department. Pseudonymised data that can still be linked to a person remains personal data under the GDPR.</li>
                    <li><strong>Audit log:</strong> records of case creation, update, deletion, AI use, export, and account events.</li>
                    <li><strong>Session tokens:</strong> short-lived web session cookies and mobile bearer tokens. Bearer tokens are revoked on logout.</li>
                    <li><strong>PWA local data:</strong> browser localStorage may hold the bearer token, offline drafts, queued saves, and queued intraoperative events until logout or successful sync.</li>
                    <li><strong>Account emails:</strong> your email address is used to send email verification links (valid 24 hours) and password reset links (valid 1 hour). Tokens are stored hashed and are single-use.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">3. Legal basis</h3>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><strong>Account data:</strong> legitimate interest in providing the service; explicit consent recorded at registration.</li>
                    <li><strong>Case data:</strong> legitimate interest for personal learning log, audit, and pseudonymised research datasets; you remain responsible for the records you enter.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">4. Sub-processors</h3>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><strong>Supabase:</strong> PostgreSQL database hosting.</li>
                    <li><strong>Vercel:</strong> application hosting and serverless functions.</li>
                    <li><strong>Mistral AI:</strong> opt-in AI inference for lab report images, monitor images, and structured clinical advisor requests. Uploaded images are processed for extraction and should be cropped to remove identifiers before upload.</li>
                    <li><strong>Brevo:</strong> transactional email delivery (account verification and password reset emails). Only your email address and name are shared for the purpose of sending these emails.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">5. Data retention</h3>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Case data is retained while your account is active and processed according to the applicable institutional or research retention policy after account deactivation.</li>
                    <li>Audit logs are retained for security, integrity, and medico-legal traceability according to the retention policy.</li>
                    <li>Deleted accounts are disabled immediately, the presented mobile token is revoked, and the account is marked as deleted. Further deletion or anonymisation is processed according to the retention policy.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">6. Your rights</h3>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><strong>Access:</strong> download a JSON export of your account and cases from Settings - Privacy &amp; Data.</li>
                    <li><strong>Deletion:</strong> delete your account from Settings - Privacy &amp; Data. Account access is disabled immediately. Further deletion or anonymisation requests can be sent to the contact address below.</li>
                    <li>For other requests, contact <a href="mailto:kaloyandjunow@gmail.com" className="text-blue-600 hover:underline">kaloyandjunow@gmail.com</a>.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">7. Security</h3>
                  <p>Passwords are hashed with bcrypt. Sessions use short-lived tokens with a revocation mechanism. All traffic is encrypted over HTTPS. Free-text fields submitted via the API are checked server-side for common identifying patterns. Controlled clinical vocabulary labels are allowlisted so valid clinical terms are not blocked. This detection is best-effort and does not guarantee that all personal identifiers are caught.</p>
                </section>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400 dark:text-slate-600">
          <Link href="/terms" className="hover:underline">{bg ? "Условия за ползване" : "Terms of Service"}</Link>
          {" - "}
          <Link href="/login" className="hover:underline">{bg ? "Обратно към вход" : "Back to login"}</Link>
        </p>
      </div>
    </div>
  )
}
