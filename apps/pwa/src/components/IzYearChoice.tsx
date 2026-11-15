import { useEffect, useRef, useState } from "react"
import { Text, TouchableOpacity, View } from "react-native"
import { apiFetch } from "@/lib/api"
import { departmentYear, izYearChoiceOpen, izYearHint, readIzYearChoice, type IzYearChoice as Choice } from "@/lib/iz-year"
import { colors, useShade, withAlpha } from "@/theme/colors"

/**
 * Which year the ИЗ № belongs to, asked only in the first 60 days of a year
 * (hospital 1.9.2). Pre-set from the API's suggestion; once the clinician
 * picks, a later answer for the same number never moves it. Offline it stays
 * on this year, which is what the server assumes when nothing is sent.
 */
export function IzYearChoice({
  number,
  value,
  onChange,
  language,
  anyTime = false,
}: {
  number: string | null | undefined
  value: number | undefined
  onChange: (year: number | undefined) => void
  language: string
  /** A correction may name last year at any time: a January case is corrected in March. */
  anyTime?: boolean
}) {
  const shade = useShade()
  const locale = language === "bg" ? "bg" : "en"
  const windowOpen = izYearChoiceOpen()
  const open = windowOpen || anyTime
  const thisYear = departmentYear()
  const [answer, setAnswer] = useState<{ number: string; choice: Choice } | null>(null)
  const picked = useRef(false)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })
  const typed = number?.trim() ?? ""
  const choice = answer?.number === typed ? answer.choice : null

  useEffect(() => {
    picked.current = false
    if (!open || !typed) {
      onChangeRef.current(undefined)
      return
    }
    onChangeRef.current(thisYear)
    if (!windowOpen) return
    let live = true
    const timer = setTimeout(() => {
      apiFetch(`/api/hospital/iz-year?number=${encodeURIComponent(typed)}`, { timeoutMs: 8_000 })
        .then(response => response.ok ? response.json() : null)
        .then(body => {
          const next = readIzYearChoice(body)
          if (!live || !next) return
          setAnswer({ number: typed, choice: next })
          // The server keeps the calendar: a closed answer means this year, whatever this device thinks.
          if (!next.open && !anyTime) onChangeRef.current(undefined)
          else if (!picked.current) onChangeRef.current(next.suggestedYear)
        })
        .catch(() => {})
    }, 400)
    return () => { live = false; clearTimeout(timer) }
  }, [open, windowOpen, anyTime, typed, thisYear])

  if (!open || !typed || (!anyTime && choice?.open === false)) return null
  const years = choice?.open && choice.years.length ? choice.years : [thisYear, thisYear - 1]
  const selected = value ?? thisYear
  const label = locale === "bg" ? "Година на ИЗ №" : "Record number year"

  return (
    <View testID="iz-year-choice" style={{ marginTop: 10 }}>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }}>{label}</Text>
        {years.map(year => {
          const on = selected === year
          return (
            <TouchableOpacity
              key={year}
              testID={`iz-year-${year}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => { picked.current = true; onChange(year) }}
              style={{
                minHeight: 40, minWidth: 72, alignItems: "center", justifyContent: "center",
                borderRadius: 10, borderWidth: 1, paddingHorizontal: 14,
                borderColor: on ? colors.primary : colors.border,
                backgroundColor: on ? colors.primary : withAlpha(colors.primary, "08"),
              }}
            >
              <Text style={{ color: on ? shade("#fff") : colors.textPrimary, fontSize: 15, fontWeight: "900" }}>{year}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 6 }}>{izYearHint(choice, locale)}</Text>
    </View>
  )
}
