export function isHospitalDeployment(): boolean {
  return process.env.LOSPOR_DEPLOYMENT_MODE === "hospital"
}

export function requireHospitalDeployment(): void {
  if (!isHospitalDeployment()) {
    throw new Error("Hospital-only feature is disabled")
  }
}
