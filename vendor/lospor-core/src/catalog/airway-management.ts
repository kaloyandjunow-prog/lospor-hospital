// AIRWAY_MANAGEMENT — devices (IntraopForm.tsx inline DEVICES array) and
// instruments (separate multi-select) are seeded into this one category,
// distinguished by `group: "Device"` vs `group: "Instrument"`.
export const AIRWAY_DEVICES: [string, string, string][] = [
  ["FACE_MASK", "Face Mask", "Лицева маска"], ["OPA", "Oral airway", "Орофарингеален въздуховод"], ["NPA", "Nasal airway", "Назофарингеален въздуховод"],
  ["LMA", "LMA", "Ларингеална маска (LMA)"], ["ORAL_ETT", "Oral ETT", "Оротрахеална ЕТТ"], ["NASAL_ETT", "Nasal ETT", "Назотрахеална ЕТТ"],
  ["DOUBLE_LUMEN_TUBE", "Double Lumen Tube", "Двулуменна тръба"], ["ENDOBRONCHIAL_TUBE", "Endobronchial Tube", "Ендобронхиална тръба"],
  ["SURGICAL_AIRWAY", "Surgical Airway", "Хирургичен дихателен път"],
]

export const AIRWAY_TOOLS: [string, string, string][] = [
  ["VIDEO_LARY", "Video laryngoscopy", "Видеоларингоскопия"], ["DIRECT_LARY", "Direct laryngoscopy", "Директна ларингоскопия"],
  ["FOB", "Fibreoptic bronchoscopy", "Фиброоптична бронхоскопия"], ["BOUGIE", "Bougie", "Bougie"], ["STYLET", "Intubation stylet", "Интубационен стилет"],
  ["AWAKE", "Awake intubation", "Будна интубация"], ["RETROGRADE", "Retrograde intubation", "Ретроградна интубация"],
  ["SUPRAGLOTTIC", "Supraglottic as conduit", "Супраглотично устройство като водач"],
]
