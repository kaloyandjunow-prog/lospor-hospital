import type { DoseProfileInput } from "./dose-profile"

// INTRAOP_FLUID catalog — generated from scripts/_drug-library-answers.json
// via scripts/_generate_catalogs.ts.

export type FluidCatalogEntry = {
  name: string
  category: string
  color: string
  profile: DoseProfileInput
}

export const FLUID_CATALOG: FluidCatalogEntry[] = [
  {
    "name": "HES",
    "category": "Colloids",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "mode": "concentration",
      "min": 0,
      "max": 2000,
      "step": 50,
      "quickValues": [
        250,
        500,
        1000,
        1500
      ],
      "unit": "mL",
      "concentrationOptions": [
        "6%",
        "10%"
      ],
      "defaultConcentration": "10%"
    }
  },
  {
    "name": "Gelatin 4%",
    "category": "Colloids",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 2000,
      "step": 50,
      "quickValues": [
        250,
        500,
        1000,
        1500
      ],
      "unit": "mL"
    }
  },
  {
    "name": "Albumin 5%",
    "category": "Colloids",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 1000,
      "step": 50,
      "quickValues": [
        100,
        250,
        500
      ],
      "unit": "mL"
    }
  },
  {
    "name": "Albumin 20%",
    "category": "Colloids",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 200,
      "step": 10,
      "quickValues": [
        50,
        100,
        200
      ],
      "unit": "mL"
    }
  },
  {
    "name": "Albumin 25%",
    "category": "Colloids",
    "color": "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "profile": {
      "min": 0,
      "max": 200,
      "step": 10,
      "quickValues": [
        50,
        100,
        200
      ],
      "unit": "mL"
    }
  },
  {
    "name": "Mannitol",
    "category": "Other",
    "color": "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
    "profile": {
      "mode": "concentration",
      "min": 0,
      "max": 1000,
      "step": 50,
      "quickValues": [
        100,
        250,
        500
      ],
      "unit": "mL",
      "concentrationOptions": [
        "10%",
        "15%"
      ],
      "suggestedVolume": 50
    }
  },
  {
    "name": "Lipid emulsion 20%",
    "category": "Other",
    "color": "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
    "profile": {
      "min": 0,
      "max": 1000,
      "step": 10,
      "quickValues": [
        50,
        100,
        150
      ],
      "unit": "mL",
      "doseCalc": {
        "perKg": 1.5,
        "basis": "TBW",
        "roundTo": 10
      },
      "hint": "1.5 mL/kg TBW"
    }
  },
  {
    "name": "Saline",
    "category": "Crystalloids",
    "color": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30",
    "profile": {
      "mode": "concentration",
      "min": 0,
      "max": 2000,
      "step": 100,
      "quickValues": [
        250,
        500,
        1000,
        2000
      ],
      "unit": "mL",
      "concentrationOptions": [
        "0.225%",
        "0.45%",
        "0.9%",
        "3%",
        "20%"
      ],
      "defaultConcentration": "0.9%",
      "suggestedVolume": 500
    }
  },
  {
    "name": "Lactated Ringer's / Hartmann's",
    "category": "Crystalloids",
    "color": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30",
    "profile": {
      "min": 0,
      "max": 2000,
      "step": 100,
      "quickValues": [
        250,
        500,
        1000,
        2000
      ],
      "unit": "mL",
      "suggestedVolume": 500
    }
  },
  {
    "name": "Plasma-Lyte",
    "category": "Crystalloids",
    "color": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30",
    "profile": {
      "min": 0,
      "max": 2000,
      "step": 100,
      "quickValues": [
        250,
        500,
        1000,
        2000
      ],
      "unit": "mL",
      "suggestedVolume": 500
    }
  },
  {
    "name": "Ringer's acetate",
    "category": "Crystalloids",
    "color": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30",
    "profile": {
      "min": 0,
      "max": 2000,
      "step": 100,
      "quickValues": [
        250,
        500,
        1000,
        2000
      ],
      "unit": "mL",
      "suggestedVolume": 500
    }
  },
  {
    "name": "Dextrose 5% (D5W)",
    "category": "Crystalloids",
    "color": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30",
    "profile": {
      "min": 0,
      "max": 2000,
      "step": 100,
      "quickValues": [
        250,
        500,
        1000,
        2000
      ],
      "unit": "mL",
      "suggestedVolume": 500
    }
  },
  {
    "name": "Dextrose 5% in 0.9% saline (D5NS)",
    "category": "Crystalloids",
    "color": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30",
    "profile": {
      "min": 0,
      "max": 2000,
      "step": 100,
      "quickValues": [
        250,
        500,
        1000,
        2000
      ],
      "unit": "mL",
      "suggestedVolume": 500
    }
  },
  {
    "name": "Dextrose 5% in 0.45% saline (D5 1/2NS)",
    "category": "Crystalloids",
    "color": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30",
    "profile": {
      "min": 0,
      "max": 2000,
      "step": 100,
      "quickValues": [
        250,
        500,
        1000,
        2000
      ],
      "unit": "mL",
      "suggestedVolume": 500
    }
  },
  {
    "name": "Dextrose 5% in Lactated Ringer's (D5LR)",
    "category": "Crystalloids",
    "color": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30",
    "profile": {
      "min": 0,
      "max": 2000,
      "step": 100,
      "quickValues": [
        250,
        500,
        1000,
        2000
      ],
      "unit": "mL",
      "suggestedVolume": 500
    }
  },
  {
    "name": "Dextrose 10% (D10W)",
    "category": "Crystalloids",
    "color": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30",
    "profile": {
      "min": 0,
      "max": 1000,
      "step": 50,
      "quickValues": [
        100,
        250,
        500,
        1000
      ],
      "unit": "mL",
      "suggestedVolume": 250
    }
  },
  {
    "name": "Packed red blood cells (PRBC)",
    "category": "Blood products",
    "color": "bg-lime-100 text-lime-700 border-lime-300 dark:bg-lime-500/15 dark:text-lime-300 dark:border-lime-500/30",
    "profile": {
      "min": 0,
      "max": 1000,
      "step": 10,
      "quickValues": [
        150,
        250,
        350,
        1000
      ],
      "unit": "mL",
      "suggestedVolume": 250
    }
  },
  {
    "name": "Fresh frozen plasma (FFP)",
    "category": "Blood products",
    "color": "bg-lime-100 text-lime-700 border-lime-300 dark:bg-lime-500/15 dark:text-lime-300 dark:border-lime-500/30",
    "profile": {
      "min": 0,
      "max": 1000,
      "step": 10,
      "quickValues": [
        200,
        250,
        1000
      ],
      "unit": "mL",
      "suggestedVolume": 250
    }
  },
  {
    "name": "Platelets",
    "category": "Blood products",
    "color": "bg-lime-100 text-lime-700 border-lime-300 dark:bg-lime-500/15 dark:text-lime-300 dark:border-lime-500/30",
    "profile": {
      "min": 0,
      "max": 500,
      "step": 10,
      "quickValues": [
        200,
        300,
        500
      ],
      "unit": "mL",
      "suggestedVolume": 300
    }
  },
  {
    "name": "Cryoprecipitate",
    "category": "Blood products",
    "color": "bg-lime-100 text-lime-700 border-lime-300 dark:bg-lime-500/15 dark:text-lime-300 dark:border-lime-500/30",
    "profile": {
      "min": 0,
      "max": 250,
      "step": 10,
      "quickValues": [
        50,
        100,
        150,
        250
      ],
      "unit": "mL",
      "suggestedVolume": 100
    }
  },
  {
    "name": "Whole blood",
    "category": "Blood products",
    "color": "bg-lime-100 text-lime-700 border-lime-300 dark:bg-lime-500/15 dark:text-lime-300 dark:border-lime-500/30",
    "profile": {
      "min": 0,
      "max": 500,
      "step": 10,
      "quickValues": [
        200,
        350,
        500
      ],
      "unit": "mL",
      "suggestedVolume": 350
    }
  },
  {
    "name": "Cell salvage / autologous blood",
    "category": "Blood products",
    "color": "bg-lime-100 text-lime-700 border-lime-300 dark:bg-lime-500/15 dark:text-lime-300 dark:border-lime-500/30",
    "profile": {
      "min": 0,
      "max": 1500,
      "step": 10,
      "quickValues": [
        250,
        500,
        1000,
        1500
      ],
      "unit": "mL",
      "suggestedVolume": 500
    }
  }
]
