import { useMemo, useState } from "react"
import { Pressable, ScrollView, Text, TextInput, View } from "react-native"
import { NHIS_SPECIALTY_BY_KEY, specialtyLabel } from "@lospor/core/nhis-specialties"
import {
  MEDICATION_HOLD_HOURS,
  holdHoursText,
  isInstructionMedicationCurrent,
  preopOrderOptionsFor,
  wardOrderIdentity,
  type PreopOrderOption,
  type PreopSectionConfig,
} from "@lospor/core/preop-orders"
import { displayClinicalCode } from "@/lib/clinical-display"
import { LAB_CATEGORIES, searchLabs } from "@/lib/labs"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import type { PreopFormInput } from "@/lib/preop-form-schema"
import { randomHex } from "@/lib/random-id"
import { formatMessage } from "@/i18n/locale"
import { colors, withAlpha, useThemeRefresh } from "@/theme/colors"

type WardOrder = NonNullable<PreopFormInput["preopWardOrders"]>[number]
type Instruction = NonNullable<PreopFormInput["preopMedicationInstructions"]>[number]
type Medication = { label: string; inn?: string; atcCode?: string }
type Language = "en" | "bg"
type Tc = (key: ClinicalStringKey) => string

/** A row's name in the form's language: the hospital's row, or the case's own copy when the row is gone. */
function rowLabel(option: Pick<PreopOrderOption, "labelEn" | "labelBg"> | undefined, held: Record<string, unknown> | undefined, language: Language): string {
  const source = option ?? held
  const label = language === "bg" ? source?.labelBg : source?.labelEn
  return typeof label === "string" ? label : ""
}

function TickRow({ label, checked, onPress, testID }: { label: string; checked: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingVertical: 8 }}
    >
      <View style={{ width: 24, height: 24, borderRadius: 8, borderCurve: "continuous", borderWidth: 2, borderColor: checked ? colors.primary : colors.borderStrong, backgroundColor: checked ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
        {checked ? <Text style={{ color: colors.background, fontSize: 14, fontWeight: "900", lineHeight: 16 }}>✓</Text> : null}
      </View>
      <Text style={{ flex: 1, color: checked ? colors.textPrimary : colors.textSecondary, fontSize: 14, lineHeight: 19, fontWeight: checked ? "800" : "600" }}>{label}</Text>
    </Pressable>
  )
}

function RemoveButton({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} testID={testID} onPress={onPress} hitSlop={10} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
      <Text style={{ color: colors.danger, fontSize: 16, fontWeight: "900" }}>✕</Text>
    </Pressable>
  )
}

function Pill({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      testID={testID}
      onPress={onPress}
      style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: selected ? withAlpha(colors.primary, "AA") : colors.border, backgroundColor: selected ? colors.primarySoft : colors.surfaceRaised }}
    >
      <Text style={{ color: selected ? colors.primary : colors.textSecondary, fontSize: 13, fontWeight: selected ? "900" : "700" }}>{label}</Text>
    </Pressable>
  )
}

/**
 * Preoperative ward orders: a tick per row, a specialty for each consultation
 * and a test for each investigation. "No additional orders" stands alone:
 * ticking it clears the rest, and ticking anything else clears it.
 */
export function PreopWardOrdersSection({ config, value, onChange, language, tc }: {
  config: PreopSectionConfig
  value: WardOrder[]
  onChange: (next: WardOrder[]) => void
  language: Language
  tc: Tc
}) {
  useThemeRefresh()
  const options = preopOrderOptionsFor(config, "WARD_ORDER")
  const byKey = new Map(config.orderOptions.map(option => [option.key, option]))
  const noneKeys = new Set(config.orderOptions.filter(option => option.kind === "NONE").map(option => option.key))
  // A row the hospital switched off after this case ordered it stays listed.
  const heldOff = value.filter(order => !options.some(option => option.key === order.optionKey))
  const ordered = (key: string) => value.filter(order => order.optionKey === key)

  function toggle(option: PreopOrderOption) {
    if (ordered(option.key).length > 0) return onChange(value.filter(order => order.optionKey !== option.key))
    if (option.kind === "NONE") return onChange([{ optionKey: option.key }])
    onChange([...value.filter(order => !noneKeys.has(order.optionKey)), { optionKey: option.key }])
  }

  function add(order: WardOrder) {
    if (value.some(item => wardOrderIdentity(item) === wardOrderIdentity(order))) return
    onChange([...value.filter(item => !noneKeys.has(item.optionKey)), order])
  }

  function remove(order: WardOrder) {
    onChange(value.filter(item => wardOrderIdentity(item) !== wardOrderIdentity(order)))
  }

  return (
    <View testID="preop-ward-orders">
      {options.map(option => {
        const label = rowLabel(option, undefined, language)
        if (option.kind === "CONSULT" || (option.kind === "LAB" && !option.labTest)) {
          return <ChoiceRow key={option.key} option={option} label={label} orders={ordered(option.key)} onAdd={add} onRemove={remove} specialtyKeys={config.consultSpecialtyKeys} language={language} tc={tc} />
        }
        return <TickRow key={option.key} label={label} checked={ordered(option.key).length > 0} onPress={() => toggle(option)} testID={`preop-order-${option.key}`} />
      })}
      {heldOff.length > 0 ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6, paddingTop: 8 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>{tc("ordersSwitchedOff")}</Text>
          {heldOff.map(order => (
            <View key={wardOrderIdentity(order)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40 }}>
              <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 14 }}>{heldOrderText(order, byKey.get(order.optionKey), language)}</Text>
              <RemoveButton label={tc("ordersRemove")} onPress={() => remove(order)} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

function heldOrderText(order: WardOrder, option: PreopOrderOption | undefined, language: Language): string {
  const label = rowLabel(option, order as Record<string, unknown>, language)
  const choice = order.specialtyKey ? specialtyLabel(order.specialtyKey, language) : order.labTest
  return choice ? `${label} ${choice}` : label
}

/** A consultation or an investigation: each specialty or test chosen is an order of its own. */
function ChoiceRow({ option, label, orders, onAdd, onRemove, specialtyKeys, language, tc }: {
  option: PreopOrderOption
  label: string
  orders: WardOrder[]
  onAdd: (order: WardOrder) => void
  onRemove: (order: WardOrder) => void
  specialtyKeys: string[]
  language: Language
  tc: Tc
}) {
  const consult = option.kind === "CONSULT"
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const shown = orders.length > 0 || open

  const choices = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(language)
    if (consult) {
      return specialtyKeys
        .filter(key => NHIS_SPECIALTY_BY_KEY.has(key) && !orders.some(order => order.specialtyKey === key))
        .map(key => ({ value: key, label: specialtyLabel(key, language) ?? key }))
        .filter(item => !q || item.label.toLocaleLowerCase(language).includes(q))
        .sort((a, b) => a.label.localeCompare(b.label, language))
    }
    const tests = q ? searchLabs(q).map(result => result.test) : LAB_CATEGORIES.flatMap(category => category.tests)
    return tests
      .filter(test => !orders.some(order => order.labTest === test.name))
      .map(test => ({ value: test.name, label: displayClinicalCode("labTest", test.name, language, { label: test.name }) }))
  }, [consult, language, orders, query, specialtyKeys])

  const chosen = (order: WardOrder) => consult
    ? (order.specialtyKey ? specialtyLabel(order.specialtyKey, language) ?? order.specialtyKey : "")
    : order.labTest ? displayClinicalCode("labTest", order.labTest, language, { label: order.labTest }) : ""

  function pick(choice: string) {
    onAdd(consult ? { optionKey: option.key, specialtyKey: choice } : { optionKey: option.key, labTest: choice })
    setQuery("")
    setOpen(false)
  }

  return (
    <View>
      <TickRow
        label={orders.length > 0 ? `${label}…` : label}
        checked={shown}
        testID={`preop-order-${option.key}`}
        onPress={() => {
          if (!shown) return setOpen(true)
          setOpen(false)
          orders.forEach(onRemove)
        }}
      />
      {shown ? (
        <View style={{ marginLeft: 36, gap: 6, marginBottom: 8 }}>
          {orders.map(order => (
            <View key={wardOrderIdentity(order)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingLeft: 10, minHeight: 40 }}>
              <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{chosen(order)}</Text>
              <RemoveButton label={`${tc("ordersRemove")} ${chosen(order)}`} onPress={() => onRemove(order)} />
            </View>
          ))}
          {open ? (
            <View>
              <TextInput
                value={query}
                onChangeText={setQuery}
                autoFocus
                testID={`preop-order-search-${option.key}`}
                placeholder={consult ? tc("ordersSearchSpecialty") : tc("ordersSearchTest")}
                placeholderTextColor={colors.textMuted}
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.textPrimary, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 }}
              />
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 260, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                {choices.map((item, index) => (
                  <Pressable
                    key={item.value}
                    accessibilityRole="button"
                    testID={`preop-order-pick-${option.key}-${item.value}`}
                    onPress={() => pick(item.value)}
                    style={{ paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: index < choices.length - 1 ? 1 : 0, borderBottomColor: colors.border }}
                  >
                    <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{item.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={{ alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.primary }}>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "900" }}>+ {consult ? tc("ordersAddSpecialty") : tc("ordersAddTest")}</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  )
}

/**
 * Medication instructions, grouped by row: "stop taking" with a drug from the
 * current medications and the hours before surgery, "don't stop taking" with
 * a drug, and any rows the hospital adds. A drug since taken off the
 * medication list is flagged, not dropped.
 */
export function PreopMedicationInstructionsSection({ config, value, onChange, medications, language, tc }: {
  config: PreopSectionConfig
  value: Instruction[]
  onChange: (next: Instruction[]) => void
  medications: Medication[]
  language: Language
  tc: Tc
}) {
  useThemeRefresh()
  const options = preopOrderOptionsFor(config, "MEDICATION_INSTRUCTION")
  const byKey = new Map(config.orderOptions.map(option => [option.key, option]))
  const groups = [
    ...options,
    // A row the hospital switched off after this case used it stays listed.
    ...[...new Set(value.map(row => row.optionKey))].filter(key => !options.some(option => option.key === key)).map(key => byKey.get(key)).filter((option): option is PreopOrderOption => !!option),
  ]
  const orphans = value.filter(row => !byKey.has(row.optionKey))

  const update = (id: string, patch: Partial<Instruction>) => onChange(value.map(row => row.id === id ? { ...row, ...patch } : row))
  const remove = (id: string) => onChange(value.filter(row => row.id !== id))
  const add = (option: PreopOrderOption) => onChange([...value, {
    id: randomHex(16),
    optionKey: option.key,
    medicationLabel: "",
    medicationInn: null,
    medicationAtc: null,
    hoursBefore: option.hoursMode === "REQUIRED" ? 24 : null,
  }])

  function pickMedication(id: string, medication: Medication) {
    update(id, { medicationLabel: medication.label, medicationInn: medication.inn ?? null, medicationAtc: medication.atcCode ?? null })
  }

  if (medications.length === 0 && value.length === 0) {
    return <Text testID="preop-medication-instructions" style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>{tc("ordersNoMedications")}</Text>
  }

  return (
    <View testID="preop-medication-instructions" style={{ gap: 16 }}>
      {groups.map(option => {
        const rows = value.filter(row => row.optionKey === option.key)
        const label = rowLabel(option, undefined, language)
        return (
          <View key={option.key} testID={`preop-instruction-${option.key}`} style={{ gap: 8 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "900" }}>{label}</Text>
            {rows.map(row => {
              const listed = medications.some(item => item.label === row.medicationLabel)
              const removed = row.medicationLabel !== "" && !isInstructionMedicationCurrent({ medicationLabel: row.medicationLabel, medicationInn: row.medicationInn ?? null }, medications)
              return (
                <View key={row.id} testID={`preop-instruction-row-${row.id}`} style={{ gap: 8, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: removed ? colors.warning : colors.border, padding: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                    <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {!listed && row.medicationLabel ? <Pill label={row.medicationLabel} selected onPress={() => {}} /> : null}
                      {medications.map(item => (
                        <Pill key={item.label} label={item.label} selected={item.label === row.medicationLabel} onPress={() => pickMedication(row.id, item)} testID={`preop-instruction-drug-${row.id}-${item.label}`} />
                      ))}
                    </View>
                    <RemoveButton label={tc("ordersRemove")} onPress={() => remove(row.id)} testID={`preop-instruction-remove-${row.id}`} />
                  </View>
                  {!row.medicationLabel ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{tc("ordersPickMedication")}</Text> : null}
                  {option.hoursMode !== "NONE" ? (
                    <View style={{ gap: 4 }}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>
                        {option.hoursMode === "OPTIONAL" ? <Pill label="—" selected={row.hoursBefore == null} onPress={() => update(row.id, { hoursBefore: null })} /> : null}
                        {MEDICATION_HOLD_HOURS.map(hours => (
                          <Pill key={hours} label={holdHoursText(hours, language)} selected={row.hoursBefore === hours} onPress={() => update(row.id, { hoursBefore: hours })} testID={`preop-instruction-hours-${row.id}-${hours}`} />
                        ))}
                      </ScrollView>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{tc("ordersBeforeSurgery")}</Text>
                    </View>
                  ) : null}
                  {removed ? (
                    <Text accessibilityRole="alert" testID="instruction-medication-removed" style={{ color: colors.warning, fontSize: 12, fontWeight: "800" }}>
                      ⚠ {formatMessage(tc("ordersMedicationRemoved"), { medication: row.medicationLabel })}
                    </Text>
                  ) : null}
                </View>
              )
            })}
            {options.includes(option) ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`${tc("ordersAdd")}: ${label}`} testID={`preop-instruction-add-${option.key}`} onPress={() => add(option)} style={{ alignSelf: "flex-start", minHeight: 40, justifyContent: "center", paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.primary }}>
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "900" }}>+ {tc("ordersAdd")}</Text>
              </Pressable>
            ) : null}
          </View>
        )
      })}
      {orphans.map(row => (
        <Text key={row.id} style={{ color: colors.textSecondary, fontSize: 14 }}>{rowLabel(undefined, row as Record<string, unknown>, language)} {row.medicationLabel}</Text>
      ))}
    </View>
  )
}
