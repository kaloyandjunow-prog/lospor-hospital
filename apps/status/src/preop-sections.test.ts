import { describe, expect, it } from "vitest"
import { preopSectionsShape } from "./control-plane.js"
import { PreopSectionsFormError, newCustomOrderKey, preopSectionsUpdateFromForm } from "./preop-sections-form.js"
import { renderPostopFormEditor, renderPreopOrderListsEditor, renderPreopSectionsEditor } from "./preop-sections-ui.js"
import { preopSectionsFixture } from "./preop-sections.fixture.js"

const REASON = "Ward agreed the change"

describe("a form read on top of the configuration in use (1.7.0)", () => {
  it("changes only the postop sections from the postop form, and sends the rest back as it is", () => {
    const sections = preopSectionsFixture()
    const update = preopSectionsUpdateFromForm(sections, "PEDIATRIC", "postop", {
      section_POSTOP_RECOVERY_VITALS: "true", section_POSTOP_PAIN: "true", section_POSTOP_PONV: "true",
      // PAED left unticked: switched off.
    }, REASON)
    expect(update.sections).toMatchObject({ POSTOP_DELIRIUM: false, POSTOP_PAIN: true, MEDICAL_HISTORY: true, PEDIATRIC_FASTING: true })
    expect(update.orderOptions).toHaveLength(3)
    expect(update.consultSpecialtyKeys).toEqual(["1001"])
    expect(update.reason).toBe(REASON)
  })

  it("does not touch a section the population does not have", () => {
    const update = preopSectionsUpdateFromForm(preopSectionsFixture(), "ADULT", "postop", { section_POSTOP_DELIRIUM: "true" }, REASON)
    expect(update.sections.POSTOP_DELIRIUM).toBe(false)
  })

  it("switches preop sections without changing the postop ones", () => {
    const update = preopSectionsUpdateFromForm(preopSectionsFixture(), "ADULT", "sections", { section_CURRENT_MEDICATIONS: "true" }, REASON)
    expect(update.sections).toMatchObject({ MEDICAL_HISTORY: false, CURRENT_MEDICATIONS: true, MEDICATION_INSTRUCTIONS: false, POSTOP_PAIN: true })
  })

  it("reorders, renames, removes and adds rows of the order lists", () => {
    const update = preopSectionsUpdateFromForm(preopSectionsFixture(), "ADULT", "orders", {
      enabled_NONE: "true", order_NONE: "5",
      enabled_CUSTOM_ABC123: "true", order_CUSTOM_ABC123: "1", labelEn_CUSTOM_ABC123: "Shave and mark", labelBg_CUSTOM_ABC123: "Обръсване и маркиране",
      // STOP left unticked: switched off.
      newList: "MEDICATION_INSTRUCTION", newHoursMode: "REQUIRED", newLabelEn: "Halve the dose", newLabelBg: "Половин доза",
    }, REASON, () => "CUSTOM_NEW1")
    expect(update.orderOptions).toEqual([
      { key: "STOP", list: "MEDICATION_INSTRUCTION", enabled: false },
      { key: "CUSTOM_NEW1", list: "MEDICATION_INSTRUCTION", enabled: true, labelEn: "Halve the dose", labelBg: "Половин доза", hoursMode: "REQUIRED" },
      { key: "CUSTOM_ABC123", list: "WARD_ORDER", enabled: true, labelEn: "Shave and mark", labelBg: "Обръсване и маркиране" },
      { key: "NONE", list: "WARD_ORDER", enabled: true },
    ])
    const removed = preopSectionsUpdateFromForm(preopSectionsFixture(), "ADULT", "orders", { remove_CUSTOM_ABC123: "true", remove_NONE: "true" }, REASON)
    // A bundled row cannot be removed; it stays, switched off.
    expect(removed.orderOptions.map(row => row.key)).toEqual(["STOP", "NONE"])
  })

  it("refuses a new row with only one language", () => {
    expect(() => preopSectionsUpdateFromForm(preopSectionsFixture(), "ADULT", "orders", { newList: "WARD_ORDER", newLabelEn: "Only English" }, REASON))
      .toThrow(PreopSectionsFormError)
  })

  it("keeps the specialties ticked", () => {
    const update = preopSectionsUpdateFromForm(preopSectionsFixture(), "ADULT", "specialties", { spec_1002: "true" }, REASON)
    expect(update.consultSpecialtyKeys).toEqual(["1002"])
  })

  it("makes keys the API accepts for a hospital's own rows", () => {
    expect(newCustomOrderKey()).toMatch(/^CUSTOM_[A-Z0-9_]{1,60}$/)
  })
})

describe("the pages", () => {
  it("accepts the view the API sends", () => {
    expect(preopSectionsShape(preopSectionsFixture())).toBe(true)
    expect(preopSectionsShape({ ...preopSectionsFixture(), configs: { ADULT: { sections: { A: "yes" } } } })).toBe(false)
  })

  it("shows the preop switches without the postop ones, and children's sections for children only", () => {
    const html = renderPreopSectionsEditor(preopSectionsFixture(), "en")
    expect(html).toContain('name="section_MEDICAL_HISTORY"')
    expect(html).not.toContain("section_POSTOP_PAIN")
    expect(html).toContain('data-testid="section-PEDIATRIC_FASTING-PEDIATRIC"')
    expect(html).not.toContain('data-testid="section-PEDIATRIC_FASTING-ADULT"')
    expect(html).toContain("(needs Current medications)")
  })

  it("shows the postop switches, what is always on, the pain scales by age and what a case needs to finalise", () => {
    const html = renderPostopFormEditor(preopSectionsFixture(), "bg")
    expect(html).toContain('data-testid="section-POSTOP_DELIRIUM-PEDIATRIC"')
    expect(html).not.toContain('data-testid="section-POSTOP_DELIRIUM-ADULT"')
    expect(html).toContain("Скор при възстановяване (Aldrete / Steward)")
    expect(html).toContain('data-testid="postop-pain-rules"')
    expect(html).toContain("NIPS")
    expect(html).toContain('data-testid="finalise-requirements"')
    expect(html).toContain('name="part" value="postop"')
  })

  it("lets a bundled row be switched off but only a hospital's own be edited or removed", () => {
    const html = renderPreopOrderListsEditor(preopSectionsFixture(), "en")
    expect(html).toContain('name="enabled_NONE"')
    expect(html).not.toContain('name="labelEn_NONE"')
    expect(html).not.toContain('name="remove_NONE"')
    expect(html).toContain('name="labelEn_CUSTOM_ABC123"')
    expect(html).toContain('name="remove_CUSTOM_ABC123"')
    expect(html).toContain('name="spec_1001" value="true" checked')
  })
})

/**
 * Preop vitals required or optional, and medications typed as written
 * (1.11.0): on the preop sections form, per population, where the API offers
 * them.
 */
describe("the vitals and typed-medication switches (1.11.0)", () => {
  const withSwitches = () => {
    const sections = preopSectionsFixture()
    sections.vitalsSwitches = [
      { key: "required", labelEn: "Vital signs required", labelBg: "Жизнените показатели са задължителни" },
      { key: "bloodPressure", labelEn: "Blood pressure", labelBg: "Артериално налягане" },
      { key: "heartRate", labelEn: "Heart rate", labelBg: "Сърдечна честота" },
      { key: "respiratoryRate", labelEn: "Respiratory rate", labelBg: "Дихателна честота" },
    ]
    sections.medicationsFreeText = { labelEn: "Typed medications", labelBg: "Свободно въведени медикаменти" }
    sections.configs.PEDIATRIC = { ...sections.configs.PEDIATRIC!, vitals: { required: false, bloodPressure: true, heartRate: true, respiratoryRate: true }, medicationsFreeText: true }
    return sections
  }

  it("shows them on the preop form, as each population has them, and not on the postop one", () => {
    const html = renderPreopSectionsEditor(withSwitches(), "bg")
    expect(html).toMatch(/name="vitals_required" value="true" checked data-testid="vitals-required-ADULT"/)
    expect(html).toMatch(/name="vitals_required" value="true" {2}data-testid="vitals-required-PEDIATRIC"/)
    expect(html).toMatch(/name="medications_free_text" value="true" {2}data-testid="medications-free-text-box-ADULT"/)
    expect(html).toMatch(/name="medications_free_text" value="true" checked data-testid="medications-free-text-box-PEDIATRIC"/)
    expect(renderPostopFormEditor(withSwitches(), "bg")).not.toContain("vitals_required")
    expect(preopSectionsShape(withSwitches())).toBe(true)
  })

  it("sends what the form ticked, and nothing from a form that does not carry them", () => {
    const update = preopSectionsUpdateFromForm(withSwitches(), "PEDIATRIC", "sections", { vitals_required: "true", vitals_bloodPressure: "true" }, REASON)
    expect(update.vitals).toEqual({ required: true, bloodPressure: true, heartRate: false, respiratoryRate: false })
    expect(update.medicationsFreeText).toBe(false)
    const orders = preopSectionsUpdateFromForm(withSwitches(), "PEDIATRIC", "orders", {}, REASON)
    expect(orders.vitals).toBeUndefined()
    expect(orders.medicationsFreeText).toBeUndefined()
  })

  it("is left out where the API does not offer it", () => {
    expect(renderPreopSectionsEditor(preopSectionsFixture(), "en")).not.toContain("vitals_required")
    expect(preopSectionsUpdateFromForm(preopSectionsFixture(), "ADULT", "sections", {}, REASON).vitals).toBeUndefined()
  })
})
