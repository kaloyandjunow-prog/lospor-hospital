export type AuthenticationDeploymentMode = "PUBLIC" | "HOSPITAL" | "UNAVAILABLE"

export type AuthenticationCapabilities = {
  loginIdentifier: "EMAIL" | "USERNAME"
  selfRegistration: boolean
  passwordRecovery: "EMAIL" | "ADMINISTRATOR" | "UNAVAILABLE"
  passwordChange: true
  sessionInventory: true
}

/** Select login identity from an explicit, complete deployment configuration. */
export function authenticationDeploymentMode(): AuthenticationDeploymentMode {
  const configured = process.env.LOSPOR_DEPLOYMENT_MODE?.trim().toLowerCase()
  if (!configured || configured === "public" || configured === "serverless") return "PUBLIC"
  if (
    configured === "hospital"
    && process.env.LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED === "true"
  ) return "HOSPITAL"
  return "UNAVAILABLE"
}

export function authenticationCapabilities(): AuthenticationCapabilities {
  const mode = authenticationDeploymentMode()
  if (mode === "PUBLIC") {
    return {
      loginIdentifier: "EMAIL",
      selfRegistration: process.env.LOSPOR_SELF_REGISTRATION_ENABLED !== "false",
      passwordRecovery: "EMAIL",
      passwordChange: true,
      sessionInventory: true,
    }
  }
  if (mode === "HOSPITAL") {
    return {
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
      passwordChange: true,
      sessionInventory: true,
    }
  }
  return {
    loginIdentifier: process.env.LOSPOR_DEPLOYMENT_MODE?.trim().toLowerCase() === "hospital"
      ? "USERNAME"
      : "EMAIL",
    selfRegistration: false,
    passwordRecovery: "UNAVAILABLE",
    passwordChange: true,
    sessionInventory: true,
  }
}
