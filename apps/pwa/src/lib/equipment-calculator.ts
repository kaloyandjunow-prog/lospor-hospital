import {
  calcEquipment as calcCoreEquipment,
  type EquipmentInput,
  type EquipmentCategory,
  type EquipmentItem,
} from "@lospor/core/equipment"

export type EquipItem = EquipmentItem
export type EquipCat = EquipmentCategory
export type EquipInput = EquipmentInput

export function calcEquipment(input: EquipmentInput): EquipCat[] {
  return calcCoreEquipment(input)
}

