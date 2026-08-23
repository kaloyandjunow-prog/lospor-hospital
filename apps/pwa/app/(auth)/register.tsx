import { useEffect, useState } from "react"
import {
  View, Text, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Linking,
} from "react-native"
import { Stack, useRouter } from "expo-router"
import { useForm, Controller } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Field, StyledInput, SectionHeader, PrimaryButton, SingleToggle, Chip } from "@/components/ui"
import { apiUrl, registerAccount } from "@/lib/api"
import { hospitalWebUrl } from "@/lib/hospital-links"
import { AuthBackdrop, AuthBrand } from "@/components/AuthBrand"
import { useAuthenticationCapabilities } from "@/lib/deployment-capabilities"
import { usePreferences } from "@/lib/preferences-context"
import {
  ACCOUNT_COUNTRIES,
  PROFESSIONAL_TITLES,
  passwordPolicyIssues,
  type PasswordPolicyIssue,
} from "@lospor/core/account"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Institution {
  id: string
  name: string
  city: string
}

const COUNTRIES = ACCOUNT_COUNTRIES

// ─── Schema ───────────────────────────────────────────────────────────────────

const PASSWORD_MESSAGES: Record<PasswordPolicyIssue, string> = {
  too_short: "At least 8 characters",
  missing_uppercase: "At least one uppercase letter",
  missing_number: "At least one number",
  missing_special: "At least one special character",
}

const passwordSchema = z.string().superRefine((password, context) => {
  for (const issue of passwordPolicyIssues(password)) {
    context.addIssue({ code: "custom", message: PASSWORD_MESSAGES[issue] })
  }
})

const schema = z.object({
  firstName:     z.string().min(1, "Required"),
  lastName:      z.string().min(1, "Required"),
  title:         z.string().optional(),
  email:         z.string().email("Invalid email"),
  country:       z.string().min(1, "Select a country"),
  institutionId: z.string().min(1, "Required"),
  password:      passwordSchema,
  confirmPassword: z.string().min(1, "Confirm your password"),
  acceptedTerms: z.boolean().refine(value => value === true, "You must accept the terms"),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
})

type FormValues = z.infer<typeof schema>

// ─── Title options ────────────────────────────────────────────────────────────

const TITLE_OPTIONS = PROFESSIONAL_TITLES.map(title => ({
  v: title.value,
  label: title.value,
}))

// ─── Password strength ────────────────────────────────────────────────────────

function getPasswordStrength(pw: string): { score: number; color: string; label: string } {
  const score = 4 - passwordPolicyIssues(pw).length
  if (pw.length === 0) return { score: 0, color: "#2e2e2e", label: "" }
  if (score < 2)       return { score, color: "#ef4444", label: "Weak" }
  if (score < 4)       return { score, color: "#f59e0b", label: "Fair" }
  return                      { score, color: "#22c55e", label: "Strong" }
}

function PasswordStrengthBar({ password }: { password: string }) {
  const { score, color, label } = getPasswordStrength(password)
  if (!password) return null
  const segments = [1, 2, 3, 4]
  return (
    <View className="mt-2">
      <View className="flex-row gap-1">
        {segments.map(seg => (
          <View
            key={seg}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: score >= seg ? color : "#2e2e2e",
            }}
          />
        ))}
      </View>
      {label ? (
        <Text style={{ color, fontSize: 11, marginTop: 4 }}>{label}</Text>
      ) : null}
    </View>
  )
}

// ─── Institution picker ───────────────────────────────────────────────────────

function CountryPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (country: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const filtered = COUNTRIES.filter(country =>
    !query || country.toLowerCase().includes(query.trim().toLowerCase())
  )

  function select(country: string) {
    onChange(country)
    setOpen(false)
    setQuery("")
  }

  return (
    <View>
      <TouchableOpacity
        onPress={() => setOpen(current => !current)}
        activeOpacity={0.75}
        style={{
          minHeight: 50,
          backgroundColor: "#1c1c1c",
          borderColor: open ? "#3b82f6" : "#2e2e2e",
          borderWidth: 1,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ color: value ? "#f8fafc" : "#64748b", fontSize: 16 }}>
          {value || "Select country"}
        </Text>
        <Text style={{ color: "#94a3b8", fontSize: 14 }}>{open ? "^" : "v"}</Text>
      </TouchableOpacity>

      {open && (
        <View
          style={{
            marginTop: 6,
            maxHeight: 260,
            backgroundColor: "#1c1c1c",
            borderColor: "#2e2e2e",
            borderWidth: 1,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <View style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: "#2e2e2e" }}>
            <StyledInput
              placeholder="Search countries..."
              value={query}
              onChangeText={setQuery}
              autoCapitalize="words"
              style={{ paddingVertical: 9 }}
            />
          </View>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {filtered.map(country => (
              <TouchableOpacity
                key={country}
                onPress={() => select(country)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderBottomWidth: country === filtered[filtered.length - 1] ? 0 : 1,
                  borderBottomColor: "#2e2e2e",
                  backgroundColor: country === value ? "#172554" : "transparent",
                }}
              >
                <Text style={{ color: country === value ? "#60a5fa" : "#e2e8f0", fontSize: 15 }}>
                  {country}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  )
}

function InstitutionPicker({
  country,
  value,
  onChange,
}: {
  country: string
  value: string | undefined
  onChange: (id: string | undefined) => void
}) {
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [query, setQuery] = useState("")
  const [selectedName, setSelectedName] = useState<string | null>(null)

  useEffect(() => {
    fetch(apiUrl("/api/institutions"))
      .then(r => r.json())
      .then((data: Institution[]) => setInstitutions(data))
      .catch(() => {})
  }, [])

  const otherInstitution = institutions.find(inst =>
    inst.name === "Other / Private" || inst.name === "Друго"
  )
  const availableInstitutions = country === "Bulgaria"
    ? institutions.filter(inst => inst.id !== otherInstitution?.id)
    : []
  const filtered = availableInstitutions.filter(inst =>
    !query ||
    inst.name.toLowerCase().includes(query.toLowerCase()) ||
    inst.city.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    if (!country) return
    if (country === "Bulgaria") {
      if (value === otherInstitution?.id) {
        onChange(undefined)
        setSelectedName(null)
      }
      return
    }
    if (otherInstitution && value !== otherInstitution.id) {
      onChange(otherInstitution.id)
      setSelectedName(otherInstitution.name)
    }
  }, [country, onChange, otherInstitution, value])

  function select(inst: Institution) {
    onChange(inst.id)
    setSelectedName(inst.name)
    setQuery("")
  }

  function deselect() {
    onChange(undefined)
    setSelectedName(null)
    setQuery("")
  }

  if (country !== "Bulgaria") {
    return (
      <View
        style={{
          minHeight: 50,
          justifyContent: "center",
          backgroundColor: "#1c1c1c",
          borderColor: "#2e2e2e",
          borderWidth: 1,
          borderRadius: 14,
          paddingHorizontal: 14,
        }}
      >
        <Text style={{ color: "#94a3b8", fontSize: 15 }}>
          {otherInstitution?.name ?? "Other / Private"}
        </Text>
      </View>
    )
  }

  return (
    <View>
      {selectedName ? (
        <View className="flex-row flex-wrap">
          <Chip label={selectedName} onRemove={deselect} />
        </View>
      ) : (
        <>
          <StyledInput
            placeholder="Search by name or city…"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <View className="mt-1 bg-[#1c1c1c] border border-[#2e2e2e] rounded-xl overflow-hidden max-h-48">
              {filtered.length === 0 ? (
                <View className="px-4 py-3">
                  <Text className="text-slate-500 text-sm">No results</Text>
                </View>
              ) : (
                filtered.slice(0, 8).map((inst, idx) => (
                  <TouchableOpacity
                    key={inst.id}
                    onPress={() => select(inst)}
                    className={`px-4 py-3 ${idx < filtered.slice(0, 8).length - 1 ? "border-b border-[#2e2e2e]" : ""}`}
                  >
                    <Text className="text-white text-sm">{inst.name}</Text>
                    <Text className="text-slate-500 text-xs mt-0.5">{inst.city}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </>
      )}
    </View>
  )
}

// ─── Success state ────────────────────────────────────────────────────────────

// `emailSent: false` means the account exists but no verification link was
// ever sent — the installation has no mail provider, or the provider refused.
// Telling somebody to check an inbox in that state leaves them waiting on a
// message that is never coming, with a sign-in they cannot complete.
function SuccessView({ emailSent }: { emailSent: boolean }) {
  const router = useRouter()
  return (
    <View className="flex-1 bg-[#111111] justify-center items-center px-8">
      <Text style={{ fontSize: 72, color: emailSent ? "#22c55e" : "#f59e0b", marginBottom: 16 }}>
        {emailSent ? "✓" : "!"}
      </Text>
      <Text className="text-white text-2xl font-bold text-center mb-3">Account created</Text>
      <Text className="text-slate-400 text-sm text-center mb-10 leading-relaxed">
        {emailSent
          ? "Check your email for a verification link. Once you verify your email, you can log in."
          : "The verification email could not be sent, so you cannot sign in yet. Contact your administrator — this installation cannot send email."}
      </Text>
      <TouchableOpacity
        className="bg-blue-600 rounded-xl py-3.5 px-8 items-center"
        onPress={() => router.replace("/(auth)/login")}
      >
        <Text className="text-white font-semibold text-base">Back to login</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RegisterScreen() {
  const router = useRouter()
  const authentication = useAuthenticationCapabilities()
  const { t } = usePreferences()
  if (!authentication.selfRegistration) {
    return <View className="flex-1 bg-[#111111] justify-center px-6">
      <AuthBackdrop />
      <View style={{ marginBottom: 30 }}><AuthBrand /></View>
      <Text accessibilityRole={authentication.status === "INVALID_CONTRACT" ? "alert" : undefined} className="text-slate-200 text-base text-center leading-6">
        {authentication.status === "INVALID_CONTRACT" ? t("authenticationUnavailable") : t("accountsCreatedByAdministrator")}
      </Text>
      <TouchableOpacity className="mt-7 items-center" onPress={() => router.replace("/(auth)/login")}>
        <Text className="text-blue-400 font-bold">{t("signIn")}</Text>
      </TouchableOpacity>
    </View>
  }
  return <PublicRegistrationScreen />
}

function PublicRegistrationScreen() {
  const router = useRouter()
  const { language } = usePreferences()
  const [success, setSuccess] = useState<null | { emailSent: boolean }>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName:     "",
      lastName:      "",
      title:         undefined,
      email:         "",
      country:       "",
      password:      "",
      confirmPassword: "",
      institutionId: "",
      acceptedTerms: false,
    },
  })

  const passwordValue = watch("password") ?? ""

  async function onSubmit(data: FormValues) {
    setServerError(null)
    try {
      const result = await registerAccount({
        firstName:     data.firstName,
        lastName:      data.lastName,
        title:         data.title,
        email:         data.email.trim().toLowerCase(),
        password:      data.password,
        institutionId: data.institutionId,
        acceptedTerms: data.acceptedTerms,
      })
      // The API reports whether the verification email actually went out.
      // Absent means an older server that never said; assume it did.
      setSuccess({ emailSent: result?.emailSent !== false })
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Network error. Please check your connection.")
    }
  }

  if (success) return <SuccessView emailSent={success.emailSent} />

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        className="flex-1 bg-[#111111]"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        <AuthBackdrop />
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ marginTop: 24, marginBottom: 30 }}>
            <AuthBrand />
            <Text className="text-slate-400 text-sm text-center mt-3">Create your clinical log account</Text>
          </View>

          {/* ── Personal details ── */}
          <SectionHeader title="Personal details" />

          <Controller
            control={control}
            name="firstName"
            render={({ field: { value, onChange, onBlur } }) => (
              <Field label="First name" required error={errors.firstName?.message}>
                <StyledInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="First name"
                  autoCapitalize="words"
                  autoComplete="given-name"
                />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="lastName"
            render={({ field: { value, onChange, onBlur } }) => (
              <Field label="Last name" required error={errors.lastName?.message}>
                <StyledInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Last name"
                  autoCapitalize="words"
                  autoComplete="family-name"
                />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="title"
            render={({ field: { value, onChange } }) => (
              <Field label="Professional title">
                <SingleToggle
                  options={TITLE_OPTIONS}
                  value={value}
                  onChange={onChange}
                />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="email"
            render={({ field: { value, onChange, onBlur } }) => (
              <Field label="Email" required error={errors.email?.message}>
                <StyledInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="you@hospital.org"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="country"
            render={({ field: { value, onChange } }) => (
              <Field label="Country" required error={errors.country?.message}>
                <CountryPicker
                  value={value}
                  onChange={country => {
                    onChange(country)
                    setValue("institutionId", "")
                  }}
                />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { value, onChange, onBlur } }) => (
              <Field label="Password" required error={errors.password?.message}>
                <StyledInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Min 8 chars, uppercase, number, symbol"
                  secureTextEntry
                  autoComplete="new-password"
                />
                <PasswordStrengthBar password={passwordValue} />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { value, onChange, onBlur } }) => (
              <Field label="Confirm password" required error={errors.confirmPassword?.message}>
                <StyledInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Repeat password"
                  secureTextEntry
                  autoComplete="new-password"
                />
              </Field>
            )}
          />

          {/* ── Institution ── */}
          <SectionHeader title={language === "bg" ? "Институция *" : "Institution *"} />

          {watch("country") ? (
            <Controller
              control={control}
              name="institutionId"
              render={({ field: { value, onChange } }) => (
                <Field label={language === "bg" ? "Институция" : "Institution"} required>
                  <InstitutionPicker
                    country={watch("country")}
                    value={value}
                    onChange={onChange}
                  />
                </Field>
              )}
            />
          ) : (
            <Text style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>
              {language === "bg" ? "Изберете държава, за да изберете институция." : "Select a country to choose an institution."}
            </Text>
          )}

          {/* ── Terms ── */}
          <SectionHeader title="Terms" />

          <Controller
            control={control}
            name="acceptedTerms"
            render={({ field: { value, onChange } }) => (
              <View className="mb-4">
                <View
                  style={{
                    backgroundColor: "#1c1c1c",
                    borderColor: "#2e2e2e",
                    borderWidth: 1,
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 12,
                  }}
                >
                  <Text style={{ color: "#cbd5e1", fontSize: 13, fontWeight: "700", marginBottom: 4 }}>
                    Clinical registry account
                  </Text>
                  <Text style={{ color: "#94a3b8", fontSize: 12, lineHeight: 17 }}>
                    LOSPOR stores clinical registry data under its Terms of Use and Privacy Policy.
                  </Text>
                </View>
                <TouchableOpacity
                  className="flex-row items-start"
                  onPress={() => onChange(!value)}
                  activeOpacity={0.7}
                >
                  <View
                    className="mt-0.5 mr-3 items-center justify-center"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      borderWidth: 2,
                      borderColor: value ? "#3b82f6" : "#4b5563",
                      backgroundColor: value ? "#3b82f6" : "transparent",
                    }}
                  >
                    {value && <Text style={{ color: "#fff", fontSize: 13, lineHeight: 16 }}>✓</Text>}
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-300 text-sm leading-relaxed">
                      {"I accept the "}
                      <Text
                        className="text-blue-400 underline"
                        onPress={() => Linking.openURL(hospitalWebUrl("/terms"))}
                      >
                        Terms of Use and Privacy Policy
                      </Text>
                    </Text>
                  </View>
                </TouchableOpacity>
                {errors.acceptedTerms && (
                  <Text className="text-red-400 text-xs mt-1 ml-8">
                    {errors.acceptedTerms.message as string}
                  </Text>
                )}
              </View>
            )}
          />

          {/* ── Server error ── */}
          {serverError && (
            <View className="mb-4 bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3">
              <Text className="text-red-300 text-sm">{serverError}</Text>
            </View>
          )}

          {/* ── Submit ── */}
          <PrimaryButton
            label="Create account"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
          />

          <TouchableOpacity
            className="mt-5 items-center"
            onPress={() => router.back()}
          >
            <Text className="text-slate-500 text-sm">
              Already have an account?{" "}
              <Text className="text-blue-400">Sign in</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  )
}
