import { describe, expect, it } from "vitest"
import {
  backToProcedureGroup,
  chooseExactOperation,
  filterProcedureCodes,
  plannedProcedureText,
  procedureGroupTag,
} from "./procedure-codes"
import { parseClinicalSearchResult, searchProcedures, type ProcedureSearchRow } from "./search"

// Bulgarian procedure names (2026-11-14): the groups stay, the words change.
const DOMAIN = "Hepatobiliary and Pancreas Procedures"
const row = (code: string, description: string, descriptionBg: string, extra = ""): ProcedureSearchRow => ({
  code, group: "Cholecystectomy", domain: DOMAIN, description,
  groupBg: "Холецистектомия", domainBg: "Черен дроб, жлъчни пътища и панкреас",
  descriptionBg, searchBg: `${descriptionBg} ${extra}`.toLowerCase(),
})
const ROWS: ProcedureSearchRow[] = [
  row("0FB40ZZ", "Excision of Gallbladder, Open Approach", "Парциална холецистектомия, отворен достъп"),
  row("0FT44ZZ", "Resection of Gallbladder, Percutaneous Endoscopic Approach", "Холецистектомия, лапароскопски достъп", "лхе резекция жлъчен мехур"),
  { code: "0DTJ4ZZ", group: "Appendectomy", domain: "Gastrointestinal System Procedures", description: "Resection of Appendix, Percutaneous Endoscopic Approach",
    groupBg: "Апендектомия", domainBg: "Храносмилателна система", descriptionBg: "Апендектомия, лапароскопски достъп", searchBg: "апендектомия, лапароскопски достъп" },
]

describe("searching procedures in Bulgarian", () => {
  it("finds the group by an operation's Bulgarian name, words in any order", () => {
    expect(searchProcedures(ROWS, "холецистектомия").map(r => r.group)).toEqual(["Cholecystectomy"])
    expect(searchProcedures(ROWS, "мехур резекция").map(r => r.group)).toEqual(["Cholecystectomy"])
    expect(searchProcedures(ROWS, "лхе").map(r => r.group)).toEqual(["Cholecystectomy"])
  })

  it("still finds by the English words", () => {
    expect(searchProcedures(ROWS, "appendix").map(r => r.group)).toEqual(["Appendectomy"])
  })

  it("labels the chosen group in Bulgarian and keeps the English key", () => {
    const tag = parseClinicalSearchResult("procedure", searchProcedures(ROWS, "холецист")[0], "bg")
    expect(tag).toMatchObject({
      label: "Холецистектомия", code: "Cholecystectomy", group: "Cholecystectomy",
      labelEn: "Cholecystectomy", labelBg: "Холецистектомия", sub: "Черен дроб, жлъчни пътища и панкреас",
    })
    // The same choice in English reads in English.
    expect(parseClinicalSearchResult("procedure", ROWS[0], "en")).toMatchObject({ label: "Cholecystectomy", sub: DOMAIN })
  })
})

describe("the exact operation in Bulgarian", () => {
  it("narrows by Bulgarian words and returns the Bulgarian name", () => {
    expect(filterProcedureCodes(ROWS, "Cholecystectomy", "лапароскопски")).toEqual([
      { code: "0FT44ZZ", description: "Resection of Gallbladder, Percutaneous Endoscopic Approach", descriptionBg: "Холецистектомия, лапароскопски достъп" },
    ])
  })

  it("reads on the record in the language it was chosen in", () => {
    const group = procedureGroupTag(ROWS[1], "bg")
    const exact = chooseExactOperation(group, { code: "0FT44ZZ", group: "Cholecystectomy", domain: DOMAIN,
      description: ROWS[1].description, descriptionBg: ROWS[1].descriptionBg }, "bg")
    expect(exact).toMatchObject({ label: "Холецистектомия", code: "0FT44ZZ", system: "ICD-10-PCS", group: "Cholecystectomy" })
    expect(plannedProcedureText([exact])).toBe("Холецистектомия: Холецистектомия, лапароскопски достъп [0FT44ZZ]")
    const english = chooseExactOperation(procedureGroupTag(ROWS[1], "en"), ROWS[1], "en")
    expect(plannedProcedureText([english])).toBe("Cholecystectomy: Resection of Gallbladder, Percutaneous Endoscopic Approach [0FT44ZZ]")
  })

  it("goes back to the group in the same language", () => {
    const exact = chooseExactOperation(procedureGroupTag(ROWS[1], "bg"), ROWS[1], "bg")
    expect(backToProcedureGroup(exact)).toMatchObject({ label: "Холецистектомия", code: "Cholecystectomy", labelBg: "Холецистектомия" })
  })
})

describe("ranking Bulgarian group names", () => {
  it("does not count a word that is only in the group's exclusion", () => {
    const rows: ProcedureSearchRow[] = [
      { code: "0RR", group: "Arthroplasty of other joint (excluding knee and hip)", domain: "M", description: "x",
        groupBg: "Артропластика на други стави (без коляно и тазобедрена става)", searchBg: "артропластика на други стави (без коляно и тазобедрена става) ендопротеза" },
      { code: "0SR", group: "Hip arthroplasty", domain: "M", description: "y",
        groupBg: "Артропластика на тазобедрената става", searchBg: "артропластика на тазобедрената става ендопротеза" },
    ]
    expect(searchProcedures(rows, "тазобедрена ендопротеза")[0].group).toBe("Hip arthroplasty")
  })
})

describe("procedure search by words (2026-11-14, 100 paediatric procedures)", () => {
  const rows: ProcedureSearchRow[] = [
    { code: "0DTJ4ZZ", group: "Appendectomy", domain: "G", description: "Resection of Appendix, Percutaneous Endoscopic Approach" },
    { code: "0VT08ZZ", group: "Prostatectomy", domain: "M", description: "Resection of Prostate, Via Natural or Artificial Opening Endoscopic",
      groupBg: "Простатектомия", descriptionBg: "Простатектомия, трансуретрален ендоскопски достъп (цистоскопия)", searchBg: "простатектомия, трансуретрален ендоскопски достъп (цистоскопия)" },
    { code: "0TJB8ZZ", group: "Cystoscopy and ureteroscopy (including biopsy)", domain: "U", description: "Inspection of Bladder, Via Natural or Artificial Opening Endoscopic",
      groupBg: "Цистоскопия и уретероскопия (вкл. биопсия)", descriptionBg: "Цистоскопия", searchBg: "цистоскопия" },
    { code: "0WQF0ZZ", group: "Abdominal wall repair (including hernia)", domain: "G", description: "Repair Abdominal Wall, Open Approach",
      groupBg: "Пластика на коремната стена (вкл. херния)", searchBg: "пластика на коремната стена", groupTerms: "гастрошизис омфалоцеле gastroschisis omphalocele" },
  ]
  it("finds an English phrase word by word, with the clinician's approach word", () => {
    expect(searchProcedures(rows, "laparoscopic appendectomy").map(r => r.group)).toEqual(["Appendectomy"])
  })
  it("finds a group by a curated clinical word in either language", () => {
    expect(searchProcedures(rows, "гастрошизис")[0].group).toBe("Abdominal wall repair (including hernia)")
    expect(searchProcedures(rows, "omphalocele")[0].group).toBe("Abdominal wall repair (including hernia)")
  })
  it("does not let an approach word or a common group outrank the operation named", () => {
    expect(searchProcedures(rows, "цистоскопия")[0].group).toBe("Cystoscopy and ureteroscopy (including biopsy)")
  })
})
