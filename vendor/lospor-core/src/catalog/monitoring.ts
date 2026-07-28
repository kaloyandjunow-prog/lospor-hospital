// MONITORING — groups use mobile's lowercase keys
// (standard/respiratory/haemodynamic/depth/other) as the canonical shared
// scheme, finer than web's old 4-group split which lumped
// capnography/temperature into "Standard" and only separated them via a
// display-label hack. Both web and mobile now read these same groups.
export const MONITORING = [
  { field: "ecg", label: "ECG", labelBg: "ЕКГ", cat: "standard" },
  { field: "spO2Monitor", label: "SpO₂", labelBg: "SpO₂", cat: "standard" },
  { field: "nbpMonitor", label: "Non-invasive blood pressure (NIBP)", labelBg: "Неинвазивно артериално налягане (NIBP)", cat: "standard" },
  { field: "etco2Monitor", label: "Capnography (EtCO₂)", labelBg: "Капнография (EtCO₂)", cat: "respiratory" },
  { field: "tempMonitor", label: "Temperature", labelBg: "Температура", cat: "respiratory" },
  { field: "invasiveBP", label: "Invasive arterial pressure (IBP)", labelBg: "Инвазивно артериално налягане (IBP)", cat: "haemodynamic" },
  { field: "cvpMonitor", label: "Central venous pressure (CVP)", labelBg: "Централно венозно налягане (ЦВН / CVP)", cat: "haemodynamic" },
  { field: "paCatheter", label: "Pulmonary artery catheter", labelBg: "Катетър в белодробната артерия", cat: "haemodynamic" },
  { field: "tee", label: "Transesophageal echocardiography (TEE)", labelBg: "Трансезофагеална ехокардиография (ТЕЕ)", cat: "haemodynamic" },
  { field: "bis", label: "Bispectral index (BIS)", labelBg: "Биспектрален индекс (BIS)", cat: "depth" },
  { field: "entropyMonitor", label: "Entropy (pEEG)", labelBg: "Ентропия (pEEG)", cat: "depth" },
  { field: "nirsMonitor", label: "Cerebral oximetry (NIRS / rSO₂)", labelBg: "Мозъчна оксиметрия (NIRS / rSO₂)", cat: "depth" },
  { field: "evokedPotentials", label: "Somatosensory / motor evoked potentials (SSEP / MEP)", labelBg: "Соматосензорни / моторни евокирани потенциали (SSEP / MEP)", cat: "depth" },
  { field: "tofMonitor", label: "Neuromuscular monitoring (TOF / NMT)", labelBg: "Невромускулен мониторинг (TOF / NMT)", cat: "depth" },
  { field: "bglMonitor", label: "Blood glucose", labelBg: "Серумна глюкоза", cat: "other" },
  { field: "bloodGasMonitor", label: "Blood gas analysis (ABG)", labelBg: "Кръвно-газов анализ (КГА)", cat: "other" },
  { field: "urinaryCatheter", label: "Urine output", labelBg: "Диуреза", cat: "other" },
  { field: "stomachTube", label: "Nasogastric tube (NGT)", labelBg: "Назогастрална сонда (НГС)", cat: "other" },
]
