import type { DoseProfileInput } from "./dose-profile"

// INTRAOP_DRUG catalog — generated from scripts/_drug-library-answers.json
// via scripts/_generate_catalogs.ts. Edit the source JSON and regenerate
// rather than hand-editing entries here, to keep the walkthrough record and
// the catalog in sync.

export type DrugCatalogEntry = {
  name: string
  category: string
  color: string
  profile: DoseProfileInput
}

export const DRUG_CATALOG: DrugCatalogEntry[] = [
  {
    "name": "Propofol",
    "category": "Neuro / ICP / anticonvulsants",
    "color": "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
    "profile": {
      "min": 0,
      "max": 500,
      "step": 10,
      "quickValues": [
        50,
        100,
        150,
        200,
        250
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 2,
        "basis": "IBW",
        "roundTo": 10
      },
      "hint": "2 mg/kg IBW (range 1-2.5 mg/kg)"
    }
  },
  {
    "name": "Etomidate",
    "category": "Intravenous hypnotics / general anesthetics",
    "color": "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
    "profile": {
      "min": 0,
      "max": 50,
      "step": 0.1,
      "quickValues": [
        10,
        15,
        20,
        25,
        30
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.3,
        "basis": "IBW",
        "roundTo": 1
      },
      "hint": "0.3 mg/kg IBW"
    }
  },
  {
    "name": "Ketamine",
    "category": "Regional anesthesia adjuvants",
    "color": "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
    "profile": {
      "min": 0,
      "max": 250,
      "step": 5,
      "quickValues": [
        10,
        20,
        50,
        100,
        200
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "IM",
        "IN",
        "PO"
      ],
      "doseCalcByRoute": {
        "IV": {
          "perKg": 2,
          "basis": "IBW",
          "roundTo": 10
        },
        "IM": {
          "perKg": 4,
          "basis": "IBW",
          "roundTo": 10
        },
        "IN": {
          "perKg": 3,
          "basis": "IBW",
          "roundTo": 10
        },
        "PO": {
          "perKg": 8,
          "basis": "IBW",
          "roundTo": 10
        }
      }
    }
  },
  {
    "name": "Esketamine",
    "category": "Intravenous hypnotics / general anesthetics",
    "color": "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
    "profile": {
      "min": 0,
      "max": 250,
      "step": 5,
      "quickValues": [
        10,
        20,
        50,
        100,
        200
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "IM",
        "IN",
        "PO"
      ],
      "doseCalcByRoute": {
        "IV": {
          "perKg": 1,
          "basis": "IBW",
          "roundTo": 10
        },
        "IM": {
          "perKg": 2,
          "basis": "IBW",
          "roundTo": 10
        },
        "IN": {
          "perKg": 1.5,
          "basis": "IBW",
          "roundTo": 10
        },
        "PO": {
          "perKg": 4,
          "basis": "IBW",
          "roundTo": 10
        }
      }
    }
  },
  {
    "name": "Thiopental / Thiopentone",
    "category": "Neuro / ICP / anticonvulsants",
    "color": "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
    "profile": {
      "min": 0,
      "max": 1000,
      "step": 10,
      "quickValues": [
        100,
        200,
        300,
        400,
        500
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 4,
        "basis": "IBW",
        "roundTo": 10
      },
      "hint": "4 mg/kg IBW"
    }
  },
  {
    "name": "Methohexital",
    "category": "Intravenous hypnotics / general anesthetics",
    "color": "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
    "profile": {
      "min": 0,
      "max": 500,
      "step": 10,
      "quickValues": [
        50,
        100,
        150,
        200,
        300
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 1.5,
        "basis": "IBW",
        "roundTo": 10
      },
      "hint": "1.5 mg/kg IBW"
    }
  },
  {
    "name": "Midazolam",
    "category": "Neuro / ICP / anticonvulsants",
    "color": "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
    "profile": {
      "min": 0,
      "max": 15,
      "step": 0.5,
      "quickValues": [
        1,
        2,
        3,
        5,
        10
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "IM",
        "IN",
        "PO"
      ],
      "doseCalcByRoute": {
        "IV": {
          "perKg": 0.05,
          "basis": "IBW",
          "roundTo": 0.5
        },
        "IM": {
          "perKg": 0.1,
          "basis": "IBW",
          "roundTo": 0.5
        },
        "IN": {
          "perKg": 0.2,
          "basis": "IBW",
          "roundTo": 0.5
        },
        "PO": {
          "perKg": 0.5,
          "basis": "IBW",
          "roundTo": 0.5
        }
      }
    }
  },
  {
    "name": "Diazepam",
    "category": "Neuro / ICP / anticonvulsants",
    "color": "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
    "profile": {
      "min": 0,
      "max": 20,
      "step": 1,
      "quickValues": [
        2,
        5,
        10,
        15,
        20
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "PO",
        "IM"
      ],
      "doseCalc": {
        "perKg": 0.1,
        "basis": "IBW",
        "roundTo": 1
      },
      "hint": "0.1 mg/kg IBW (IV)"
    }
  },
  {
    "name": "Lorazepam",
    "category": "Neuro / ICP / anticonvulsants",
    "color": "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
    "profile": {
      "min": 0,
      "max": 4,
      "step": 0.5,
      "quickValues": [
        0.5,
        1,
        2,
        3,
        4
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "PO",
        "IM"
      ],
      "doseCalc": {
        "flat": 1
      },
      "hint": "1 mg"
    }
  },
  {
    "name": "Remimazolam",
    "category": "Sedatives / anxiolytics / alpha-2 agonists",
    "color": "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
    "profile": {
      "min": 0,
      "max": 20,
      "step": 1,
      "quickValues": [
        2.5,
        5,
        7.5,
        10,
        12.5
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 2.5
      },
      "hint": "2.5 mg"
    }
  },
  {
    "name": "Dexmedetomidine",
    "category": "Regional anesthesia adjuvants",
    "color": "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
    "profile": {
      "min": 0,
      "max": 200,
      "step": 5,
      "quickValues": [
        25,
        50,
        75,
        100,
        150
      ],
      "unit": "mcg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 1,
        "basis": "IBW",
        "roundTo": 5
      },
      "hint": "1 mcg/kg IBW (loading dose)"
    }
  },
  {
    "name": "Clonidine",
    "category": "Regional anesthesia adjuvants",
    "color": "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
    "profile": {
      "min": 0,
      "max": 300,
      "step": 25,
      "quickValues": [
        50,
        75,
        100,
        150,
        200
      ],
      "unit": "mcg",
      "routes": [
        "IV",
        "PO"
      ],
      "doseCalc": {
        "perKg": 2,
        "basis": "IBW",
        "roundTo": 25
      },
      "hint": "2 mcg/kg IBW"
    }
  },
  {
    "name": "Droperidol",
    "category": "Antiemetics / prokinetics",
    "color": "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    "profile": {
      "min": 0,
      "max": 2.5,
      "step": 0.125,
      "quickValues": [
        0.625,
        1.25,
        1.875,
        2.5
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 0.625
      },
      "hint": "0.625 mg"
    }
  },
  {
    "name": "Haloperidol",
    "category": "Antiemetics / prokinetics",
    "color": "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    "profile": {
      "min": 0,
      "max": 5,
      "step": 0.5,
      "quickValues": [
        0.5,
        1,
        2,
        2.5,
        5
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 1
      },
      "hint": "1 mg"
    }
  },
  {
    "name": "Promethazine",
    "category": "Anaphylaxis / allergy adjuncts",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 25,
      "step": 1,
      "quickValues": [
        5,
        10,
        20,
        25
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "IM"
      ],
      "doseCalc": {
        "flat": 10
      },
      "hint": "10 mg"
    }
  },
  {
    "name": "Fentanyl",
    "category": "Regional anesthesia adjuvants",
    "color": "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
    "profile": {
      "min": 0,
      "max": 500,
      "step": 10,
      "quickValues": [
        10,
        25,
        50,
        200
      ],
      "unit": "mcg",
      "routes": [
        "IV",
        "IM"
      ],
      "doseCalc": {
        "perKg": 1.5,
        "basis": "IBW",
        "roundTo": 25
      },
      "hint": "1.5 mcg/kg IBW"
    }
  },
  {
    "name": "Sufentanil",
    "category": "Regional anesthesia adjuvants",
    "color": "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
    "profile": {
      "min": 0,
      "max": 50,
      "step": 1,
      "quickValues": [
        5,
        10,
        15,
        25,
        40
      ],
      "unit": "mcg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.2,
        "basis": "IBW",
        "roundTo": 2.5
      },
      "hint": "0.2 mcg/kg IBW"
    }
  },
  {
    "name": "Remifentanil",
    "category": "Opioid analgesics",
    "color": "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    "profile": {
      "min": 0,
      "max": 100,
      "step": 5,
      "quickValues": [
        10,
        20,
        30,
        50,
        75
      ],
      "unit": "mcg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.5,
        "basis": "IBW",
        "roundTo": 5
      },
      "hint": "0.5 mcg/kg IBW"
    }
  },
  {
    "name": "Alfentanil",
    "category": "Opioid analgesics",
    "color": "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    "profile": {
      "min": 0,
      "max": 1500,
      "step": 50,
      "quickValues": [
        250,
        500,
        750,
        1000,
        1500
      ],
      "unit": "mcg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 20,
        "basis": "IBW",
        "roundTo": 50
      },
      "hint": "20 mcg/kg IBW"
    }
  },
  {
    "name": "Morphine",
    "category": "Regional anesthesia adjuvants",
    "color": "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
    "profile": {
      "min": 0,
      "max": 60,
      "step": 1,
      "quickValues": [
        2,
        4,
        5,
        10,
        15
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "IM"
      ],
      "doseCalc": {
        "perKg": 0.1,
        "basis": "IBW",
        "roundTo": 1
      },
      "hint": "0.1 mg/kg IBW"
    }
  },
  {
    "name": "Hydromorphone",
    "category": "Opioid analgesics",
    "color": "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    "profile": {
      "min": 0,
      "max": 4,
      "step": 0.1,
      "quickValues": [
        0.2,
        0.4,
        0.5,
        1,
        2
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "IM"
      ],
      "doseCalc": {
        "perKg": 0.015,
        "basis": "IBW",
        "roundTo": 0.1
      },
      "hint": "0.015 mg/kg IBW"
    }
  },
  {
    "name": "Oxycodone",
    "category": "Opioid analgesics",
    "color": "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    "profile": {
      "min": 0,
      "max": 60,
      "step": 1,
      "quickValues": [
        2,
        5,
        7.5,
        10,
        15
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.1,
        "basis": "IBW",
        "roundTo": 1
      },
      "hint": "0.1 mg/kg IBW"
    }
  },
  {
    "name": "Methadone",
    "category": "Opioid analgesics",
    "color": "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    "profile": {
      "min": 0,
      "max": 60,
      "step": 1,
      "quickValues": [
        2.5,
        5,
        10,
        15,
        20
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.1,
        "basis": "IBW",
        "roundTo": 1
      },
      "hint": "0.1 mg/kg IBW"
    }
  },
  {
    "name": "Pethidine / Meperidine",
    "category": "Opioid analgesics",
    "color": "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    "profile": {
      "min": 0,
      "max": 100,
      "step": 5,
      "quickValues": [
        12.5,
        25,
        50,
        75,
        100
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "IM"
      ],
      "doseCalc": {
        "flat": 25
      },
      "hint": "25 mg"
    }
  },
  {
    "name": "Tramadol",
    "category": "Opioid analgesics",
    "color": "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    "profile": {
      "min": 0,
      "max": 200,
      "step": 25,
      "quickValues": [
        50,
        100,
        150,
        200
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "PO"
      ],
      "doseCalc": {
        "flat": 100
      },
      "hint": "100 mg"
    }
  },
  {
    "name": "Nalbuphine",
    "category": "Opioid analgesics",
    "color": "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    "profile": {
      "min": 0,
      "max": 20,
      "step": 2.5,
      "quickValues": [
        2.5,
        5,
        10,
        15,
        20
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "IM"
      ],
      "doseCalc": {
        "flat": 5
      },
      "hint": "5 mg"
    }
  },
  {
    "name": "Butorphanol",
    "category": "Opioid analgesics",
    "color": "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    "profile": {
      "min": 0,
      "max": 4,
      "step": 0.5,
      "quickValues": [
        0.5,
        1,
        1.5,
        2
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "IM"
      ],
      "doseCalc": {
        "flat": 1
      },
      "hint": "1 mg"
    }
  },
  {
    "name": "Buprenorphine",
    "category": "Regional anesthesia adjuvants",
    "color": "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
    "profile": {
      "min": 0,
      "max": 600,
      "step": 50,
      "quickValues": [
        150,
        300,
        450,
        600
      ],
      "unit": "mcg",
      "routes": [
        "IV",
        "IM",
        "SL"
      ],
      "doseCalc": {
        "flat": 300
      },
      "hint": "300 mcg"
    }
  },
  {
    "name": "Diamorphine",
    "category": "Regional anesthesia adjuvants",
    "color": "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
    "profile": {
      "min": 0,
      "max": 10,
      "step": 0.5,
      "quickValues": [
        1,
        2.5,
        5,
        7.5
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "IM"
      ],
      "doseCalc": {
        "perKg": 0.05,
        "basis": "IBW",
        "roundTo": 0.5
      },
      "hint": "0.05 mg/kg IBW"
    }
  },
  {
    "name": "Paracetamol / Acetaminophen",
    "category": "Non-opioid analgesics / analgesic adjuncts",
    "color": "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30",
    "profile": {
      "min": 0,
      "max": 1000,
      "step": 10,
      "quickValues": [
        500,
        650,
        1000
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "PO"
      ],
      "doseCalc": {
        "flat": 1000
      },
      "hint": "1000 mg"
    }
  },
  {
    "name": "Metamizole",
    "category": "Other",
    "color": "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
    "profile": {
      "min": 0,
      "max": 2500,
      "step": 10,
      "quickValues": [
        500,
        1000,
        1500,
        2500
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "PO"
      ],
      "doseCalc": {
        "flat": 1000
      },
      "hint": "1000 mg"
    }
  },
  {
    "name": "Ketorolac",
    "category": "Non-opioid analgesics / analgesic adjuncts",
    "color": "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30",
    "profile": {
      "min": 0,
      "max": 30,
      "step": 5,
      "quickValues": [
        10,
        15,
        30
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "IM"
      ],
      "doseCalc": {
        "flat": 15
      },
      "hint": "15 mg"
    }
  },
  {
    "name": "Diclofenac",
    "category": "Non-opioid analgesics / analgesic adjuncts",
    "color": "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30",
    "profile": {
      "min": 0,
      "max": 75,
      "step": 5,
      "quickValues": [
        25,
        50,
        75
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "IM",
        "PO"
      ],
      "doseCalc": {
        "flat": 75
      },
      "hint": "75 mg"
    }
  },
  {
    "name": "Ibuprofen",
    "category": "Non-opioid analgesics / analgesic adjuncts",
    "color": "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30",
    "profile": {
      "min": 0,
      "max": 800,
      "step": 50,
      "quickValues": [
        200,
        400,
        600,
        800
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "PO"
      ],
      "doseCalc": {
        "flat": 400
      },
      "hint": "400 mg"
    }
  },
  {
    "name": "Dexketoprofen",
    "category": "Non-opioid analgesics / analgesic adjuncts",
    "color": "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30",
    "profile": {
      "min": 0,
      "max": 50,
      "step": 10,
      "quickValues": [
        25,
        50
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 50
      },
      "hint": "50 mg"
    }
  },
  {
    "name": "Ketoprofen",
    "category": "Non-opioid analgesics / analgesic adjuncts",
    "color": "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30",
    "profile": {
      "min": 0,
      "max": 100,
      "step": 10,
      "quickValues": [
        50,
        100
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "IM"
      ],
      "doseCalc": {
        "flat": 100
      },
      "hint": "100 mg"
    }
  },
  {
    "name": "Parecoxib",
    "category": "Non-opioid analgesics / analgesic adjuncts",
    "color": "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30",
    "profile": {
      "min": 0,
      "max": 40,
      "step": 10,
      "quickValues": [
        20,
        40
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 40
      },
      "hint": "40 mg"
    }
  },
  {
    "name": "Lornoxicam",
    "category": "Non-opioid analgesics / analgesic adjuncts",
    "color": "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30",
    "profile": {
      "min": 0,
      "max": 16,
      "step": 1,
      "quickValues": [
        8,
        16
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 8
      },
      "hint": "8 mg"
    }
  },
  {
    "name": "Tenoxicam",
    "category": "Non-opioid analgesics / analgesic adjuncts",
    "color": "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30",
    "profile": {
      "min": 0,
      "max": 20,
      "step": 1,
      "quickValues": [
        20
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 20
      },
      "hint": "20 mg"
    }
  },
  {
    "name": "Nefopam",
    "category": "Non-opioid analgesics / analgesic adjuncts",
    "color": "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30",
    "profile": {
      "min": 0,
      "max": 60,
      "step": 10,
      "quickValues": [
        20,
        40,
        60
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 20
      },
      "hint": "20 mg"
    }
  },
  {
    "name": "Magnesium sulfate",
    "category": "Neuro / ICP / anticonvulsants",
    "color": "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
    "profile": {
      "min": 0,
      "max": 4000,
      "step": 100,
      "quickValues": [
        500,
        1000,
        2000,
        4000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 30,
        "basis": "IBW",
        "roundTo": 100
      },
      "hint": "30 mg/kg IBW"
    }
  },
  {
    "name": "Lidocaine",
    "category": "Other",
    "color": "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
    "profile": {
      "routes": [
        "IV",
        "Local infiltration",
        "PD",
        "IT",
        "Peripheral nerve block"
      ],
      "routeModes": {
        "IV": {
          "mode": "dose",
          "min": 0,
          "max": 500,
          "step": 10,
          "quickValues": [
            50,
            100,
            150,
            200,
            250
          ],
          "unit": "mg",
          "doseCalc": {
            "perKg": 1,
            "basis": "IBW",
            "roundTo": 10
          }
        },
        "Local infiltration": {
          "mode": "concentration",
          "min": 0,
          "max": 50,
          "step": 1,
          "quickValues": [
            2,
            5,
            8,
            10,
            12
          ],
          "unit": "mL",
          "concentrationOptions": [
            "0.5%",
            "1%",
            "2%",
            "5%"
          ],
          "suggestedVolume": 5
        },
        "PD": {
          "mode": "concentration",
          "min": 0,
          "max": 50,
          "step": 1,
          "quickValues": [
            2,
            5,
            8,
            10,
            12
          ],
          "unit": "mL",
          "concentrationOptions": [
            "0.5%",
            "1%",
            "2%",
            "5%"
          ],
          "suggestedVolume": 5
        },
        "IT": {
          "mode": "concentration",
          "min": 0,
          "max": 50,
          "step": 1,
          "quickValues": [
            2,
            5,
            8,
            10,
            12
          ],
          "unit": "mL",
          "concentrationOptions": [
            "0.5%",
            "1%",
            "2%",
            "5%"
          ],
          "suggestedVolume": 2
        },
        "Peripheral nerve block": {
          "mode": "concentration",
          "min": 0,
          "max": 50,
          "step": 1,
          "quickValues": [
            2,
            5,
            8,
            10,
            12
          ],
          "unit": "mL",
          "concentrationOptions": [
            "0.5%",
            "1%",
            "2%",
            "5%"
          ],
          "suggestedVolume": 5
        }
      }
    }
  },
  {
    "name": "Succinylcholine / Suxamethonium",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 200,
      "step": 5,
      "quickValues": [
        50,
        75,
        100,
        150
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 1,
        "basis": "TBW",
        "roundTo": 5
      },
      "hint": "1 mg/kg TBW"
    }
  },
  {
    "name": "Rocuronium",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 100,
      "step": 5,
      "quickValues": [
        20,
        30,
        40,
        50,
        70
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.6,
        "basis": "IBW",
        "roundTo": 5
      },
      "hint": "0.6 mg/kg IBW"
    }
  },
  {
    "name": "Vecuronium",
    "category": "Neuromuscular blocking drugs",
    "color": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30",
    "profile": {
      "min": 0,
      "max": 20,
      "step": 1,
      "quickValues": [
        2,
        4,
        6,
        8,
        10
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.1,
        "basis": "IBW",
        "roundTo": 1
      },
      "hint": "0.1 mg/kg IBW"
    }
  },
  {
    "name": "Pancuronium",
    "category": "Neuromuscular blocking drugs",
    "color": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30",
    "profile": {
      "min": 0,
      "max": 10,
      "step": 0.5,
      "quickValues": [
        2,
        4,
        6,
        8
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.08,
        "basis": "IBW",
        "roundTo": 0.5
      },
      "hint": "0.08 mg/kg IBW"
    }
  },
  {
    "name": "Pipecuronium",
    "category": "Neuromuscular blocking drugs",
    "color": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30",
    "profile": {
      "min": 0,
      "max": 10,
      "step": 0.5,
      "quickValues": [
        2,
        4,
        6,
        8
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.08,
        "basis": "IBW",
        "roundTo": 0.5
      },
      "hint": "0.08 mg/kg IBW"
    }
  },
  {
    "name": "Cisatracurium",
    "category": "Neuromuscular blocking drugs",
    "color": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30",
    "profile": {
      "min": 0,
      "max": 20,
      "step": 1,
      "quickValues": [
        5,
        10,
        14,
        20
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.15,
        "basis": "IBW",
        "roundTo": 1
      },
      "hint": "0.15 mg/kg IBW"
    }
  },
  {
    "name": "Atracurium",
    "category": "Neuromuscular blocking drugs",
    "color": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30",
    "profile": {
      "min": 0,
      "max": 50,
      "step": 5,
      "quickValues": [
        10,
        20,
        30,
        40,
        50
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.5,
        "basis": "IBW",
        "roundTo": 5
      },
      "hint": "0.5 mg/kg IBW"
    }
  },
  {
    "name": "Mivacurium",
    "category": "Neuromuscular blocking drugs",
    "color": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30",
    "profile": {
      "min": 0,
      "max": 15,
      "step": 1,
      "quickValues": [
        4,
        6,
        8,
        10
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.15,
        "basis": "IBW",
        "roundTo": 1
      },
      "hint": "0.15 mg/kg IBW"
    }
  },
  {
    "name": "Sugammadex",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 800,
      "step": 10,
      "quickValues": [
        100,
        200,
        400,
        600
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 2,
        "basis": "TBW",
        "roundTo": 10
      },
      "hint": "2 mg/kg TBW (4 mg/kg if deep block)"
    }
  },
  {
    "name": "Neostigmine",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 5,
      "step": 0.5,
      "quickValues": [
        1,
        2,
        2.5,
        5
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.05,
        "basis": "IBW",
        "roundTo": 0.5
      },
      "hint": "0.05 mg/kg IBW"
    }
  },
  {
    "name": "Glycopyrrolate",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 1,
      "step": 0.1,
      "quickValues": [
        0.2,
        0.4,
        0.6,
        1
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.01,
        "basis": "IBW",
        "roundTo": 0.1
      },
      "hint": "0.01 mg/kg IBW"
    }
  },
  {
    "name": "Atropine",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 3,
      "step": 0.1,
      "quickValues": [
        0.5,
        1,
        2,
        3
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 0.5
      },
      "hint": "0.5 mg"
    }
  },
  {
    "name": "Scopolamine / Hyoscine",
    "category": "Antiemetics / prokinetics",
    "color": "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    "profile": {
      "min": 0,
      "max": 0.6,
      "step": 0.1,
      "quickValues": [
        0.2,
        0.4,
        0.6
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "IM"
      ],
      "doseCalc": {
        "flat": 0.4
      },
      "hint": "0.4 mg"
    }
  },
  {
    "name": "Hyoscine butylbromide",
    "category": "Acid suppression / aspiration prophylaxis / GI adjuncts",
    "color": "bg-lime-100 text-lime-700 border-lime-300 dark:bg-lime-500/15 dark:text-lime-300 dark:border-lime-500/30",
    "profile": {
      "min": 0,
      "max": 40,
      "step": 10,
      "quickValues": [
        10,
        20,
        40
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "IM"
      ],
      "doseCalc": {
        "flat": 20
      },
      "hint": "20 mg"
    }
  },
  {
    "name": "Bupivacaine",
    "category": "Local/regional anesthetics",
    "color": "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
    "profile": {
      "mode": "concentration",
      "min": 0,
      "max": 60,
      "variableStep": [
        {
          "upTo": 5,
          "step": 0.1
        },
        {
          "upTo": 60,
          "step": 1
        }
      ],
      "quickValues": [
        1,
        2,
        5,
        8,
        10
      ],
      "unit": "mL",
      "concentrationOptions": [
        "0.125%",
        "0.25%",
        "0.5%",
        "0.75%"
      ],
      "routes": [
        "Local infiltration",
        "PD",
        "IT",
        "Peripheral nerve block"
      ],
      "suggestedVolume": 5,
      "suggestedVolumeByRoute": {
        "IT": 2
      }
    }
  },
  {
    "name": "Levobupivacaine",
    "category": "Local/regional anesthetics",
    "color": "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
    "profile": {
      "mode": "concentration",
      "min": 0,
      "max": 60,
      "variableStep": [
        {
          "upTo": 5,
          "step": 0.1
        },
        {
          "upTo": 60,
          "step": 1
        }
      ],
      "quickValues": [
        1,
        2,
        5,
        8,
        10
      ],
      "unit": "mL",
      "concentrationOptions": [
        "0.125%",
        "0.25%",
        "0.5%",
        "0.75%"
      ],
      "routes": [
        "Local infiltration",
        "PD",
        "IT",
        "Peripheral nerve block"
      ],
      "suggestedVolume": 5,
      "suggestedVolumeByRoute": {
        "IT": 2
      }
    }
  },
  {
    "name": "Ropivacaine",
    "category": "Local/regional anesthetics",
    "color": "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
    "profile": {
      "mode": "concentration",
      "min": 0,
      "max": 60,
      "variableStep": [
        {
          "upTo": 5,
          "step": 0.1
        },
        {
          "upTo": 60,
          "step": 1
        }
      ],
      "quickValues": [
        1,
        2,
        5,
        8,
        10
      ],
      "unit": "mL",
      "concentrationOptions": [
        "0.1%",
        "0.2%",
        "0.5%",
        "0.75%",
        "1%"
      ],
      "routes": [
        "Local infiltration",
        "PD",
        "IT",
        "Peripheral nerve block"
      ],
      "suggestedVolume": 5,
      "suggestedVolumeByRoute": {
        "IT": 2
      }
    }
  },
  {
    "name": "Mepivacaine",
    "category": "Local/regional anesthetics",
    "color": "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
    "profile": {
      "mode": "concentration",
      "min": 0,
      "max": 60,
      "variableStep": [
        {
          "upTo": 5,
          "step": 0.1
        },
        {
          "upTo": 60,
          "step": 1
        }
      ],
      "quickValues": [
        1,
        2,
        5,
        8,
        10
      ],
      "unit": "mL",
      "concentrationOptions": [
        "1%",
        "1.5%",
        "2%",
        "3%"
      ],
      "routes": [
        "Local infiltration",
        "PD",
        "IT",
        "Peripheral nerve block"
      ],
      "suggestedVolume": 5,
      "suggestedVolumeByRoute": {
        "IT": 2
      }
    }
  },
  {
    "name": "Prilocaine",
    "category": "Local/regional anesthetics",
    "color": "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
    "profile": {
      "mode": "concentration",
      "min": 0,
      "max": 60,
      "variableStep": [
        {
          "upTo": 5,
          "step": 0.1
        },
        {
          "upTo": 60,
          "step": 1
        }
      ],
      "quickValues": [
        1,
        2,
        5,
        8,
        10
      ],
      "unit": "mL",
      "concentrationOptions": [
        "0.5%",
        "1%",
        "2%",
        "3%",
        "4%"
      ],
      "routes": [
        "IV",
        "Local infiltration",
        "PD",
        "IT",
        "Peripheral nerve block"
      ],
      "suggestedVolume": 5,
      "suggestedVolumeByRoute": {
        "IT": 2
      }
    }
  },
  {
    "name": "Chloroprocaine",
    "category": "Local/regional anesthetics",
    "color": "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
    "profile": {
      "mode": "concentration",
      "min": 0,
      "max": 60,
      "variableStep": [
        {
          "upTo": 5,
          "step": 0.1
        },
        {
          "upTo": 60,
          "step": 1
        }
      ],
      "quickValues": [
        1,
        2,
        5,
        8,
        10
      ],
      "unit": "mL",
      "concentrationOptions": [
        "1%",
        "2%",
        "3%"
      ],
      "routes": [
        "Local infiltration",
        "PD",
        "IT",
        "Peripheral nerve block"
      ],
      "suggestedVolume": 5,
      "suggestedVolumeByRoute": {
        "IT": 2
      }
    }
  },
  {
    "name": "Tetracaine / Amethocaine",
    "category": "Topical airway / nasal / ENT agents",
    "color": "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
    "profile": {
      "mode": "concentration",
      "min": 0,
      "max": 60,
      "variableStep": [
        {
          "upTo": 5,
          "step": 0.1
        },
        {
          "upTo": 60,
          "step": 1
        }
      ],
      "quickValues": [
        1,
        2,
        5,
        8,
        10
      ],
      "unit": "mL",
      "concentrationOptions": [
        "0.5%",
        "1%"
      ],
      "routes": [
        "IT"
      ],
      "suggestedVolume": 2
    }
  },
  {
    "name": "Phenylephrine",
    "category": "Vasoactive drugs - vasopressors / vasoconstrictors",
    "color": "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30",
    "profile": {
      "min": 0,
      "max": 200,
      "step": 10,
      "quickValues": [
        50,
        100,
        150,
        200
      ],
      "unit": "mcg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 100
      },
      "hint": "100 mcg"
    }
  },
  {
    "name": "Norepinephrine / Noradrenaline",
    "category": "Anaphylaxis / allergy adjuncts",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 20,
      "step": 4,
      "quickValues": [
        4,
        8,
        12,
        20
      ],
      "unit": "mcg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 10
      },
      "hint": "10 mcg"
    }
  },
  {
    "name": "Epinephrine / Adrenaline",
    "category": "Anaphylaxis / allergy adjuncts",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 1000,
      "step": 10,
      "quickValues": [
        100,
        250,
        500,
        750
      ],
      "unit": "mcg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 500
      },
      "hint": "500 mcg"
    }
  },
  {
    "name": "Ephedrine",
    "category": "Vasoactive drugs - vasopressors / vasoconstrictors",
    "color": "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30",
    "profile": {
      "min": 0,
      "max": 50,
      "step": 5,
      "quickValues": [
        5,
        10,
        15,
        25,
        50
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 10
      },
      "hint": "10 mg"
    }
  },
  {
    "name": "Metaraminol",
    "category": "Vasoactive drugs - vasopressors / vasoconstrictors",
    "color": "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30",
    "profile": {
      "min": 0,
      "max": 2,
      "step": 0.5,
      "quickValues": [
        0.5,
        1,
        1.5,
        2
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 0.5
      },
      "hint": "0.5 mg"
    }
  },
  {
    "name": "Vasopressin",
    "category": "Anaphylaxis / allergy adjuncts",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 4,
      "step": 1,
      "quickValues": [
        1,
        2,
        4
      ],
      "unit": "IU",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 1
      },
      "hint": "1 IU"
    }
  },
  {
    "name": "Terlipressin",
    "category": "Vasoactive drugs - vasopressors / vasoconstrictors",
    "color": "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30",
    "profile": {
      "min": 0,
      "max": 2,
      "step": 0.5,
      "quickValues": [
        0.5,
        1,
        1.5,
        2
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 1
      },
      "hint": "1 mg"
    }
  },
  {
    "name": "Methylene blue",
    "category": "Miscellaneous perioperative adjuncts",
    "color": "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
    "profile": {
      "min": 0,
      "max": 200,
      "step": 10,
      "quickValues": [
        50,
        100,
        150,
        200
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 1.5,
        "basis": "TBW",
        "roundTo": 10
      },
      "hint": "1.5 mg/kg TBW"
    }
  },
  {
    "name": "Hydroxocobalamin",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 5000,
      "step": 500,
      "quickValues": [
        2500,
        5000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 5000
      },
      "hint": "5000 mg"
    }
  },
  {
    "name": "Milrinone",
    "category": "Vasoactive drugs - inotropes / inodilators",
    "color": "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
    "profile": {
      "min": 0,
      "max": 1000,
      "step": 50,
      "quickValues": [
        250,
        500,
        750,
        1000
      ],
      "unit": "mcg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 50,
        "basis": "IBW",
        "roundTo": 50
      },
      "hint": "50 mcg/kg IBW"
    }
  },
  {
    "name": "Levosimendan",
    "category": "Vasoactive drugs - inotropes / inodilators",
    "color": "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
    "profile": {
      "min": 0,
      "max": 24,
      "step": 2,
      "quickValues": [
        6,
        12,
        18,
        24
      ],
      "unit": "mcg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 12,
        "basis": "IBW",
        "roundTo": 2
      },
      "hint": "12 mcg/kg IBW"
    }
  },
  {
    "name": "Glucagon",
    "category": "Anaphylaxis / allergy adjuncts",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 5,
      "step": 0.5,
      "quickValues": [
        1,
        2,
        5
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 1
      },
      "hint": "1 mg"
    }
  },
  {
    "name": "Calcium chloride",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 2000,
      "step": 100,
      "quickValues": [
        500,
        1000,
        1500,
        2000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 1000
      },
      "hint": "1000 mg"
    }
  },
  {
    "name": "Calcium gluconate",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 3000,
      "step": 100,
      "quickValues": [
        1000,
        2000,
        3000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 1000
      },
      "hint": "1000 mg"
    }
  },
  {
    "name": "Digoxin",
    "category": "Antiarrhythmics / cardiac rate control",
    "color": "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
    "profile": {
      "min": 0,
      "max": 1,
      "step": 0.125,
      "quickValues": [
        0.25,
        0.5,
        0.75,
        1
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 0.5
      },
      "hint": "0.5 mg"
    }
  },
  {
    "name": "Nitroglycerin / Glyceryl trinitrate",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 200,
      "step": 10,
      "quickValues": [
        50,
        100,
        150,
        200
      ],
      "unit": "mcg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 100
      },
      "hint": "100 mcg"
    }
  },
  {
    "name": "Esmolol",
    "category": "Antiarrhythmics / cardiac rate control",
    "color": "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
    "profile": {
      "min": 0,
      "max": 100,
      "step": 10,
      "quickValues": [
        10,
        20,
        30,
        50,
        100
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.5,
        "basis": "TBW",
        "roundTo": 10
      },
      "hint": "0.5 mg/kg TBW"
    }
  },
  {
    "name": "Labetalol",
    "category": "Antiarrhythmics / cardiac rate control",
    "color": "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
    "profile": {
      "min": 0,
      "max": 100,
      "step": 5,
      "quickValues": [
        5,
        10,
        20,
        50,
        100
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 10
      },
      "hint": "10 mg"
    }
  },
  {
    "name": "Metoprolol",
    "category": "Antiarrhythmics / cardiac rate control",
    "color": "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
    "profile": {
      "min": 0,
      "max": 15,
      "step": 1,
      "quickValues": [
        2.5,
        5,
        10,
        15
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 5
      },
      "hint": "5 mg"
    }
  },
  {
    "name": "Propranolol",
    "category": "Vasoactive drugs - antihypertensives / vasodilators",
    "color": "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
    "profile": {
      "min": 0,
      "max": 5,
      "step": 0.5,
      "quickValues": [
        0.5,
        1,
        2,
        5
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 1
      },
      "hint": "1 mg"
    }
  },
  {
    "name": "Hydralazine",
    "category": "Vasoactive drugs - antihypertensives / vasodilators",
    "color": "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
    "profile": {
      "min": 0,
      "max": 20,
      "step": 2.5,
      "quickValues": [
        5,
        10,
        15,
        20
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 5
      },
      "hint": "5 mg"
    }
  },
  {
    "name": "Sildenafil",
    "category": "Vasoactive drugs - antihypertensives / vasodilators",
    "color": "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
    "profile": {
      "min": 0,
      "max": 10,
      "step": 2.5,
      "quickValues": [
        2.5,
        5,
        7.5,
        10
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 5
      },
      "hint": "5 mg"
    }
  },
  {
    "name": "Adenosine",
    "category": "Neuro / ICP / anticonvulsants",
    "color": "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
    "profile": {
      "min": 0,
      "max": 18,
      "step": 3,
      "quickValues": [
        6,
        12,
        18
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 6
      },
      "hint": "6 mg"
    }
  },
  {
    "name": "Amiodarone",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 300,
      "step": 50,
      "quickValues": [
        150,
        300
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 150
      },
      "hint": "150 mg"
    }
  },
  {
    "name": "Diltiazem",
    "category": "Antiarrhythmics / cardiac rate control",
    "color": "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
    "profile": {
      "min": 0,
      "max": 25,
      "step": 2.5,
      "quickValues": [
        5,
        10,
        15,
        20,
        25
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.25,
        "basis": "TBW",
        "roundTo": 2.5
      },
      "hint": "0.25 mg/kg TBW"
    }
  },
  {
    "name": "Verapamil",
    "category": "Antiarrhythmics / cardiac rate control",
    "color": "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
    "profile": {
      "min": 0,
      "max": 10,
      "step": 1,
      "quickValues": [
        2.5,
        5,
        7.5,
        10
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 5
      },
      "hint": "5 mg"
    }
  },
  {
    "name": "Ondansetron",
    "category": "Acid suppression / aspiration prophylaxis / GI adjuncts",
    "color": "bg-lime-100 text-lime-700 border-lime-300 dark:bg-lime-500/15 dark:text-lime-300 dark:border-lime-500/30",
    "profile": {
      "min": 0,
      "max": 8,
      "step": 1,
      "quickValues": [
        4,
        8
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 4
      },
      "hint": "4 mg"
    }
  },
  {
    "name": "Granisetron",
    "category": "Antiemetics / prokinetics",
    "color": "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    "profile": {
      "min": 0,
      "max": 1,
      "step": 0.1,
      "quickValues": [
        0.1,
        1
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 1
      },
      "hint": "1 mg"
    }
  },
  {
    "name": "Palonosetron",
    "category": "Antiemetics / prokinetics",
    "color": "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    "profile": {
      "min": 0,
      "max": 75,
      "step": 25,
      "quickValues": [
        75
      ],
      "unit": "mcg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 75
      },
      "hint": "75 mcg"
    }
  },
  {
    "name": "Tropisetron",
    "category": "Antiemetics / prokinetics",
    "color": "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    "profile": {
      "min": 0,
      "max": 5,
      "step": 1,
      "quickValues": [
        2,
        5
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 5
      },
      "hint": "5 mg"
    }
  },
  {
    "name": "Dexamethasone",
    "category": "Anaphylaxis / allergy adjuncts",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 12,
      "step": 2,
      "quickValues": [
        4,
        8,
        10,
        12
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 8
      },
      "hint": "8 mg"
    }
  },
  {
    "name": "Metoclopramide",
    "category": "Acid suppression / aspiration prophylaxis / GI adjuncts",
    "color": "bg-lime-100 text-lime-700 border-lime-300 dark:bg-lime-500/15 dark:text-lime-300 dark:border-lime-500/30",
    "profile": {
      "min": 0,
      "max": 10,
      "step": 2.5,
      "quickValues": [
        2.5,
        5,
        10
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 10
      },
      "hint": "10 mg"
    }
  },
  {
    "name": "Cyclizine",
    "category": "Antiemetics / prokinetics",
    "color": "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    "profile": {
      "min": 0,
      "max": 50,
      "step": 25,
      "quickValues": [
        25,
        50
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "IM"
      ],
      "doseCalc": {
        "flat": 50
      },
      "hint": "50 mg"
    }
  },
  {
    "name": "Dimenhydrinate",
    "category": "Antiemetics / prokinetics",
    "color": "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    "profile": {
      "min": 0,
      "max": 62,
      "step": 31,
      "quickValues": [
        31,
        62
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 62
      },
      "hint": "62 mg"
    }
  },
  {
    "name": "Fosaprepitant",
    "category": "Antiemetics / prokinetics",
    "color": "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    "profile": {
      "min": 0,
      "max": 150,
      "step": 30,
      "quickValues": [
        100,
        150
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 150
      },
      "hint": "150 mg"
    }
  },
  {
    "name": "Octreotide",
    "category": "Endocrine / metabolic / electrolytes",
    "color": "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    "profile": {
      "min": 0,
      "max": 100,
      "step": 25,
      "quickValues": [
        25,
        50,
        100
      ],
      "unit": "mcg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 50
      },
      "hint": "50 mcg"
    }
  },
  {
    "name": "Cefazolin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 3000,
      "step": 250,
      "quickValues": [
        1000,
        2000,
        3000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 2000
      },
      "hint": "2000 mg"
    }
  },
  {
    "name": "Cefuroxime",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 3000,
      "step": 250,
      "quickValues": [
        750,
        1500,
        3000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 1500
      },
      "hint": "1500 mg"
    }
  },
  {
    "name": "Ceftriaxone",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 4000,
      "step": 500,
      "quickValues": [
        1000,
        2000,
        4000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 2000
      },
      "hint": "2000 mg"
    }
  },
  {
    "name": "Cefotaxime",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 4000,
      "step": 500,
      "quickValues": [
        1000,
        2000,
        4000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 2000
      },
      "hint": "2000 mg"
    }
  },
  {
    "name": "Cefoxitin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 4000,
      "step": 500,
      "quickValues": [
        1000,
        2000,
        4000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 2000
      },
      "hint": "2000 mg"
    }
  },
  {
    "name": "Cefotetan",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 4000,
      "step": 500,
      "quickValues": [
        1000,
        2000,
        4000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 2000
      },
      "hint": "2000 mg"
    }
  },
  {
    "name": "Ceftazidime",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 4000,
      "step": 500,
      "quickValues": [
        1000,
        2000,
        4000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 2000
      },
      "hint": "2000 mg"
    }
  },
  {
    "name": "Cefepime",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 4000,
      "step": 500,
      "quickValues": [
        1000,
        2000,
        4000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 2000
      },
      "hint": "2000 mg"
    }
  },
  {
    "name": "Ceftaroline",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 1200,
      "step": 100,
      "quickValues": [
        600,
        1200
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 600
      },
      "hint": "600 mg"
    }
  },
  {
    "name": "Ampicillin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 4000,
      "step": 500,
      "quickValues": [
        1000,
        2000,
        4000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 2000
      },
      "hint": "2000 mg"
    }
  },
  {
    "name": "Amoxicillin-clavulanate",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 2400,
      "step": 200,
      "quickValues": [
        1200,
        2400
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 1200
      },
      "hint": "1200 mg"
    }
  },
  {
    "name": "Ampicillin-sulbactam",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 6000,
      "step": 500,
      "quickValues": [
        1500,
        3000,
        6000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 3000
      },
      "hint": "3000 mg"
    }
  },
  {
    "name": "Piperacillin-tazobactam",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 9000,
      "step": 500,
      "quickValues": [
        2250,
        4500,
        9000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 4500
      },
      "hint": "4500 mg"
    }
  },
  {
    "name": "Flucloxacillin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 4000,
      "step": 500,
      "quickValues": [
        1000,
        2000,
        4000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 2000
      },
      "hint": "2000 mg"
    }
  },
  {
    "name": "Oxacillin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 4000,
      "step": 500,
      "quickValues": [
        1000,
        2000,
        4000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 2000
      },
      "hint": "2000 mg"
    }
  },
  {
    "name": "Nafcillin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 4000,
      "step": 500,
      "quickValues": [
        1000,
        2000,
        4000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 2000
      },
      "hint": "2000 mg"
    }
  },
  {
    "name": "Clindamycin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 1800,
      "step": 150,
      "quickValues": [
        600,
        900,
        1800
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 900
      },
      "hint": "900 mg"
    }
  },
  {
    "name": "Vancomycin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 2000,
      "step": 100,
      "quickValues": [
        500,
        1000,
        1500,
        2000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 15,
        "basis": "TBW",
        "roundTo": 100
      },
      "hint": "15 mg/kg TBW"
    }
  },
  {
    "name": "Teicoplanin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 800,
      "step": 100,
      "quickValues": [
        400,
        800
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 400
      },
      "hint": "400 mg"
    }
  },
  {
    "name": "Gentamicin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 600,
      "step": 20,
      "quickValues": [
        80,
        160,
        320
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 5,
        "basis": "TBW",
        "roundTo": 20
      },
      "hint": "5 mg/kg TBW"
    }
  },
  {
    "name": "Tobramycin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 600,
      "step": 20,
      "quickValues": [
        80,
        160,
        320
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 5,
        "basis": "TBW",
        "roundTo": 20
      },
      "hint": "5 mg/kg TBW"
    }
  },
  {
    "name": "Amikacin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 1500,
      "step": 50,
      "quickValues": [
        500,
        1000,
        1500
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 15,
        "basis": "TBW",
        "roundTo": 50
      },
      "hint": "15 mg/kg TBW"
    }
  },
  {
    "name": "Metronidazole",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 1500,
      "step": 250,
      "quickValues": [
        500,
        1000,
        1500
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 500
      },
      "hint": "500 mg"
    }
  },
  {
    "name": "Ciprofloxacin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 800,
      "step": 100,
      "quickValues": [
        400,
        800
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 400
      },
      "hint": "400 mg"
    }
  },
  {
    "name": "Levofloxacin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 1000,
      "step": 250,
      "quickValues": [
        500,
        750,
        1000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 500
      },
      "hint": "500 mg"
    }
  },
  {
    "name": "Moxifloxacin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 400,
      "step": 100,
      "quickValues": [
        400
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 400
      },
      "hint": "400 mg"
    }
  },
  {
    "name": "Ertapenem",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 1000,
      "step": 250,
      "quickValues": [
        1000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 1000
      },
      "hint": "1000 mg"
    }
  },
  {
    "name": "Meropenem",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 2000,
      "step": 250,
      "quickValues": [
        1000,
        2000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 1000
      },
      "hint": "1000 mg"
    }
  },
  {
    "name": "Imipenem-cilastatin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 1000,
      "step": 250,
      "quickValues": [
        500,
        1000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 500
      },
      "hint": "500 mg"
    }
  },
  {
    "name": "Aztreonam",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 2000,
      "step": 250,
      "quickValues": [
        1000,
        2000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 2000
      },
      "hint": "2000 mg"
    }
  },
  {
    "name": "Linezolid",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 600,
      "step": 100,
      "quickValues": [
        600
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 600
      },
      "hint": "600 mg"
    }
  },
  {
    "name": "Daptomycin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 800,
      "step": 50,
      "quickValues": [
        400,
        600,
        800
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 6,
        "basis": "TBW",
        "roundTo": 50
      },
      "hint": "6 mg/kg TBW"
    }
  },
  {
    "name": "Tigecycline",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 200,
      "step": 50,
      "quickValues": [
        100,
        200
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 100
      },
      "hint": "100 mg"
    }
  },
  {
    "name": "Doxycycline",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 200,
      "step": 50,
      "quickValues": [
        100,
        200
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 100
      },
      "hint": "100 mg"
    }
  },
  {
    "name": "Azithromycin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 500,
      "step": 100,
      "quickValues": [
        500
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 500
      },
      "hint": "500 mg"
    }
  },
  {
    "name": "Fluconazole",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 800,
      "step": 100,
      "quickValues": [
        400,
        800
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 400
      },
      "hint": "400 mg"
    }
  },
  {
    "name": "Voriconazole",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 600,
      "step": 50,
      "quickValues": [
        200,
        400,
        600
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 6,
        "basis": "TBW",
        "roundTo": 50
      },
      "hint": "6 mg/kg TBW"
    }
  },
  {
    "name": "Anidulafungin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 200,
      "step": 50,
      "quickValues": [
        100,
        200
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 200
      },
      "hint": "200 mg"
    }
  },
  {
    "name": "Caspofungin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 70,
      "step": 10,
      "quickValues": [
        70
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 70
      },
      "hint": "70 mg"
    }
  },
  {
    "name": "Micafungin",
    "category": "Antimicrobials often given intraoperatively",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 150,
      "step": 50,
      "quickValues": [
        100,
        150
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 100
      },
      "hint": "100 mg"
    }
  },
  {
    "name": "Protamine",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 100,
      "step": 1,
      "quickValues": [
        25,
        50,
        75,
        100
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ]
    }
  },
  {
    "name": "Unfractionated heparin",
    "category": "Hemostasis / anticoagulation / transfusion pharmacology",
    "color": "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    "profile": {
      "min": 0,
      "max": 30000,
      "step": 500,
      "quickValues": [
        5000,
        10000,
        20000,
        30000
      ],
      "unit": "IU",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 80,
        "basis": "TBW",
        "roundTo": 500
      },
      "hint": "80 IU/kg TBW"
    }
  },
  {
    "name": "Tranexamic acid",
    "category": "Neuro / ICP / anticonvulsants",
    "color": "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
    "profile": {
      "min": 0,
      "max": 2000,
      "step": 100,
      "quickValues": [
        500,
        1000,
        1500
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 1000
      },
      "hint": "1000 mg"
    }
  },
  {
    "name": "Desmopressin",
    "category": "Neuro / ICP / anticonvulsants",
    "color": "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
    "profile": {
      "min": 0,
      "max": 40,
      "step": 2,
      "quickValues": [
        4,
        8,
        20,
        40
      ],
      "unit": "mcg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.3,
        "basis": "TBW",
        "roundTo": 2
      },
      "hint": "0.3 mcg/kg TBW"
    }
  },
  {
    "name": "Vitamin K / Phytomenadione",
    "category": "Hemostasis / anticoagulation / transfusion pharmacology",
    "color": "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    "profile": {
      "min": 0,
      "max": 50,
      "step": 1,
      "quickValues": [
        1,
        2,
        5,
        10
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 10
      },
      "hint": "10 mg"
    }
  },
  {
    "name": "Fibrinogen concentrate",
    "category": "Hemostasis / anticoagulation / transfusion pharmacology",
    "color": "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    "profile": {
      "min": 0,
      "max": 4000,
      "step": 500,
      "quickValues": [
        1000,
        2000,
        4000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 2000
      },
      "hint": "2000 mg"
    }
  },
  {
    "name": "Prothrombin complex concentrate 4-factor",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 3000,
      "step": 10,
      "quickValues": [
        500,
        1000,
        2000,
        3000
      ],
      "unit": "IU",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 25,
        "basis": "TBW",
        "roundTo": 10,
        "cap": 3000
      },
      "hint": "25 IU/kg TBW (max 3000 IU)"
    }
  },
  {
    "name": "Activated factor VII / Eptacog alfa",
    "category": "Hemostasis / anticoagulation / transfusion pharmacology",
    "color": "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    "profile": {
      "min": 0,
      "max": 9000,
      "step": 500,
      "quickValues": [
        1000,
        2000,
        4500,
        9000
      ],
      "unit": "mcg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 90,
        "basis": "TBW",
        "roundTo": 500
      },
      "hint": "90 mcg/kg TBW"
    }
  },
  {
    "name": "Bivalirudin",
    "category": "Hemostasis / anticoagulation / transfusion pharmacology",
    "color": "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    "profile": {
      "min": 0,
      "max": 150,
      "step": 10,
      "quickValues": [
        25,
        50,
        75,
        100
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 1,
        "basis": "TBW",
        "roundTo": 10
      },
      "hint": "1 mg/kg TBW"
    }
  },
  {
    "name": "Alteplase",
    "category": "Hemostasis / anticoagulation / transfusion pharmacology",
    "color": "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    "profile": {
      "min": 0,
      "max": 100,
      "step": 10,
      "quickValues": [
        10,
        50,
        100
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 100
      },
      "hint": "100 mg"
    }
  },
  {
    "name": "Tenecteplase",
    "category": "Hemostasis / anticoagulation / transfusion pharmacology",
    "color": "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    "profile": {
      "min": 0,
      "max": 50,
      "step": 5,
      "quickValues": [
        30,
        35,
        40,
        45,
        50
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.53,
        "basis": "TBW",
        "roundTo": 5
      },
      "hint": "0.53 mg/kg TBW"
    }
  },
  {
    "name": "Oxytocin",
    "category": "Obstetric uterotonics / tocolytics",
    "color": "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30",
    "profile": {
      "min": 0,
      "max": 20,
      "step": 1,
      "quickValues": [
        3,
        5,
        10
      ],
      "unit": "IU",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 3
      },
      "hint": "3 IU"
    }
  },
  {
    "name": "Carbetocin",
    "category": "Obstetric uterotonics / tocolytics",
    "color": "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30",
    "profile": {
      "min": 0,
      "max": 100,
      "step": 10,
      "quickValues": [
        100
      ],
      "unit": "mcg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 100
      },
      "hint": "100 mcg"
    }
  },
  {
    "name": "Methylergometrine",
    "category": "Other",
    "color": "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
    "profile": {
      "min": 0,
      "max": 0.5,
      "step": 0.1,
      "quickValues": [
        0.2,
        0.5
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "IM"
      ],
      "doseCalc": {
        "flat": 0.2
      },
      "hint": "0.2 mg"
    }
  },
  {
    "name": "Carboprost",
    "category": "Obstetric uterotonics / tocolytics",
    "color": "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30",
    "profile": {
      "min": 0,
      "max": 0.25,
      "step": 0.25,
      "quickValues": [
        0.25
      ],
      "unit": "mg",
      "routes": [
        "IM"
      ],
      "doseCalc": {
        "flat": 0.25
      },
      "hint": "0.25 mg"
    }
  },
  {
    "name": "Misoprostol",
    "category": "Obstetric uterotonics / tocolytics",
    "color": "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30",
    "profile": {
      "min": 0,
      "max": 1000,
      "step": 200,
      "quickValues": [
        200,
        400,
        600,
        800,
        1000
      ],
      "unit": "mcg",
      "routes": [
        "PR",
        "PO",
        "SL"
      ],
      "doseCalc": {
        "flat": 800
      },
      "hint": "800 mcg"
    }
  },
  {
    "name": "Terbutaline",
    "category": "Respiratory drugs / bronchodilators",
    "color": "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
    "profile": {
      "min": 0,
      "max": 0.5,
      "step": 0.05,
      "quickValues": [
        0.1,
        0.25,
        0.5
      ],
      "unit": "mg",
      "routes": [
        "IV",
        "SC"
      ],
      "doseCalc": {
        "flat": 0.25
      },
      "hint": "0.25 mg"
    }
  },
  {
    "name": "Regular insulin / Actrapid",
    "category": "Endocrine / metabolic / electrolytes",
    "color": "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    "profile": {
      "min": 0,
      "max": 20,
      "step": 1,
      "quickValues": [
        2,
        4,
        6,
        10
      ],
      "unit": "IU",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 4
      },
      "hint": "4 IU"
    }
  },
  {
    "name": "Hydrocortisone",
    "category": "Anaphylaxis / allergy adjuncts",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 200,
      "step": 50,
      "quickValues": [
        50,
        100,
        200
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 100
      },
      "hint": "100 mg"
    }
  },
  {
    "name": "Methylprednisolone",
    "category": "Anaphylaxis / allergy adjuncts",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 3000,
      "step": 10,
      "quickValues": [
        40,
        80,
        125,
        1000,
        3000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 40
      },
      "hint": "40 mg"
    }
  },
  {
    "name": "Sodium bicarbonate",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 100,
      "step": 10,
      "quickValues": [
        20,
        40,
        60,
        80,
        100
      ],
      "unit": "mEq",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 1,
        "basis": "TBW",
        "roundTo": 10
      },
      "hint": "1 mEq/kg TBW"
    }
  },
  {
    "name": "Potassium chloride",
    "category": "Endocrine / metabolic / electrolytes",
    "color": "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    "profile": {
      "min": 0,
      "max": 40,
      "step": 5,
      "quickValues": [
        10,
        20,
        40
      ],
      "unit": "mmol",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 20
      },
      "hint": "20 mmol"
    }
  },
  {
    "name": "Potassium phosphate",
    "category": "Endocrine / metabolic / electrolytes",
    "color": "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    "profile": {
      "min": 0,
      "max": 30,
      "step": 5,
      "quickValues": [
        10,
        15,
        30
      ],
      "unit": "mmol",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 15
      },
      "hint": "15 mmol"
    }
  },
  {
    "name": "Sodium phosphate",
    "category": "Endocrine / metabolic / electrolytes",
    "color": "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    "profile": {
      "min": 0,
      "max": 30,
      "step": 5,
      "quickValues": [
        10,
        15,
        30
      ],
      "unit": "mmol",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 15
      },
      "hint": "15 mmol"
    }
  },
  {
    "name": "Sodium chloride hypertonic (3%)",
    "category": "Other",
    "color": "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
    "profile": {
      "min": 0,
      "max": 500,
      "step": 50,
      "quickValues": [
        100,
        150,
        250,
        500
      ],
      "unit": "mL",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 150
      },
      "hint": "150 mL"
    }
  },
  {
    "name": "Furosemide",
    "category": "Neuro / ICP / anticonvulsants",
    "color": "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
    "profile": {
      "min": 0,
      "max": 100,
      "step": 10,
      "quickValues": [
        10,
        20,
        40,
        80
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 20
      },
      "hint": "20 mg"
    }
  },
  {
    "name": "Salbutamol / Albuterol",
    "category": "Anaphylaxis / allergy adjuncts",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 500,
      "step": 50,
      "quickValues": [
        100,
        250,
        500
      ],
      "unit": "mcg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 250
      },
      "hint": "250 mcg"
    }
  },
  {
    "name": "Aminophylline",
    "category": "Respiratory drugs / bronchodilators",
    "color": "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
    "profile": {
      "min": 0,
      "max": 500,
      "step": 10,
      "quickValues": [
        250,
        500
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 5,
        "basis": "TBW",
        "roundTo": 10
      },
      "hint": "5 mg/kg TBW"
    }
  },
  {
    "name": "Theophylline",
    "category": "Respiratory drugs / bronchodilators",
    "color": "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
    "profile": {
      "min": 0,
      "max": 500,
      "step": 10,
      "quickValues": [
        250,
        500
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 5,
        "basis": "TBW",
        "roundTo": 10
      },
      "hint": "5 mg/kg TBW"
    }
  },
  {
    "name": "Acetylcysteine",
    "category": "Topical airway / nasal / ENT agents",
    "color": "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
    "profile": {
      "min": 0,
      "max": 10000,
      "step": 500,
      "quickValues": [
        2000,
        5000,
        10000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 150,
        "basis": "TBW",
        "roundTo": 500
      },
      "hint": "150 mg/kg TBW (loading dose)"
    }
  },
  {
    "name": "Naloxone",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 2000,
      "step": 40,
      "quickValues": [
        40,
        100,
        400,
        2000
      ],
      "unit": "mcg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 40
      },
      "hint": "40 mcg"
    }
  },
  {
    "name": "Flumazenil",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 1000,
      "step": 100,
      "quickValues": [
        200,
        500,
        1000
      ],
      "unit": "mcg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 200
      },
      "hint": "200 mcg"
    }
  },
  {
    "name": "Dantrolene",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 500,
      "step": 10,
      "quickValues": [
        100,
        200,
        400,
        500
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 2.5,
        "basis": "TBW",
        "roundTo": 10
      },
      "hint": "2.5 mg/kg TBW"
    }
  },
  {
    "name": "Physostigmine",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 2,
      "step": 0.5,
      "quickValues": [
        0.5,
        1,
        2
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 0.5
      },
      "hint": "0.5 mg"
    }
  },
  {
    "name": "Pralidoxime",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 2000,
      "step": 250,
      "quickValues": [
        1000,
        2000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 25,
        "basis": "TBW",
        "roundTo": 250
      },
      "hint": "25 mg/kg TBW"
    }
  },
  {
    "name": "Hyaluronidase",
    "category": "Emergency drugs / antidotes / rescue agents",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 1500,
      "step": 150,
      "quickValues": [
        150,
        750,
        1500
      ],
      "unit": "IU",
      "routes": [
        "SC",
        "Local infiltration"
      ],
      "doseCalc": {
        "flat": 150
      },
      "hint": "150 IU"
    }
  },
  {
    "name": "Levetiracetam",
    "category": "Neuro / ICP / anticonvulsants",
    "color": "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
    "profile": {
      "min": 0,
      "max": 4500,
      "step": 100,
      "quickValues": [
        500,
        1000,
        1500,
        4500
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 20,
        "basis": "TBW",
        "roundTo": 100
      },
      "hint": "20 mg/kg TBW"
    }
  },
  {
    "name": "Phenobarbital",
    "category": "Neuro / ICP / anticonvulsants",
    "color": "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
    "profile": {
      "min": 0,
      "max": 1000,
      "step": 50,
      "quickValues": [
        200,
        600,
        1000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 15,
        "basis": "TBW",
        "roundTo": 50
      },
      "hint": "15 mg/kg TBW"
    }
  },
  {
    "name": "Phenytoin",
    "category": "Neuro / ICP / anticonvulsants",
    "color": "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
    "profile": {
      "min": 0,
      "max": 1500,
      "step": 100,
      "quickValues": [
        500,
        1000,
        1500
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 20,
        "basis": "TBW",
        "roundTo": 100
      },
      "hint": "20 mg/kg TBW"
    }
  },
  {
    "name": "Valproic acid",
    "category": "Other",
    "color": "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
    "profile": {
      "min": 0,
      "max": 3000,
      "step": 100,
      "quickValues": [
        500,
        1000,
        1500,
        3000
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 20,
        "basis": "TBW",
        "roundTo": 100
      },
      "hint": "20 mg/kg TBW"
    }
  },
  {
    "name": "Chlorphenamine / Chlorpheniramine",
    "category": "Anaphylaxis / allergy adjuncts",
    "color": "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "profile": {
      "min": 0,
      "max": 20,
      "step": 10,
      "quickValues": [
        10,
        20
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "flat": 10
      },
      "hint": "10 mg"
    }
  },
  {
    "name": "Galantamine",
    "category": "Other",
    "color": "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
    "profile": {
      "min": 0,
      "max": 50,
      "step": 5,
      "quickValues": [
        10,
        15,
        20,
        30
      ],
      "unit": "mg",
      "routes": [
        "IV"
      ],
      "doseCalc": {
        "perKg": 0.3,
        "basis": "IBW",
        "roundTo": 5
      },
      "hint": "0.3 mg/kg IBW"
    }
  }
]
