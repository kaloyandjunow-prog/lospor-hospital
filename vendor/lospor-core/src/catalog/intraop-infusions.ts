import type { DoseProfileInput } from "./dose-profile"

// INTRAOP_INFUSION catalog — generated from scripts/_drug-library-answers.json
// via scripts/_generate_catalogs.ts.

export type InfusionCatalogEntry = {
  name: string
  color: string
  profile: DoseProfileInput
}

export const INFUSION_CATALOG: InfusionCatalogEntry[] = [
  {
    "name": "Propofol",
    "color": "#8b5cf6",
    "profile": {
      "min": 0,
      "max": 15,
      "step": 0.1,
      "quickValues": [
        2,
        4,
        6,
        8,
        10
      ],
      "unit": "mg/kg/hr",
      "weightBasis": "IBW",
      "suggestedRate": 6
    }
  },
  {
    "name": "Ketamine",
    "color": "#3b82f6",
    "profile": {
      "min": 0,
      "max": 2,
      "step": 0.1,
      "quickValues": [
        0.1,
        0.25,
        0.5,
        1,
        2
      ],
      "unit": "mg/kg/hr",
      "weightBasis": "IBW",
      "suggestedRate": 1
    }
  },
  {
    "name": "Esketamine",
    "color": "#06b6d4",
    "profile": {
      "min": 0,
      "max": 2,
      "step": 0.1,
      "quickValues": [
        0.1,
        0.25,
        0.5,
        1,
        2
      ],
      "unit": "mg/kg/hr",
      "weightBasis": "IBW",
      "suggestedRate": 0.5
    }
  },
  {
    "name": "Dexmedetomidine",
    "color": "#10b981",
    "profile": {
      "min": 0,
      "max": 1.5,
      "step": 0.1,
      "quickValues": [
        0.2,
        0.4,
        0.6,
        1,
        1.4
      ],
      "unit": "mcg/kg/hr",
      "weightBasis": "IBW",
      "suggestedRate": 1
    }
  },
  {
    "name": "Fentanyl",
    "color": "#f59e0b",
    "profile": {
      "min": 0,
      "max": 3,
      "step": 0.1,
      "quickValues": [
        0.5,
        1,
        1.5,
        2,
        3
      ],
      "unit": "mcg/kg/hr",
      "weightBasis": "IBW",
      "suggestedRate": 0.5
    }
  },
  {
    "name": "Sufentanil",
    "color": "#f43f5e",
    "profile": {
      "min": 0,
      "max": 1,
      "step": 0.05,
      "quickValues": [
        0.1,
        0.2,
        0.3,
        0.5,
        0.75
      ],
      "unit": "mcg/kg/hr",
      "weightBasis": "IBW",
      "suggestedRate": 0.1
    }
  },
  {
    "name": "Remifentanil",
    "color": "#6366f1",
    "profile": {
      "min": 0,
      "max": 1,
      "step": 0.025,
      "quickValues": [
        0.05,
        0.1,
        0.15,
        0.25,
        0.5
      ],
      "unit": "mcg/kg/min",
      "weightBasis": "IBW",
      "suggestedRate": 0.1
    }
  },
  {
    "name": "Alfentanil",
    "color": "#ec4899",
    "profile": {
      "min": 0,
      "max": 2,
      "step": 0.1,
      "quickValues": [
        0.25,
        0.5,
        0.75,
        1,
        1.5
      ],
      "unit": "mcg/kg/min",
      "weightBasis": "IBW"
    }
  },
  {
    "name": "Magnesium sulfate",
    "color": "#f97316",
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
      "unit": "g/hr",
      "weightBasis": "none",
      "suggestedRate": 2
    }
  },
  {
    "name": "Lidocaine",
    "color": "#14b8a6",
    "profile": {
      "routes": [
        "IV",
        "PD",
        "IT",
        "Perineural"
      ],
      "routeModes": {
        "IV": {
          "mode": "rate",
          "min": 0,
          "max": 10,
          "step": 0.1,
          "quickValues": [
            1,
            2,
            4,
            6
          ],
          "unit": "mg/kg/hr",
          "weightBasis": "IBW",
          "suggestedRate": 1
        },
        "PD": {
          "mode": "concentration-rate",
          "min": 0,
          "max": 50,
          "step": 1,
          "quickValues": [
            2,
            4,
            6,
            8,
            10
          ],
          "unit": "mL/hr",
          "concentrationOptions": [
            "0.25%",
            "0.5%",
            "1%",
            "2%",
            "4%"
          ],
          "suggestedRate": 6,
          "suggestedConcentration": "1%"
        },
        "IT": {
          "mode": "concentration-rate",
          "min": 0,
          "max": 50,
          "step": 1,
          "quickValues": [
            2,
            4,
            6,
            8,
            10
          ],
          "unit": "mL/hr",
          "concentrationOptions": [
            "0.25%",
            "0.5%",
            "1%",
            "2%",
            "4%"
          ],
          "suggestedRate": 6,
          "suggestedConcentration": "1%"
        },
        "Perineural": {
          "mode": "concentration-rate",
          "min": 0,
          "max": 50,
          "step": 1,
          "quickValues": [
            2,
            4,
            6,
            8,
            10
          ],
          "unit": "mL/hr",
          "concentrationOptions": [
            "0.25%",
            "0.5%",
            "1%",
            "2%",
            "4%"
          ],
          "suggestedRate": 6,
          "suggestedConcentration": "1%"
        }
      }
    }
  },
  {
    "name": "Bupivacaine",
    "color": "#0ea5e9",
    "profile": {
      "routes": [
        "PD",
        "IT",
        "Perineural"
      ],
      "routeModes": {
        "PD": {
          "mode": "concentration-rate",
          "min": 0,
          "max": 50,
          "step": 1,
          "quickValues": [
            2,
            4,
            6,
            8,
            10
          ],
          "unit": "mL/hr",
          "concentrationOptions": [
            "0.1%",
            "0.125%",
            "0.2%",
            "0.25%",
            "0.5%"
          ],
          "suggestedRate": 6,
          "suggestedConcentration": "0.2%"
        },
        "IT": {
          "mode": "concentration-rate",
          "min": 0,
          "max": 50,
          "step": 1,
          "quickValues": [
            2,
            4,
            6,
            8,
            10
          ],
          "unit": "mL/hr",
          "concentrationOptions": [
            "0.1%",
            "0.125%",
            "0.2%",
            "0.25%",
            "0.5%"
          ],
          "suggestedRate": 6,
          "suggestedConcentration": "0.2%"
        },
        "Perineural": {
          "mode": "concentration-rate",
          "min": 0,
          "max": 50,
          "step": 1,
          "quickValues": [
            2,
            4,
            6,
            8,
            10
          ],
          "unit": "mL/hr",
          "concentrationOptions": [
            "0.1%",
            "0.125%",
            "0.2%",
            "0.25%",
            "0.5%"
          ],
          "suggestedRate": 6,
          "suggestedConcentration": "0.2%"
        }
      }
    }
  },
  {
    "name": "Levobupivacaine",
    "color": "#6366f1",
    "profile": {
      "routes": [
        "PD",
        "IT",
        "Perineural"
      ],
      "routeModes": {
        "PD": {
          "mode": "concentration-rate",
          "min": 0,
          "max": 50,
          "step": 1,
          "quickValues": [
            2,
            4,
            6,
            8,
            10
          ],
          "unit": "mL/hr",
          "concentrationOptions": [
            "0.1%",
            "0.125%",
            "0.2%",
            "0.25%",
            "0.5%"
          ],
          "suggestedRate": 6,
          "suggestedConcentration": "0.2%"
        },
        "IT": {
          "mode": "concentration-rate",
          "min": 0,
          "max": 50,
          "step": 1,
          "quickValues": [
            2,
            4,
            6,
            8,
            10
          ],
          "unit": "mL/hr",
          "concentrationOptions": [
            "0.1%",
            "0.125%",
            "0.2%",
            "0.25%",
            "0.5%"
          ],
          "suggestedRate": 6,
          "suggestedConcentration": "0.2%"
        },
        "Perineural": {
          "mode": "concentration-rate",
          "min": 0,
          "max": 50,
          "step": 1,
          "quickValues": [
            2,
            4,
            6,
            8,
            10
          ],
          "unit": "mL/hr",
          "concentrationOptions": [
            "0.1%",
            "0.125%",
            "0.2%",
            "0.25%",
            "0.5%"
          ],
          "suggestedRate": 6,
          "suggestedConcentration": "0.2%"
        }
      }
    }
  },
  {
    "name": "Ropivacaine",
    "color": "#a855f7",
    "profile": {
      "routes": [
        "PD",
        "IT",
        "Perineural"
      ],
      "routeModes": {
        "PD": {
          "mode": "concentration-rate",
          "min": 0,
          "max": 50,
          "step": 1,
          "quickValues": [
            2,
            4,
            6,
            8,
            10
          ],
          "unit": "mL/hr",
          "concentrationOptions": [
            "0.1%",
            "0.125%",
            "0.2%",
            "0.25%",
            "0.5%"
          ],
          "suggestedRate": 6,
          "suggestedConcentration": "0.2%"
        },
        "IT": {
          "mode": "concentration-rate",
          "min": 0,
          "max": 50,
          "step": 1,
          "quickValues": [
            2,
            4,
            6,
            8,
            10
          ],
          "unit": "mL/hr",
          "concentrationOptions": [
            "0.1%",
            "0.125%",
            "0.2%",
            "0.25%",
            "0.5%"
          ],
          "suggestedRate": 6,
          "suggestedConcentration": "0.2%"
        },
        "Perineural": {
          "mode": "concentration-rate",
          "min": 0,
          "max": 50,
          "step": 1,
          "quickValues": [
            2,
            4,
            6,
            8,
            10
          ],
          "unit": "mL/hr",
          "concentrationOptions": [
            "0.1%",
            "0.125%",
            "0.2%",
            "0.25%",
            "0.5%"
          ],
          "suggestedRate": 6,
          "suggestedConcentration": "0.2%"
        }
      }
    }
  },
  {
    "name": "Rocuronium",
    "color": "#d946ef",
    "profile": {
      "min": 0,
      "max": 1,
      "step": 0.05,
      "quickValues": [
        0.3,
        0.4,
        0.5,
        0.6
      ],
      "unit": "mg/kg/hr",
      "weightBasis": "IBW",
      "suggestedRate": 0.5
    }
  },
  {
    "name": "Vecuronium",
    "color": "#84cc16",
    "profile": {
      "min": 0,
      "max": 0.2,
      "step": 0.01,
      "quickValues": [
        0.05,
        0.08,
        0.1,
        0.15
      ],
      "unit": "mg/kg/hr",
      "weightBasis": "IBW",
      "suggestedRate": 0.05
    }
  },
  {
    "name": "Cisatracurium",
    "color": "#8b5cf6",
    "profile": {
      "min": 0,
      "max": 0.5,
      "step": 0.1,
      "quickValues": [
        0.1,
        0.2,
        0.3,
        0.4,
        0.5
      ],
      "unit": "mg/kg/hr",
      "weightBasis": "IBW",
      "suggestedRate": 0.3
    }
  },
  {
    "name": "Atracurium",
    "color": "#3b82f6",
    "profile": {
      "min": 0,
      "max": 0.5,
      "step": 0.1,
      "quickValues": [
        0.1,
        0.2,
        0.3,
        0.4,
        0.5
      ],
      "unit": "mg/kg/hr",
      "weightBasis": "IBW",
      "suggestedRate": 0.3
    }
  },
  {
    "name": "Mivacurium",
    "color": "#06b6d4",
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
      "unit": "mcg/kg/min",
      "weightBasis": "IBW",
      "suggestedRate": 5
    }
  },
  {
    "name": "Phenylephrine",
    "color": "#10b981",
    "profile": {
      "min": 0,
      "max": 2,
      "step": 0.1,
      "quickValues": [
        0.25,
        0.5,
        0.75,
        1,
        1.5
      ],
      "unit": "mcg/kg/min",
      "weightBasis": "IBW",
      "suggestedRate": 0.5
    }
  },
  {
    "name": "Norepinephrine / Noradrenaline",
    "color": "#f59e0b",
    "profile": {
      "min": 0,
      "max": 3,
      "step": 0.01,
      "quickValues": [
        0.05,
        0.1,
        0.25,
        0.3,
        0.5
      ],
      "unit": "mcg/kg/min",
      "weightBasis": "IBW",
      "suggestedRate": 0.05
    }
  },
  {
    "name": "Epinephrine / Adrenaline",
    "color": "#f43f5e",
    "profile": {
      "min": 0,
      "max": 3,
      "step": 0.01,
      "quickValues": [
        0.05,
        0.1,
        0.25,
        0.3,
        0.5
      ],
      "unit": "mcg/kg/min",
      "weightBasis": "IBW",
      "suggestedRate": 0.05
    }
  },
  {
    "name": "Metaraminol",
    "color": "#6366f1",
    "profile": {
      "min": 0,
      "max": 1,
      "step": 0.1,
      "quickValues": [
        0.2,
        0.5,
        0.8,
        1
      ],
      "unit": "mg/hr",
      "weightBasis": "none",
      "suggestedRate": 0.5
    }
  },
  {
    "name": "Dopamine",
    "color": "#ec4899",
    "profile": {
      "min": 0,
      "max": 20,
      "step": 1,
      "quickValues": [
        2,
        5,
        10,
        15
      ],
      "unit": "mcg/kg/min",
      "weightBasis": "IBW",
      "suggestedRate": 5
    }
  },
  {
    "name": "Vasopressin",
    "color": "#f97316",
    "profile": {
      "min": 0,
      "max": 0.1,
      "step": 0.01,
      "quickValues": [
        0.01,
        0.02,
        0.04,
        0.06
      ],
      "unit": "IU/min",
      "weightBasis": "none",
      "suggestedRate": 0.02
    }
  },
  {
    "name": "Angiotensin II",
    "color": "#14b8a6",
    "profile": {
      "min": 0,
      "max": 80,
      "step": 5,
      "quickValues": [
        10,
        20,
        40,
        80
      ],
      "unit": "ng/kg/min",
      "weightBasis": "IBW",
      "suggestedRate": 20
    }
  },
  {
    "name": "Dobutamine",
    "color": "#d946ef",
    "profile": {
      "min": 0,
      "max": 20,
      "step": 0.5,
      "quickValues": [
        2.5,
        5,
        7.5,
        10,
        15
      ],
      "unit": "mcg/kg/min",
      "weightBasis": "IBW",
      "suggestedRate": 5
    }
  },
  {
    "name": "Milrinone",
    "color": "#84cc16",
    "profile": {
      "min": 0,
      "max": 0.75,
      "step": 0.05,
      "quickValues": [
        0.125,
        0.25,
        0.375,
        0.5,
        0.75
      ],
      "unit": "mcg/kg/min",
      "weightBasis": "IBW",
      "suggestedRate": 0.375
    }
  },
  {
    "name": "Levosimendan",
    "color": "#8b5cf6",
    "profile": {
      "min": 0,
      "max": 0.2,
      "step": 0.01,
      "quickValues": [
        0.05,
        0.1,
        0.15,
        0.2
      ],
      "unit": "mcg/kg/min",
      "weightBasis": "IBW",
      "suggestedRate": 0.1
    }
  },
  {
    "name": "Isoproterenol / Isoprenaline",
    "color": "#3b82f6",
    "profile": {
      "min": 0,
      "max": 10,
      "step": 0.5,
      "quickValues": [
        0.5,
        1,
        2,
        5
      ],
      "unit": "mcg/min",
      "weightBasis": "none",
      "suggestedRate": 2
    }
  },
  {
    "name": "Nitroglycerin / Glyceryl trinitrate",
    "color": "#06b6d4",
    "profile": {
      "min": 0,
      "max": 5,
      "step": 0.1,
      "quickValues": [
        0.5,
        1,
        2,
        3,
        5
      ],
      "unit": "mcg/kg/min",
      "weightBasis": "IBW",
      "suggestedRate": 1
    }
  },
  {
    "name": "Sodium nitroprusside",
    "color": "#10b981",
    "profile": {
      "min": 0,
      "max": 10,
      "step": 0.1,
      "quickValues": [
        0.3,
        0.5,
        1,
        2,
        3
      ],
      "unit": "mcg/kg/min",
      "weightBasis": "IBW",
      "suggestedRate": 0.5
    }
  },
  {
    "name": "Nicardipine",
    "color": "#f59e0b",
    "profile": {
      "min": 0,
      "max": 15,
      "step": 0.5,
      "quickValues": [
        2.5,
        5,
        7.5,
        10,
        15
      ],
      "unit": "mg/hr",
      "weightBasis": "none",
      "suggestedRate": 5
    }
  },
  {
    "name": "Clevidipine",
    "color": "#f43f5e",
    "profile": {
      "min": 0,
      "max": 32,
      "step": 1,
      "quickValues": [
        2,
        4,
        8,
        16,
        32
      ],
      "unit": "mg/hr",
      "weightBasis": "none",
      "suggestedRate": 4
    }
  },
  {
    "name": "Esmolol",
    "color": "#6366f1",
    "profile": {
      "min": 0,
      "max": 200,
      "step": 25,
      "quickValues": [
        25,
        50,
        100,
        150,
        200
      ],
      "unit": "mcg/kg/min",
      "weightBasis": "IBW",
      "suggestedRate": 50
    }
  },
  {
    "name": "Labetalol",
    "color": "#ec4899",
    "profile": {
      "min": 0,
      "max": 8,
      "step": 0.5,
      "quickValues": [
        1,
        2,
        4,
        8
      ],
      "unit": "mg/min",
      "weightBasis": "none",
      "suggestedRate": 2
    }
  },
  {
    "name": "Epoprostenol",
    "color": "#f97316",
    "profile": {
      "min": 0,
      "max": 10,
      "step": 1,
      "quickValues": [
        1,
        2,
        4,
        6,
        10
      ],
      "unit": "ng/kg/min",
      "weightBasis": "IBW",
      "suggestedRate": 2
    }
  },
  {
    "name": "Iloprost",
    "color": "#14b8a6",
    "profile": {
      "min": 0,
      "max": 2,
      "step": 0.1,
      "quickValues": [
        0.5,
        1,
        1.5,
        2
      ],
      "unit": "ng/kg/min",
      "weightBasis": "IBW",
      "suggestedRate": 1
    }
  },
  {
    "name": "Amiodarone",
    "color": "#d946ef",
    "profile": {
      "min": 0,
      "max": 20,
      "step": 1,
      "quickValues": [
        5,
        10,
        15,
        20
      ],
      "unit": "mL/hr",
      "weightBasis": "none",
      "suggestedRate": 10,
      "prepStrength": {
        "mg": 300,
        "mL": 50
      }
    }
  },
  {
    "name": "Diltiazem",
    "color": "#84cc16",
    "profile": {
      "min": 0,
      "max": 15,
      "step": 1,
      "quickValues": [
        5,
        10,
        15
      ],
      "unit": "mg/hr",
      "weightBasis": "none",
      "suggestedRate": 10
    }
  },
  {
    "name": "Octreotide",
    "color": "#8b5cf6",
    "profile": {
      "min": 0,
      "max": 100,
      "step": 5,
      "quickValues": [
        25,
        50,
        75,
        100
      ],
      "unit": "mcg/hr",
      "weightBasis": "none",
      "suggestedRate": 50
    }
  },
  {
    "name": "Unfractionated heparin",
    "color": "#3b82f6",
    "profile": {
      "min": 0,
      "max": 25,
      "step": 1,
      "quickValues": [
        10,
        15,
        18,
        20
      ],
      "unit": "IU/kg/hr",
      "weightBasis": "TBW"
    }
  },
  {
    "name": "Bivalirudin",
    "color": "#06b6d4",
    "profile": {
      "min": 0,
      "max": 2.5,
      "step": 0.1,
      "quickValues": [
        0.5,
        1,
        1.75,
        2.5
      ],
      "unit": "mg/kg/hr",
      "weightBasis": "TBW",
      "suggestedRate": 1.75
    }
  },
  {
    "name": "Argatroban",
    "color": "#10b981",
    "profile": {
      "min": 0,
      "max": 10,
      "step": 0.5,
      "quickValues": [
        0.5,
        1,
        2,
        5
      ],
      "unit": "mcg/kg/min",
      "weightBasis": "TBW",
      "suggestedRate": 2
    }
  },
  {
    "name": "Oxytocin",
    "color": "#f59e0b",
    "profile": {
      "min": 0,
      "max": 40,
      "step": 5,
      "quickValues": [
        10,
        20,
        30,
        40
      ],
      "unit": "IU/hr",
      "weightBasis": "none",
      "suggestedRate": 10
    }
  },
  {
    "name": "Regular insulin / Actrapid",
    "color": "#f43f5e",
    "profile": {
      "min": 0,
      "max": 10,
      "step": 0.1,
      "quickValues": [
        1,
        2,
        4,
        6
      ],
      "unit": "IU/hr",
      "weightBasis": "none",
      "suggestedRate": 2
    }
  },
  {
    "name": "Furosemide",
    "color": "#6366f1",
    "profile": {
      "min": 0,
      "max": 10,
      "step": 1,
      "quickValues": [
        2,
        4,
        8
      ],
      "unit": "mg/hr",
      "weightBasis": "none"
    }
  },
  {
    "name": "Aminophylline",
    "color": "#ec4899",
    "profile": {
      "min": 0,
      "max": 1,
      "step": 0.1,
      "quickValues": [
        0.3,
        0.5,
        0.7
      ],
      "unit": "mg/kg/hr",
      "weightBasis": "TBW"
    }
  },
  {
    "name": "Nimodipine",
    "color": "#f97316",
    "profile": {
      "min": 0,
      "max": 2,
      "step": 0.1,
      "quickValues": [
        0.5,
        1,
        2
      ],
      "unit": "mg/hr",
      "weightBasis": "none",
      "suggestedRate": 1
    }
  }
]
