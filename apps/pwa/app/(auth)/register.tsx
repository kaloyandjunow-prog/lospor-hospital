import { useMemo, useState } from "react"
import {
  View, Text, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform,
} from "react-native"
import { Stack, useRouter } from "expo-router"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Field, StyledInput, SectionHeader, PrimaryButton, SingleToggle } from "@/components/ui"
import { RegistrationConsent } from "@/components/auth/RegistrationConsent"
import { RegistrationUnavailableScreen } from "@/components/auth/RegistrationUnavailable"
import { ApiError, registerAccount } from "@/lib/api"
import { AuthBackdrop, AuthBrand } from "@/components/AuthBrand"
import { PROFESSIONAL_TITLE_LABELS } from "@/i18n/account-options"
import { CountryPicker, InstitutionPicker } from "@/components/auth/RegistrationPickers"
import { PasswordStrengthBar, SuccessView } from "@/components/auth/RegistrationFeedback"
import { usePreferences } from "@/lib/preferences-context"
import {
  createRegistrationSchema,
  type RegistrationFormValues,
} from "@/lib/registration-schema"
import { useRegistrationLegalDocuments } from "@/lib/legal-documents"
import { PROFESSIONAL_TITLES } from "@lospor/core/account"
import { useAuthenticationCapabilities } from "@/lib/deployment-capabilities"

export { getPasswordStrength } from "@/components/auth/RegistrationFeedback"

// ─── Schema ───────────────────────────────────────────────────────────────────

type FormValues = RegistrationFormValues

// ─── Title options ────────────────────────────────────────────────────────────

// ─── Main screen ──────────────────────────────────────────────────────────────

function RegistrationFormScreen() {
  const router = useRouter()
  const { language, t } = usePreferences()
  const schema = useMemo(() => createRegistrationSchema(t), [t])
  const legalDocuments = useRegistrationLegalDocuments(language)
  const titleOptions = useMemo(() => PROFESSIONAL_TITLES.map(title => ({
    v: title.value,
    label: PROFESSIONAL_TITLE_LABELS[language][title.value],
  })), [language])
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
    if (!legalDocuments.acceptances) {
      setServerError(t("legalDocumentsUnavailable"))
      return
    }
    try {
      const result = await registerAccount({
        firstName:     data.firstName,
        lastName:      data.lastName,
        title:         data.title,
        email:         data.email.trim().toLowerCase(),
        password:      data.password,
        institutionId: data.institutionId,
        locale:         language,
        legalAcceptances: legalDocuments.acceptances,
      })
      // The API reports whether the verification email actually went out.
      // Absent means an older server that never said; assume it did.
      setSuccess({ emailSent: result?.emailSent !== false })
    } catch (error) {
      setServerError(
        error instanceof ApiError && error.code === "NETWORK"
          ? t("networkCheckConnection")
          : t("registrationFailedTryAgain"),
      )
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
            <Text className="text-slate-400 text-sm text-center mt-3">{t("createClinicalAccount")}</Text>
          </View>

          {/* ── Personal details ── */}
          <SectionHeader title={t("personalDetails")} />

          <Controller
            control={control}
            name="firstName"
            render={({ field: { value, onChange, onBlur } }) => (
              <Field label={t("firstName")} required error={errors.firstName?.message}>
                <StyledInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder={t("firstName")}
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
              <Field label={t("lastName")} required error={errors.lastName?.message}>
                <StyledInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder={t("lastName")}
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
              <Field label={t("professionalTitle")}>
                <SingleToggle
                  options={titleOptions}
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
              <Field label={t("email")} required error={errors.email?.message}>
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
              <Field label={t("country")} required error={errors.country?.message}>
                <CountryPicker
                  value={value}
                  language={language}
                  t={t}
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
              <Field label={t("password")} required error={errors.password?.message}>
                <StyledInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder={t("minPasswordHint")}
                  secureTextEntry
                  autoComplete="new-password"
                />
                <PasswordStrengthBar password={passwordValue} t={t} />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { value, onChange, onBlur } }) => (
              <Field label={t("confirmPassword")} required error={errors.confirmPassword?.message}>
                <StyledInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder={t("repeatPassword")}
                  secureTextEntry
                  autoComplete="new-password"
                />
              </Field>
            )}
          />

          {/* ── Institution ── */}
          <SectionHeader title={`${t("institution")} *`} />

          {watch("country") ? (
            <Controller
              control={control}
              name="institutionId"
              render={({ field: { value, onChange } }) => (
                <Field label={t("institution")} required error={errors.institutionId?.message}>
                  <InstitutionPicker
                    country={watch("country")}
                    value={value}
                    onChange={onChange}
                    t={t}
                  />
                </Field>
              )}
            />
          ) : (
            <Text style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>
              {t("selectCountryForInstitution")}
            </Text>
          )}

          {/* ── Terms ── */}
          <SectionHeader title={t("termsSection")} />

          {legalDocuments.loading ? (
            <Text style={{ color: "#94a3b8", fontSize: 13, marginBottom: 12 }}>
              {t("legalDocumentsLoading")}
            </Text>
          ) : legalDocuments.failed ? (
            <Text accessibilityRole="alert" style={{ color: "#fca5a5", fontSize: 13, marginBottom: 12 }}>
              {t("legalDocumentsUnavailable")}
            </Text>
          ) : null}

          <Controller
            control={control}
            name="acceptedTerms"
            render={({ field: { value, onChange } }) => (
              <RegistrationConsent
                value={Boolean(value)}
                onChange={onChange}
                canAccept={Boolean(legalDocuments.acceptances)}
                error={errors.acceptedTerms?.message as string | undefined}
                language={language}
                t={t}
              />
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
            label={t("createAccount")}
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            disabled={!legalDocuments.acceptances}
          />

          <TouchableOpacity
            className="mt-5 items-center"
            onPress={() => router.replace("/login")}
          >
            <Text className="text-slate-500 text-sm">
              {t("alreadyHaveAccount")}{" "}
              <Text className="text-blue-400">{t("signIn")}</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  )
}

export default function RegisterScreen() {
  const authentication = useAuthenticationCapabilities()
  const { t } = usePreferences()

  if (authentication.status === "INVALID_CONTRACT") {
    return <RegistrationUnavailableScreen instructions={t("authConfigurationUnavailable")} />
  }
  if (!authentication.selfRegistration) {
    return <RegistrationUnavailableScreen instructions={t("registrationAdministratorOnly")} />
  }
  return <RegistrationFormScreen />
}
