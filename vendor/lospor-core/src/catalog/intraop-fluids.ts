import type { DoseProfileInput } from "./dose-profile"

// INTRAOP_FLUID catalog — generated from scripts/_drug-library-answers.json
// via scripts/_generate_catalogs.ts.

export type FluidCatalogEntry = {
  name: string
  /**
   * WHO ATC code — see the note on DrugCatalogEntry.atcCode.
   *
   * Fluids are the one place where the code is genuinely absent rather than
   * merely unfound. Cryoprecipitate, whole blood and salvaged autologous
   * blood have no ATC code: B05AX names erythrocytes, thrombocytes, blood
   * plasma and cord stem cells, and none of those is what these three are.
   * They stay uncoded on purpose. The export still carries their name, so a
   * researcher can see that the transfusion happened and that nobody
   * pretended to know its concept.
   */
  atcCode?: string
  category: string
  color: string
  profile: DoseProfileInput
}

export const FLUID_CATALOG: FluidCatalogEntry[] = [
  {
    "name": "HES",
    "atcCode": "B05AA07",
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
    "atcCode": "B05AA06",
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
    "atcCode": "B05AA01",
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
    "atcCode": "B05AA01",
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
    "atcCode": "B05AA01",
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
    "atcCode": "B05BC01",
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
    "atcCode": "B05BA02",
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
    "atcCode": "B05BB01",
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
    "atcCode": "B05BB01",
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
    "atcCode": "B05BB01",
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
    "atcCode": "B05BB01",
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
    "atcCode": "B05BA03",
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
    "atcCode": "B05BB02",
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
    "atcCode": "B05BB02",
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
    "atcCode": "B05BB02",
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
    "atcCode": "B05BA03",
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
    "atcCode": "B05AX01",
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
    "atcCode": "B05AX03",
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
    "atcCode": "B05AX02",
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
