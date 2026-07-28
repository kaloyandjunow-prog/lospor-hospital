import { calcEquipment as calcCoreEquipment, type EquipmentCategory, type EquipmentItem } from "@lospor/core/equipment"
import type { AirwayFindings } from "@lospor/core/risk"

export type EquipItem = EquipmentItem
export type EquipCat = EquipmentCategory

export function calcEquipment(
  age?: number,
  weight?: number,
  height?: number,
  sex?: string,
  airway?: AirwayFindings,
): EquipCat[] {
  return calcCoreEquipment({ ageYears: age, weightKg: weight, heightCm: height, sex, airway })
}

