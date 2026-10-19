import type { DoseProfileInput } from "./dose-profile"

// INTRAOP_INFUSION catalog — generated from scripts/_drug-library-answers.json
// via scripts/_generate_catalogs.ts.

export type InfusionCatalogEntry = {
  name: string
  /** WHO ATC code — see the note on DrugCatalogEntry.atcCode. A substance that
   *  is in both catalogs (propofol, fentanyl, the local anaesthetics) carries
   *  the same code in both: a bolus and an infusion of one drug are the same
   *  drug, and catalog.test.ts fails the build if they ever drift apart. */
  atcCode?: string
  /** The menu group (the drug groups, 2026-10-18); menus only, never part of a rule. */
  category: string
  color: string
  profile: DoseProfileInput
}

export const INFUSION_CATALOG: InfusionCatalogEntry[] = [
  {
    "name": "Propofol",
    "atcCode": "N01AX10",
    "category": "Intravenous hypnotics / general anesthetics",
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
    "atcCode": "N01AX03",
    "category": "Intravenous hypnotics / general anesthetics",
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
    "atcCode": "N01AX14",
    "category": "Intravenous hypnotics / general anesthetics",
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
    "atcCode": "N05CM18",
    "category": "Sedatives / anxiolytics / alpha-2 agonists",
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
    "atcCode": "N01AH01",
    "category": "Opioid analgesics",
    "color": "#f59e0b",
    "profile": {
      "routes": [
        "IV",
        "PD"
      ],
      "routeModes": {
        "IV": {
          "mode": "rate",
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
        },
        "PD": {
          "mode": "rate",
          "min": 0,
          "max": 100,
          "step": 1,
          "quickValues": [
            10,
            20,
            30,
            50
          ],
          "unit": "mcg/hr",
          "weightBasis": "none"
        }
      }
    }
  },
  {
    "name": "Sufentanil",
    "atcCode": "N01AH03",
    "category": "Opioid analgesics",
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
    "atcCode": "N01AH06",
    "category": "Opioid analgesics",
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
    "atcCode": "N01AH02",
    "category": "Opioid analgesics",
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
    "atcCode": "A12CC02",
    "category": "Non-opioid analgesics / analgesic adjuncts",
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
    "atcCode": "N01BB02",
    "category": "Non-opioid analgesics / analgesic adjuncts",
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
    "atcCode": "N01BB01",
    "category": "Local/regional anesthetics",
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
    "atcCode": "N01BB10",
    "category": "Local/regional anesthetics",
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
    "atcCode": "N01BB09",
    "category": "Local/regional anesthetics",
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
    "atcCode": "M03AC09",
    "category": "Neuromuscular blocking drugs",
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
    "atcCode": "M03AC03",
    "category": "Neuromuscular blocking drugs",
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
    "atcCode": "M03AC11",
    "category": "Neuromuscular blocking drugs",
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
    "atcCode": "M03AC04",
    "category": "Neuromuscular blocking drugs",
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
    "atcCode": "M03AC10",
    "category": "Neuromuscular blocking drugs",
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
    "atcCode": "C01CA06",
    "category": "Vasoactive drugs - vasopressors / vasoconstrictors",
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
    "atcCode": "C01CA03",
    "category": "Vasoactive drugs - vasopressors / vasoconstrictors",
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
    "atcCode": "C01CA24",
    "category": "Vasoactive drugs - vasopressors / vasoconstrictors",
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
    "atcCode": "C01CA09",
    "category": "Vasoactive drugs - vasopressors / vasoconstrictors",
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
    "atcCode": "C01CA04",
    "category": "Vasoactive drugs - inotropes / inodilators",
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
    "atcCode": "H01BA01",
    "category": "Vasoactive drugs - vasopressors / vasoconstrictors",
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
    "atcCode": "C01CX09",
    "category": "Vasoactive drugs - vasopressors / vasoconstrictors",
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
    "atcCode": "C01CA07",
    "category": "Vasoactive drugs - inotropes / inodilators",
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
    "atcCode": "C01CE02",
    "category": "Vasoactive drugs - inotropes / inodilators",
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
    "atcCode": "C01CX08",
    "category": "Vasoactive drugs - inotropes / inodilators",
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
    "atcCode": "C01CA02",
    "category": "Vasoactive drugs - inotropes / inodilators",
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
    "atcCode": "C01DA02",
    "category": "Vasoactive drugs - antihypertensives / vasodilators",
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
    "atcCode": "C02DD01",
    "category": "Vasoactive drugs - antihypertensives / vasodilators",
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
    "atcCode": "C08CA04",
    "category": "Vasoactive drugs - antihypertensives / vasodilators",
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
    "atcCode": "C08CA16",
    "category": "Vasoactive drugs - antihypertensives / vasodilators",
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
    "atcCode": "C07AB09",
    "category": "Antiarrhythmics / cardiac rate control",
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
    "atcCode": "C07AG01",
    "category": "Vasoactive drugs - antihypertensives / vasodilators",
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
    "atcCode": "B01AC09",
    "category": "Vasoactive drugs - antihypertensives / vasodilators",
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
    "atcCode": "B01AC11",
    "category": "Vasoactive drugs - antihypertensives / vasodilators",
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
    "atcCode": "C01BD01",
    "category": "Antiarrhythmics / cardiac rate control",
    "color": "#d946ef",
    "profile": {
      "min": 0,
      "max": 60,
      "step": 0.5,
      "quickValues": [
        15,
        30,
        37.5,
        60
      ],
      "unit": "mg/hr",
      "weightBasis": "none",
      "suggestedRate": 37.5
    }
  },
  {
    "name": "Diltiazem",
    "atcCode": "C08DB01",
    "category": "Antiarrhythmics / cardiac rate control",
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
    "atcCode": "H01CB02",
    "category": "Acid suppression / aspiration prophylaxis / GI adjuncts",
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
    "atcCode": "B01AB01",
    "category": "Hemostasis / anticoagulation / transfusion pharmacology",
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
    "atcCode": "B01AE06",
    "category": "Hemostasis / anticoagulation / transfusion pharmacology",
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
    "atcCode": "B01AE03",
    "category": "Hemostasis / anticoagulation / transfusion pharmacology",
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
    "atcCode": "H01BB02",
    "category": "Obstetric uterotonics / tocolytics",
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
    "atcCode": "A10AB01",
    "category": "Endocrine / metabolic / electrolytes",
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
    "atcCode": "C03CA01",
    "category": "Endocrine / metabolic / electrolytes",
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
    "atcCode": "R03DA05",
    "category": "Respiratory drugs / bronchodilators",
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
    "atcCode": "C08CA06",
    "category": "Neuro / ICP / anticonvulsants",
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
  },
  {
    "name": "Midazolam",
    "atcCode": "N05CD08",
    "category": "Sedatives / anxiolytics / alpha-2 agonists",
    "color": "#10b981",
    "profile": {
      "min": 0,
      "max": 0.3,
      "step": 0.01,
      "quickValues": [
        0.02,
        0.05,
        0.1,
        0.15,
        0.2
      ],
      "unit": "mg/kg/hr",
      "weightBasis": "IBW",
      "suggestedRate": 0.05
    }
  },
  {
    "name": "Remimazolam",
    "atcCode": "N05CD14",
    "category": "Intravenous hypnotics / general anesthetics",
    "color": "#3b82f6",
    "profile": {
      "min": 0,
      "max": 2.5,
      "step": 0.1,
      "quickValues": [
        0.5,
        1,
        1.5,
        2
      ],
      "unit": "mg/kg/hr",
      "weightBasis": "IBW",
      "suggestedRate": 1
    }
  },
  {
    "name": "Clonidine",
    "atcCode": "C02AC01",
    "category": "Sedatives / anxiolytics / alpha-2 agonists",
    "color": "#10b981",
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
      "unit": "mcg/kg/hr",
      "weightBasis": "IBW",
      "suggestedRate": 0.5
    }
  },
  {
    "name": "Thiopental / Thiopentone",
    "atcCode": "N01AF03",
    "category": "Neuro / ICP / anticonvulsants",
    "color": "#8b5cf6",
    "profile": {
      "min": 0,
      "max": 5,
      "step": 0.5,
      "quickValues": [
        1,
        2,
        3,
        5
      ],
      "unit": "mg/kg/hr",
      "weightBasis": "IBW"
    }
  },
  {
    "name": "Morphine",
    "atcCode": "N02AA01",
    "category": "Opioid analgesics",
    "color": "#6366f1",
    "profile": {
      "min": 0,
      "max": 10,
      "step": 0.5,
      "quickValues": [
        1,
        2,
        3,
        4,
        5
      ],
      "unit": "mg/hr",
      "weightBasis": "none",
      "suggestedRate": 2
    }
  },
  {
    "name": "Urapidil",
    "atcCode": "C02CA06",
    "category": "Vasoactive drugs - antihypertensives / vasodilators",
    "color": "#10b981",
    "profile": {
      "min": 0,
      "max": 30,
      "step": 1,
      "quickValues": [
        5,
        9,
        15,
        20,
        30
      ],
      "unit": "mg/hr",
      "weightBasis": "none",
      "suggestedRate": 9
    }
  },
  {
    "name": "Methylene blue",
    "atcCode": "V03AB17",
    "category": "Vasoactive drugs - vasopressors / vasoconstrictors",
    "color": "#a855f7",
    "profile": {
      "min": 0,
      "max": 2,
      "step": 0.05,
      "quickValues": [
        0.25,
        0.5,
        1,
        2
      ],
      "unit": "mg/kg/hr",
      "weightBasis": "IBW"
    }
  },
  {
    "name": "Tranexamic acid",
    "atcCode": "B02AA02",
    "category": "Hemostasis / anticoagulation / transfusion pharmacology",
    "color": "#6366f1",
    "profile": {
      "min": 0,
      "max": 16,
      "step": 0.5,
      "quickValues": [
        1,
        2,
        5,
        10
      ],
      "unit": "mg/kg/hr",
      "weightBasis": "IBW"
    }
  },
  {
    "name": "Potassium chloride",
    "atcCode": "B05XA01",
    "category": "Endocrine / metabolic / electrolytes",
    "color": "#f59e0b",
    "profile": {
      "min": 0,
      "max": 40,
      "step": 1,
      "quickValues": [
        5,
        10,
        15,
        20
      ],
      "unit": "mmol/hr",
      "weightBasis": "none"
    }
  },
  {
    "name": "Calcium gluconate",
    "atcCode": "A12AA03",
    "category": "Endocrine / metabolic / electrolytes",
    "color": "#f59e0b",
    "profile": {
      "min": 0,
      "max": 5,
      "step": 0.5,
      "quickValues": [
        0.5,
        1,
        2
      ],
      "unit": "g/hr",
      "weightBasis": "none"
    }
  },
  {
    "name": "Calcium chloride",
    "atcCode": "A12AA07",
    "category": "Endocrine / metabolic / electrolytes",
    "color": "#f59e0b",
    "profile": {
      "min": 0,
      "max": 2,
      "step": 0.05,
      "quickValues": [
        0.25,
        0.5,
        1
      ],
      "unit": "g/hr",
      "weightBasis": "none"
    }
  },
  {
    "name": "Sodium bicarbonate",
    "atcCode": "B05XA02",
    "category": "Endocrine / metabolic / electrolytes",
    "color": "#f59e0b",
    "profile": {
      "min": 0,
      "max": 100,
      "step": 1,
      "quickValues": [
        10,
        25,
        50
      ],
      "unit": "mEq/hr",
      "weightBasis": "none"
    }
  },
  {
    "name": "Hydrocortisone",
    "atcCode": "H02AB09",
    "category": "Anaphylaxis / allergy adjuncts",
    "color": "#f43f5e",
    "profile": {
      "min": 0,
      "max": 20,
      "step": 1,
      "quickValues": [
        5,
        8,
        10
      ],
      "unit": "mg/hr",
      "weightBasis": "none",
      "suggestedRate": 8
    }
  },
  {
    "name": "Pantoprazole",
    "atcCode": "A02BC02",
    "category": "Acid suppression / aspiration prophylaxis / GI adjuncts",
    "color": "#84cc16",
    "profile": {
      "min": 0,
      "max": 10,
      "step": 1,
      "quickValues": [
        8
      ],
      "unit": "mg/hr",
      "weightBasis": "none",
      "suggestedRate": 8
    }
  },
  {
    "name": "Somatostatin",
    "atcCode": "H01CB01",
    "category": "Acid suppression / aspiration prophylaxis / GI adjuncts",
    "color": "#84cc16",
    "profile": {
      "min": 0,
      "max": 500,
      "step": 25,
      "quickValues": [
        250,
        500
      ],
      "unit": "mcg/hr",
      "weightBasis": "none",
      "suggestedRate": 250
    }
  }
]
