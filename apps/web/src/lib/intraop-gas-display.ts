import {
  describeIntraopEvent,
  formatGasMixLabel,
  formatGasSettingsLabel,
  type GasDisplaySettings,
  type SemanticLogEvent,
} from "@lospor/core/intraop-summary"

export {
  formatGasMixLabel,
  formatGasSettingsLabel,
  type GasDisplaySettings,
}

export function gasEventDisplay(
  event: SemanticLogEvent,
): { text: string; color: string; sub: string } | null {
  if (!["gas_start", "gas_change", "gas_stop"].includes(event.type ?? "")) {
    return null
  }
  const descriptor = describeIntraopEvent(event)
  return {
    text: descriptor.text,
    color: descriptor.color,
    sub: descriptor.sub ?? "Gas settings",
  }
}
