import "server-only"
import { emitStatusEvent } from "@/lib/hospital/status-events"

type EmailRecipient = { email: string; name?: string | null }

type SendEmailInput = {
  category?: "verification" | "password-reset" | "transactional"
  to: EmailRecipient
  subject: string
  html: string
  text: string
}

export type SendEmailResult =
  | { sent: true; provider: "brevo"; messageId?: string }
  | { sent: false; provider: "none"; reason: string }

function appBaseUrl(): string {
  return process.env.LOSPOR_WEB_URL
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.NEXTAUTH_URL
    ?? "http://localhost:3000"
}

export function appUrl(path: string): string {
  return new URL(path, appBaseUrl()).toString()
}

function sender() {
  return {
    email: process.env.AUTH_EMAIL_FROM ?? "no-reply@lospor.org",
    name: process.env.AUTH_EMAIL_FROM_NAME ?? "LOSPOR",
  }
}

export async function sendTransactionalEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    console.warn("[email] EMAIL_PROVIDER_NOT_CONFIGURED")
    void emitStatusEvent("EMAIL_DELIVERY_FAILED", {
      category: input.category ?? "transactional",
      failureKind: "configuration",
    })
    return { sent: false, provider: "none", reason: "BREVO_API_KEY missing" }
  }

  let response: Response
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: sender(),
        to: [{ email: input.to.email, name: input.to.name ?? undefined }],
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
      }),
    })
  } catch {
    void emitStatusEvent("EMAIL_DELIVERY_FAILED", {
      category: input.category ?? "transactional",
      failureKind: "network",
    })
    throw new Error("EMAIL_PROVIDER_NETWORK_FAILED")
  }

  if (!response.ok) {
    // Provider bodies can echo recipient or request data. Never ingest or log it.
    void emitStatusEvent("EMAIL_DELIVERY_FAILED", {
      category: input.category ?? "transactional",
      failureKind: "provider",
      httpStatus: response.status,
    })
    throw new Error(`BREVO_EMAIL_FAILED_${response.status}`)
  }

  const body = await response.json().catch(() => ({})) as { messageId?: string }
  return { sent: true, provider: "brevo", messageId: body.messageId }
}

export async function sendVerificationEmail(to: EmailRecipient, verifyUrl: string): Promise<SendEmailResult> {
  return sendTransactionalEmail({
    category: "verification",
    to,
    subject: "Verify your LOSPOR email",
    text: `Open this link to verify your LOSPOR account email:\n\n${verifyUrl}\n\nThis link expires in 24 hours.`,
    html: `
      <p>Hello,</p>
      <p>Open this link to verify your LOSPOR account email:</p>
      <p><a href="${verifyUrl}">Verify email</a></p>
      <p>This link expires in 24 hours.</p>
    `,
  })
}

export async function sendPasswordResetEmail(to: EmailRecipient, resetUrl: string): Promise<SendEmailResult> {
  return sendTransactionalEmail({
    category: "password-reset",
    to,
    subject: "Reset your LOSPOR password",
    text: `Open this link to reset your LOSPOR password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`,
    html: `
      <p>Hello,</p>
      <p>Open this link to reset your LOSPOR password:</p>
      <p><a href="${resetUrl}">Reset password</a></p>
      <p>This link expires in 1 hour. If you did not request this, ignore this email.</p>
    `,
  })
}
