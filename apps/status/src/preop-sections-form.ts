import { randomBytes } from "node:crypto"
import {
  PREOP_HOURS_MODES,
  PREOP_ORDER_LISTS,
  type PreopHoursMode,
  type PreopOrderList,
  type PreopPopulation,
  type PreopSectionConfigView,
  type PreopSectionsUpdate,
  type PreopSectionsView,
} from "./control-plane.js"

/**
 * The four Status forms that change a population's preoperative and
 * postoperative configuration (1.7.0): the preop sections, the postop
 * sections, the two order lists, and the consultation specialties.
 *
 * The API takes a population's whole configuration at once, so each form is
 * read on top of the configuration in use: what the form does not show is
 * sent back as it is.
 */
export const PREOP_SECTIONS_PARTS = ["sections", "postop", "orders", "specialties"] as const
export type PreopSectionsPart = typeof PREOP_SECTIONS_PARTS[number]

export function isPreopSectionsPart(value: unknown): value is PreopSectionsPart {
  return typeof value === "string" && (PREOP_SECTIONS_PARTS as readonly string[]).includes(value)
}

export class PreopSectionsFormError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

const MAX_LABEL = 200
const MAX_ORDER = 10_000

function fieldText(body: Record<string, unknown>, name: string): string {
  const value = body[name]
  return typeof value === "string" ? value.trim() : ""
}

function ticked(body: Record<string, unknown>, name: string): boolean {
  return body[name] === "true"
}

/** A fresh key for a hospital's own row, as the API's CUSTOM_ rule wants it. */
export function newCustomOrderKey(random: () => string = () => randomBytes(6).toString("hex")): string {
  return `CUSTOM_${random().replace(/[^A-Za-z0-9]/g, "").slice(0, 24).toUpperCase()}`
}

/** The form's sections: those of the population that belong to the form. */
export function formSectionKeys(sections: PreopSectionsView, population: PreopPopulation, form: "PREOP" | "POSTOP"): string[] {
  return sections.definitions
    .filter(definition => (definition.form ?? "PREOP") === form && definition.populations.includes(population))
    .map(definition => definition.key)
}

function orderRows(current: PreopSectionConfigView, body: Record<string, unknown>, newKey: () => string): PreopSectionsUpdate["orderOptions"] {
  const rows: Array<PreopSectionsUpdate["orderOptions"][number] & { position: number }> = []
  for (const [index, option] of current.orderOptions.entries()) {
    // A hospital's own row can be removed; a bundled row only switched off.
    if (!option.bundled && ticked(body, `remove_${option.key}`)) continue
    const orderText = fieldText(body, `order_${option.key}`)
    const order = orderText === "" ? option.sortOrder : Number(orderText)
    if (!Number.isSafeInteger(order) || order < 0 || order > MAX_ORDER) throw new PreopSectionsFormError("INVALID_CONTROL_REQUEST")
    const row: PreopSectionsUpdate["orderOptions"][number] & { position: number } = {
      key: option.key,
      list: option.list,
      enabled: ticked(body, `enabled_${option.key}`),
      position: order * 1000 + index,
    }
    if (!option.bundled) {
      const labelEn = fieldText(body, `labelEn_${option.key}`) || option.labelEn
      const labelBg = fieldText(body, `labelBg_${option.key}`) || option.labelBg
      if (labelEn.length > MAX_LABEL || labelBg.length > MAX_LABEL) throw new PreopSectionsFormError("ORDER_OPTION_LABELS_REQUIRED")
      Object.assign(row, { labelEn, labelBg })
      if (option.list === "MEDICATION_INSTRUCTION") row.hoursMode = option.hoursMode
    }
    rows.push(row)
  }
  // A new row: both labels, as the API asks; it goes last in its list.
  const labelEn = fieldText(body, "newLabelEn")
  const labelBg = fieldText(body, "newLabelBg")
  if (labelEn || labelBg) {
    if (!labelEn || !labelBg || labelEn.length > MAX_LABEL || labelBg.length > MAX_LABEL) throw new PreopSectionsFormError("ORDER_OPTION_LABELS_REQUIRED")
    const list = body.newList as PreopOrderList
    if (!(PREOP_ORDER_LISTS as readonly unknown[]).includes(list)) throw new PreopSectionsFormError("INVALID_CONTROL_REQUEST")
    const hoursMode = (PREOP_HOURS_MODES as readonly unknown[]).includes(body.newHoursMode) ? body.newHoursMode as PreopHoursMode : "OPTIONAL"
    rows.push({
      key: newKey(),
      list,
      enabled: true,
      labelEn,
      labelBg,
      ...(list === "MEDICATION_INSTRUCTION" ? { hoursMode } : {}),
      position: Number.MAX_SAFE_INTEGER,
    })
  }
  return rows
    .sort((left, right) => left.list.localeCompare(right.list) || left.position - right.position)
    .map(({ position: _position, ...row }) => row)
}

/**
 * One population's configuration with one form's changes in it. Throws
 * PreopSectionsFormError for a form the configuration cannot take.
 */
export function preopSectionsUpdateFromForm(
  sections: PreopSectionsView,
  population: PreopPopulation,
  part: PreopSectionsPart,
  body: Record<string, unknown>,
  reason: string,
  newKey: () => string = newCustomOrderKey,
): PreopSectionsUpdate {
  const current = sections.configs[population]
  if (!current) throw new PreopSectionsFormError("INVALID_CONTROL_REQUEST")
  const next: PreopSectionsUpdate = {
    population,
    sections: { ...current.sections },
    orderOptions: current.orderOptions.map(option => ({
      key: option.key,
      list: option.list,
      enabled: option.enabled,
      ...(option.bundled ? {} : { labelEn: option.labelEn, labelBg: option.labelBg }),
      ...(!option.bundled && option.list === "MEDICATION_INSTRUCTION" ? { hoursMode: option.hoursMode } : {}),
    })),
    consultSpecialtyKeys: [...current.consultSpecialtyKeys],
    reason,
  }
  if (part === "sections" || part === "postop") {
    for (const key of formSectionKeys(sections, population, part === "postop" ? "POSTOP" : "PREOP")) {
      next.sections[key] = ticked(body, `section_${key}`)
    }
  } else if (part === "orders") {
    next.orderOptions = orderRows(current, body, newKey)
  } else {
    next.consultSpecialtyKeys = sections.specialties.filter(item => ticked(body, `spec_${item.key}`)).map(item => item.key)
  }
  return next
}
