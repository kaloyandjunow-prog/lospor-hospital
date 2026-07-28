// TECHNIQUE — anaesthesia technique tree (TechniqueTree.tsx TREE).
import type { TreeNode } from "./types"

export const TECHNIQUE_TREE: TreeNode[] = [
  { v: "GENERAL", label: "General Anaesthesia", labelBg: "Обща анестезия", children: [
    { v: "GENERAL_INHALATION", label: "Inhalational", labelBg: "Инхалационна" }, { v: "GENERAL_TIVA", label: "TIVA", labelBg: "Тотална интравенозна анестезия (ТИВА)" }, { v: "GENERAL_BALANCED", label: "Balanced (inhaled + IV)", labelBg: "Балансирана (инхалационна + венозна)" },
  ]},
  { v: "REGIONAL", label: "Regional Anaesthesia", labelBg: "Регионална анестезия", children: [
    { v: "NEURAXIAL", label: "Neuraxial", labelBg: "Невроаксиален блок", children: [
      { v: "SPINAL", label: "Spinal (SAB)", labelBg: "Спинална анестезия", children: [
        { v: "SPINAL_SINGLE", label: "Single shot", labelBg: "Еднократна", children: [
          { v: "SPINAL_SINGLE_LUMBAR", label: "Lumbar", labelBg: "Лумбална" }, { v: "SPINAL_SINGLE_LOW_THORACIC", label: "Low thoracic", labelBg: "Ниска торакална" },
          { v: "SPINAL_SINGLE_MID_THORACIC", label: "Mid thoracic", labelBg: "Средна торакална" }, { v: "SPINAL_SINGLE_HIGH_THORACIC", label: "High thoracic", labelBg: "Висока торакална" },
        ]},
        { v: "SPINAL_CONTINUOUS", label: "Continuous", labelBg: "Продължителна", children: [
          { v: "SPINAL_CONT_LUMBAR", label: "Lumbar", labelBg: "Лумбална" }, { v: "SPINAL_CONT_LOW_THORACIC", label: "Low thoracic", labelBg: "Ниска торакална" },
          { v: "SPINAL_CONT_MID_THORACIC", label: "Mid thoracic", labelBg: "Средна торакална" }, { v: "SPINAL_CONT_HIGH_THORACIC", label: "High thoracic", labelBg: "Висока торакална" },
        ]},
      ]},
      { v: "EPIDURAL", label: "Epidural", labelBg: "Епидурална анестезия", children: [
        { v: "EPIDURAL_CAUDAL", label: "Caudal", labelBg: "Каудална" }, { v: "EPIDURAL_LUMBAR", label: "Lumbar", labelBg: "Лумбална" },
        { v: "EPIDURAL_LOW_THORACIC", label: "Low thoracic", labelBg: "Ниска торакална" }, { v: "EPIDURAL_MID_THORACIC", label: "Mid thoracic", labelBg: "Средна торакална" }, { v: "EPIDURAL_HIGH_THORACIC", label: "High thoracic", labelBg: "Висока торакална" },
      ]},
      { v: "CSE", label: "Combined spinal-epidural (CSE)", labelBg: "Комбинирана спинална-епидурална анестезия (CSE)", children: [
        { v: "CSE_LUMBAR", label: "Lumbar", labelBg: "Лумбална" }, { v: "CSE_LOW_THORACIC", label: "Low thoracic", labelBg: "Ниска торакална" }, { v: "CSE_MID_THORACIC", label: "Mid thoracic", labelBg: "Средна торакална" }, { v: "CSE_HIGH_THORACIC", label: "High thoracic", labelBg: "Висока торакална" },
      ]},
      { v: "DPE", label: "Dural Puncture Epidural (DPE)", labelBg: "Епидурална техника с дурална пункция (DPE)" },
    ]},
    { v: "PERIPHERAL", label: "Peripheral nerve block", labelBg: "Блок на периферен нерв", children: [
      { v: "BLOCK_UPPER", label: "Upper extremity", labelBg: "Горен крайник", children: [
        { v: "BLOCK_INTERSCALENE", label: "Interscalene", labelBg: "Интерскаленусов блок" }, { v: "BLOCK_SUPRACLAVICULAR", label: "Supraclavicular", labelBg: "Супраклавикуларен блок" },
        { v: "BLOCK_INFRACLAVICULAR", label: "Infraclavicular", labelBg: "Инфраклавикуларен блок" }, { v: "BLOCK_AXILLARY", label: "Axillary", labelBg: "Аксиларен блок" },
        { v: "BLOCK_WRIST", label: "Wrist block", labelBg: "Блок на ниво китка" }, { v: "BLOCK_DIGITAL", label: "Digital block", labelBg: "Блок на пръст" },
        { v: "BLOCK_BIER", label: "Bier block (IVRA)", labelBg: "Регионална интравенозна анестезия (РИВА)" }, { v: "BLOCK_ELBOW", label: "Elbow block", labelBg: "Блок на ниво лакът" },
      ]},
      { v: "BLOCK_LOWER", label: "Lower extremity", labelBg: "Долен крайник", children: [
        { v: "BLOCK_FEMORAL", label: "Femoral nerve", labelBg: "Блок на бедрения нерв" }, { v: "BLOCK_ADDUCTOR", label: "Adductor canal (saphenous)", labelBg: "Блок на аддукторния канал (n. saphenus)" },
        { v: "BLOCK_SCIATIC", label: "Sciatic nerve", labelBg: "Блок на седалищния нерв" }, { v: "BLOCK_POPLITEAL", label: "Popliteal sciatic", labelBg: "Поплитеален блок на седалищния нерв" },
        { v: "BLOCK_ANKLE", label: "Ankle block", labelBg: "Блок на ниво глезен" }, { v: "BLOCK_OBTURATOR", label: "Obturator nerve", labelBg: "Блок на обтураторния нерв" },
        { v: "BLOCK_LAT_FEMORAL", label: "Lateral femoral cutaneous nerve", labelBg: "Блок на латералния кожен нерв на бедрото" }, { v: "BLOCK_LUMBAR_PLEXUS", label: "Lumbar plexus (psoas compartment)", labelBg: "Блок на лумбалния плексус (psoas compartment)" },
        { v: "BLOCK_IPACK", label: "IPACK block", labelBg: "IPACK блок" }, { v: "BLOCK_GENICULAR", label: "Genicular nerve block", labelBg: "Блок на геникуларните нерви" }, { v: "BLOCK_FOOT", label: "Foot nerve block", labelBg: "Фус блок" },
      ]},
      { v: "BLOCK_TRUNK", label: "Trunk / abdominal wall", labelBg: "Торс / коремна стена", children: [
        { v: "BLOCK_TAP", label: "TAP block", labelBg: "TAP блок" }, { v: "BLOCK_RECTUS", label: "Rectus sheath block", labelBg: "Блок на влагалището на правия коремен мускул" },
        { v: "BLOCK_PARAVERTEBRAL", label: "Paravertebral block", labelBg: "Паравертебрален блок" }, { v: "BLOCK_ESP", label: "Erector spinae plane block (ESP)", labelBg: "Еректор спине блок (ESP)" },
        { v: "BLOCK_SERRATUS", label: "Serratus anterior plane block (SAP)", labelBg: "Блок в равнината на m. serratus anterior (SAP)" }, { v: "BLOCK_PECS1", label: "PECS I block", labelBg: "PECS I block" }, { v: "BLOCK_PECS2", label: "PECS II block", labelBg: "PECS II block" },
        { v: "BLOCK_QL", label: "Quadratus lumborum block (QL)", labelBg: "Блок на квадратния поясен мускул (QL)" }, { v: "BLOCK_ILIOINGUINAL", label: "Ilioinguinal / iliohypogastric block", labelBg: "Илиоингвинален / илиохипогастрален блок" }, { v: "BLOCK_INTERCOSTAL", label: "Intercostal nerve block", labelBg: "Интеркостален блок" },
      ]},
      { v: "BLOCK_HEAD_NECK", label: "Head and neck", labelBg: "Глава и шия", children: [
        { v: "BLOCK_SUPERFICIAL_CERVICAL", label: "Superficial cervical plexus block", labelBg: "Блок на повърхностния цервикален плексус" }, { v: "BLOCK_DEEP_CERVICAL", label: "Deep cervical plexus block", labelBg: "Блок на дълбокия цервикален плексус" },
        { v: "BLOCK_SCALP", label: "Scalp nerve block", labelBg: "Блок на нервите на скалпа" }, { v: "BLOCK_TRIGEMINAL", label: "Trigeminal nerve block", labelBg: "Блок на тригеминалния нерв" },
        { v: "BLOCK_SPHENOPALATINE", label: "Sphenopalatine ganglion block (SPG)", labelBg: "Блок на сфенопалатиналния ганглий (SPG)" }, { v: "BLOCK_GLOSSOPHARYNGEAL", label: "Glossopharyngeal nerve block", labelBg: "Блок на глософарингеалния нерв" },
      ]},
      { v: "BLOCK_OPHTHALMIC", label: "Ophthalmic anesthesia", labelBg: "Очна анестезия", children: [
        { v: "BLOCK_PERIBULBAR", label: "Peribulbar block", labelBg: "Перибулбарен блок" }, { v: "BLOCK_RETROBULBAR", label: "Retrobulbar block", labelBg: "Ретробулбарен блок" },
        { v: "BLOCK_SUB_TENONS", label: "Sub-Tenon's block", labelBg: "Субтенонов блок" }, { v: "BLOCK_TOPICAL_EYE", label: "Topical ocular anesthesia", labelBg: "Топикална (капкова) очна анестезия" },
      ]},
    ]},
  ]},
  { v: "SEDATION", label: "Sedation / MAC", labelBg: "Седация / мониторирани анестезиологични грижи (MAC)", children: [
    { v: "SEDATION_CONSCIOUS", label: "Moderate (conscious) sedation", labelBg: "Умерена (съзнателна) седация" }, { v: "SEDATION_DEEP", label: "Deep sedation", labelBg: "Дълбока седация" }, { v: "SEDATION_MAC", label: "Monitored anesthesia care (MAC)", labelBg: "Мониторирана анестезиологична грижа (МАГ)" },
  ]},
  { v: "LOCAL", label: "Local infiltration", labelBg: "Локална инфилтрация" },
  { v: "OTHER", label: "Other…", labelBg: "Друго…" },
]
