export type PediatricPreopLabels = {
  mode: string
  adult: string
  pediatric: string
  pediatricUnavailableNew: string
  pediatricUnavailableDraft: string
  pediatricUnavailableExisting: string
  pediatricClientUpdateRequired: string
  preciseAge: string
  ageUnit: string
  days: string
  months: string
  years: string
  daysShort: string
  monthsShort: string
  yearsShort: string
  switchRequired: string
  adultRequired: string
  switchMode: string
  switchToPediatric: string
  switchToAdult: string
  softReference: string
  povoc: string
  povocSurgery: string
  povocStrabismus: string
  povocHistory: string
  povocAgeFactor: string
  coldsApplicable: string
  coldsScore: string
  currentSymptoms: string
  onset: string
  lungDisease: string
  airwayDevice: string
  surgery: string
  select: string
  none: string
  mild: string
  moderateSevere: string
  moreThan4Weeks: string
  twoTo4Weeks: string
  lessThan2Weeks: string
  maskOrNone: string
  supraglottic: string
  trachealTube: string
  nonAirway: string
  minorAirway: string
  majorAirway: string
  fasting: string
  hoursSinceIntake: string
  clearFluids: string
  breastMilk: string
  formula: string
  solids: string
  met: string
  notMet: string
  unknown: string
  calculators: string
  bsa: string
  maintenanceFluid: string
  resuscitation: string
  accept: string
  accepted: string
  saveFirst: string
  profilesUnavailable: string
  ruleset: string
  yes: string
  no: string
  calculationFailed: string
}

export const PEDIATRIC_PREOP_LABELS: Record<"en" | "bg", PediatricPreopLabels> = {
  en: {
    mode: "Clinical mode",
    adult: "Adult",
    pediatric: "Pediatric",
    pediatricUnavailableNew: "Pediatric mode is not currently available for this installation. It cannot be selected for a new case.",
    pediatricUnavailableDraft: "Pediatric mode became unavailable before this case was created. The entered Pediatric information remains visible, but it cannot be sent to the server. Switch to Adult or ask the installation administrator to enable Pediatric mode.",
    pediatricUnavailableExisting: "This existing case remains visible in Pediatric mode. Pediatric changes cannot be sent to the server while Pediatric availability is disabled or cannot be confirmed.",
    pediatricClientUpdateRequired: "This Mobile/PWA version cannot start a Pediatric case. Update the app, then try again.",
    preciseAge: "Precise age",
    ageUnit: "Age unit",
    days: "Days",
    months: "Months",
    years: "Years",
    daysShort: "d",
    monthsShort: "mo",
    yearsShort: "y",
    switchRequired: "This age requires pediatric mode.",
    adultRequired: "Pediatric mode is limited to patients under 18.",
    switchMode: "Switch mode",
    switchToPediatric: "Switch to pediatric mode",
    switchToAdult: "Switch to adult mode",
    softReference: "Age-based reference, not a hard limit",
    povoc: "POVOC",
    povocSurgery: "Expected surgery duration at least 30 minutes",
    povocStrabismus: "Strabismus surgery",
    povocHistory: "Patient or family history of postoperative vomiting",
    povocAgeFactor: "Age at least 3 years",
    coldsApplicable: "Current or recent upper respiratory infection",
    coldsScore: "COLDS score",
    currentSymptoms: "Current symptoms",
    onset: "Onset",
    lungDisease: "Lung disease",
    airwayDevice: "Planned airway device",
    surgery: "Surgery type",
    select: "Select",
    none: "None",
    mild: "Mild",
    moderateSevere: "Moderate or severe",
    moreThan4Weeks: "More than 4 weeks",
    twoTo4Weeks: "2 to 4 weeks",
    lessThan2Weeks: "Less than 2 weeks",
    maskOrNone: "Face mask or none",
    supraglottic: "Supraglottic airway",
    trachealTube: "Tracheal tube",
    nonAirway: "Non-airway surgery",
    minorAirway: "Minor airway surgery",
    majorAirway: "Major airway surgery",
    fasting: "Pediatric fasting",
    hoursSinceIntake: "Hours since last intake",
    clearFluids: "Clear fluids",
    breastMilk: "Breast milk",
    formula: "Infant formula under 1 year",
    solids: "Solid food or cow milk",
    met: "Met",
    notMet: "Not met",
    unknown: "Unknown",
    calculators: "Pediatric calculators",
    bsa: "BSA (Mosteller)",
    maintenanceFluid: "Maintenance fluid",
    resuscitation: "Resuscitation reference",
    accept: "Accept result",
    accepted: "Accepted",
    saveFirst: "Save case first",
    profilesUnavailable: "Equipment, ventilation, blood-volume, local-anaesthetic and dose suggestions remain unavailable until their clinical profiles are reviewed and approved.",
    ruleset: "Ruleset",
    yes: "Yes",
    no: "No",
    calculationFailed: "Could not record the accepted calculation.",
  },
  bg: {
    mode: "Клиничен режим",
    adult: "Възрастен",
    pediatric: "Педиатричен",
    pediatricUnavailableNew: "Педиатричният режим в момента не е достъпен за тази инсталация. Той не може да бъде избран за нов случай.",
    pediatricUnavailableDraft: "Педиатричният режим е станал недостъпен, преди този случай да бъде създаден. Въведената педиатрична информация остава видима, но не може да бъде изпратена към сървъра. Преминете към режим за възрастен или помолете администратора на инсталацията да активира педиатричния режим.",
    pediatricUnavailableExisting: "Този съществуващ случай остава видим в педиатричен режим. Промените по него не могат да бъдат изпратени към сървъра, докато достъпността на педиатричния режим е изключена или не може да бъде потвърдена.",
    pediatricClientUpdateRequired: "Тази версия на Mobile/PWA не може да започне педиатричен случай. Обновете приложението и опитайте отново.",
    preciseAge: "Точна възраст",
    ageUnit: "Единица за възраст",
    days: "Дни",
    months: "Месеци",
    years: "Години",
    daysShort: "д.",
    monthsShort: "мес.",
    yearsShort: "г.",
    switchRequired: "Тази възраст изисква педиатричен режим.",
    adultRequired: "Педиатричният режим е за пациенти под 18 години.",
    switchMode: "Смени режима",
    switchToPediatric: "Премини към педиатричен режим",
    switchToAdult: "Премини към режим за възрастен",
    softReference: "Референтни стойности за възрастта, а не твърди граници",
    povoc: "POVOC",
    povocSurgery: "Очаквана продължителност на операцията поне 30 минути",
    povocStrabismus: "Операция за страбизъм",
    povocHistory: "Анамнеза за постоперативно повръщане при пациента или семейството",
    povocAgeFactor: "Възраст поне 3 години",
    coldsApplicable: "Настояща или скорошна инфекция на горните дихателни пътища",
    coldsScore: "Оценка по COLDS",
    currentSymptoms: "Настоящи симптоми",
    onset: "Начало",
    lungDisease: "Белодробно заболяване",
    airwayDevice: "Планирано устройство за дихателните пътища",
    surgery: "Вид операция",
    select: "Избери",
    none: "Няма",
    mild: "Леки",
    moderateSevere: "Умерени или тежки",
    moreThan4Weeks: "Преди повече от 4 седмици",
    twoTo4Weeks: "Преди 2 до 4 седмици",
    lessThan2Weeks: "Преди по-малко от 2 седмици",
    maskOrNone: "Лицева маска или без устройство",
    supraglottic: "Супраглотично устройство",
    trachealTube: "Трахеална тръба",
    nonAirway: "Операция извън дихателните пътища",
    minorAirway: "Малка операция на дихателните пътища",
    majorAirway: "Голяма операция на дихателните пътища",
    fasting: "Предоперативно гладуване при деца",
    hoursSinceIntake: "Часове от последния прием",
    clearFluids: "Бистри течности",
    breastMilk: "Кърма",
    formula: "Мляко за кърмачета под 1 година",
    solids: "Твърда храна или краве мляко",
    met: "Изпълнено",
    notMet: "Не е изпълнено",
    unknown: "Неизвестно",
    calculators: "Педиатрични калкулатори",
    bsa: "BSA (Mosteller)",
    maintenanceFluid: "Поддържаща скорост на инфузия на течности",
    resuscitation: "Референтни стойности за ресусцитация",
    accept: "Приеми резултата",
    accepted: "Прието",
    saveFirst: "Първо запази случая",
    profilesUnavailable: "Препоръките за оборудване, вентилация, кръвен обем, локални анестетици и дози на медикаменти остават недостъпни, докато клиничните им профили не бъдат прегледани и одобрени.",
    ruleset: "Версия на правилата",
    yes: "Да",
    no: "Не",
    calculationFailed: "Приетото изчисление не можа да бъде записано.",
  },
}
