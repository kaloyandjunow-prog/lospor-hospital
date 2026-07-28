// VASCULAR_ACCESS — arterial/venous access tree (VascularAccessTree.tsx TREE).
import type { TreeNode } from "./types"

export const VASCULAR_ACCESS_TREE: TreeNode[] = [
  { v: "ARTERIAL", label: "Arterial", labelBg: "Артериален достъп", children: [
    { v: "ART_RADIAL", label: "Radial", labelBg: "Arteria radialis" }, { v: "ART_ULNAR", label: "Ulnar", labelBg: "Arteria ulnaris" }, { v: "ART_BRACHIAL", label: "Brachial", labelBg: "Arteria brachialis" },
    { v: "ART_AXILLARY", label: "Axillary", labelBg: "Arteria axillaris" }, { v: "ART_CAROTID", label: "Carotid", labelBg: "Arteria carotis communis" }, { v: "ART_FEMORAL", label: "Femoral", labelBg: "Arteria femoralis" },
  ]},
  { v: "VENOUS", label: "Venous", labelBg: "Венозен достъп", children: [
    { v: "VEN_PERIPHERAL", label: "Peripheral IV", labelBg: "Периферен венозен достъп" },
    { v: "VEN_CENTRAL", label: "Central", labelBg: "Централен венозен достъп", children: [
      { v: "PICC", label: "PICC", labelBg: "PICC", children: [
        { v: "PICC_BRACHIAL", label: "Brachial", labelBg: "Venae brachiales" }, { v: "PICC_BASILIC", label: "Basilic", labelBg: "Vena basilica" }, { v: "PICC_CEPHALIC", label: "Cephalic", labelBg: "Vena cephalica" },
      ]},
      { v: "CVK", label: "Central line", labelBg: "Централен венозен катетър", children: [
        { v: "CVK_AXILLARY", label: "Axillary", labelBg: "Vena axillaris" }, { v: "CVK_IJV", label: "Internal jugular", labelBg: "Vena jugularis interna" }, { v: "CVK_EJV", label: "External jugular", labelBg: "Vena jugularis externa" },
        { v: "CVK_SUBCLAVIAN", label: "Subclavian", labelBg: "Vena subclavia" }, { v: "CVK_FEMORAL", label: "Femoral", labelBg: "Vena femoralis" },
      ]},
    ]},
  ]},
]

export const VASCULAR_PREEXISTING_QUICK_OPTIONS = [
  { value: "VEN_PERIPHERAL", label: "Peripheral IV", crumb: "Venous › Peripheral IV" },
  { value: "CVK_IJV", label: "CVC (IJV)", crumb: "Venous › Central › Central line › Internal jugular" },
  { value: "CVK_SUBCLAVIAN", label: "CVC (Subclavian)", crumb: "Venous › Central › Central line › Subclavian" },
  { value: "ART_RADIAL", label: "Art line (Radial)", crumb: "Arterial › Radial" },
] as const
