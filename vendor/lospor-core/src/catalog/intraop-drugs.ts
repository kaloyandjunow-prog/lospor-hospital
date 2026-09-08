import type { DoseProfileInput } from "./dose-profile"

// INTRAOP_DRUG catalog — dose profiles originally generated from
// scripts/_drug-library-answers.json via scripts/_generate_catalogs.ts. That
// generator is no longer in the tree, so this file is now authored directly;
// the answers JSON survives in lospor-api/scripts as the record of the
// walkthrough that produced the profiles.
//
// The atcCode on each entry was added afterwards and is authored here, not
// generated: every code was checked one at a time against the WHO ATC/DDD
// index and the local Athena ATC snapshot before it was written down.

export type DrugCatalogEntry = {
  name: string
  /**
   * WHO ATC code for the substance, at the prescribable 5th level.
   *
   * This is what lets a drug given during a case reach a standard OMOP
   * concept: the write path resolves ATC first, exactly as a preoperative
   * medication does, so the same substance cannot map differently depending
   * on whether it was recorded before or during the case. Optional only
   * because a few catalog entries have no ATC code at all -- see
   * intraop-fluids.ts. Never guess one: an absent code costs a research
   * question, a wrong one answers it wrongly.
   */
  atcCode?: string
  category: string
  color: string
  profile: DoseProfileInput
}

export const DRUG_CATALOG: DrugCatalogEntry[] = [
  {
    "name": "Propofol",
    "atcCode": "N01AX10",
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
    "atcCode": "N01AX07",
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
    "atcCode": "N01AX03",
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
    "atcCode": "N01AX14",
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
    "atcCode": "N01AF03",
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
    "atcCode": "N01AF01",
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
    "atcCode": "N05CD08",
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
    "atcCode": "N05BA01",
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
    "atcCode": "N05BA06",
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
    "atcCode": "N05CD14",
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
    "atcCode": "N05CM18",
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
    "atcCode": "C02AC01",
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
    "atcCode": "N05AD08",
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
    "atcCode": "N05AD01",
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
    "atcCode": "R06AD02",
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
    "atcCode": "N01AH01",
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
    "atcCode": "N01AH03",
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
    "atcCode": "N01AH06",
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
    "atcCode": "N01AH02",
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
    "atcCode": "N02AA01",
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
    "atcCode": "N02AA03",
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
    "atcCode": "N02AA05",
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
    "atcCode": "N07BC02",
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
    "atcCode": "N02AB02",
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
    "atcCode": "N02AX02",
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
    "atcCode": "N02AF02",
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
    "atcCode": "N02AF01",
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
    "atcCode": "N02AE01",
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
    "atcCode": "N07BC06",
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
    "atcCode": "N02BE01",
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
    "atcCode": "N02BB02",
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
    "atcCode": "M01AB15",
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
    "atcCode": "M01AB05",
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
    "atcCode": "M01AE01",
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
    "atcCode": "M01AE17",
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
    "atcCode": "M01AE03",
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
    "atcCode": "M01AH04",
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
    "atcCode": "M01AC05",
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
    "atcCode": "M01AC02",
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
    "atcCode": "N02BG06",
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
    "atcCode": "A12CC02",
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
    "atcCode": "N01BB02",
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
    "atcCode": "M03AB01",
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
    "atcCode": "M03AC09",
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
    "atcCode": "M03AC03",
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
    "atcCode": "M03AC01",
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
    "atcCode": "M03AC06",
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
    "atcCode": "M03AC11",
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
    "atcCode": "M03AC04",
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
    "atcCode": "M03AC10",
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
    "atcCode": "V03AB35",
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
    "atcCode": "N07AA01",
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
    "atcCode": "A03AB02",
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
    "atcCode": "A03BA01",
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
    "atcCode": "A04AD01",
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
    "atcCode": "A03BB01",
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
    "atcCode": "N01BB01",
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
    "atcCode": "N01BB10",
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
    "atcCode": "N01BB09",
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
    "atcCode": "N01BB03",
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
    "atcCode": "N01BB04",
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
    "atcCode": "N01BA04",
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
    "atcCode": "N01BA03",
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
    "atcCode": "C01CA06",
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
    "atcCode": "C01CA03",
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
    "atcCode": "C01CA24",
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
    "atcCode": "C01CA26",
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
    "atcCode": "C01CA09",
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
    "atcCode": "H01BA01",
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
    "atcCode": "H01BA04",
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
    "atcCode": "V03AB17",
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
    "atcCode": "V03AB33",
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
    "atcCode": "C01CE02",
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
    "atcCode": "C01CX08",
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
    "atcCode": "H04AA01",
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
    "atcCode": "A12AA07",
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
    "atcCode": "A12AA03",
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
    "atcCode": "C01AA05",
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
    "atcCode": "C01DA02",
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
    "atcCode": "C07AB09",
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
    "atcCode": "C07AG01",
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
    "atcCode": "C07AB02",
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
    "atcCode": "C07AA05",
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
    "atcCode": "C02DB02",
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
    "atcCode": "G04BE03",
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
    "atcCode": "C01EB10",
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
    "atcCode": "C01BD01",
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
    "atcCode": "C08DB01",
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
    "atcCode": "C08DA01",
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
    "atcCode": "A04AA01",
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
    "atcCode": "A04AA02",
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
    "atcCode": "A04AA05",
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
    "atcCode": "A04AA03",
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
    "atcCode": "H02AB02",
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
    "atcCode": "A03FA01",
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
    "atcCode": "R06AE03",
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
    "atcCode": "R06AA11",
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
    "atcCode": "A04AD12",
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
    "atcCode": "H01CB02",
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
    "atcCode": "J01DB04",
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
    "atcCode": "J01DC02",
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
    "atcCode": "J01DD04",
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
    "atcCode": "J01DD01",
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
    "atcCode": "J01DC01",
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
    "atcCode": "J01DC05",
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
    "atcCode": "J01DD02",
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
    "atcCode": "J01DE01",
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
    "atcCode": "J01DI02",
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
    "atcCode": "J01CA01",
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
    "atcCode": "J01CR02",
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
    "atcCode": "J01CR01",
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
    "atcCode": "J01CR05",
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
    "atcCode": "J01CF05",
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
    "atcCode": "J01CF04",
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
    "atcCode": "J01CF06",
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
    "atcCode": "J01FF01",
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
    "atcCode": "J01XA01",
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
    "atcCode": "J01XA02",
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
    "atcCode": "J01GB03",
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
    "atcCode": "J01GB01",
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
    "atcCode": "J01GB06",
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
    "atcCode": "J01XD01",
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
    "atcCode": "J01MA02",
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
    "atcCode": "J01MA12",
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
    "atcCode": "J01MA14",
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
    "atcCode": "J01DH03",
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
    "atcCode": "J01DH02",
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
    "atcCode": "J01DH51",
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
    "atcCode": "J01DF01",
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
    "atcCode": "J01XX08",
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
    "atcCode": "J01XX09",
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
    "atcCode": "J01AA12",
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
    "atcCode": "J01AA02",
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
    "atcCode": "J01FA10",
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
    "atcCode": "J02AC01",
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
    "atcCode": "J02AC03",
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
    "atcCode": "J02AX06",
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
    "atcCode": "J02AX04",
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
    "atcCode": "J02AX05",
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
    "atcCode": "V03AB14",
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
    "atcCode": "B01AB01",
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
    "atcCode": "B02AA02",
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
    "atcCode": "H01BA02",
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
    "atcCode": "B02BA01",
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
    "atcCode": "B02BB01",
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
    "atcCode": "B02BD01",
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
    "atcCode": "B02BD08",
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
    "atcCode": "B01AE06",
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
    "atcCode": "B01AD02",
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
    "atcCode": "B01AD11",
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
    "atcCode": "H01BB02",
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
    "atcCode": "H01BB03",
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
    "atcCode": "G02AB01",
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
    "atcCode": "G02AD04",
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
    "atcCode": "G02AD06",
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
    "atcCode": "R03CC03",
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
    "atcCode": "A10AB01",
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
    "atcCode": "H02AB09",
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
    "atcCode": "H02AB04",
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
    "atcCode": "B05XA02",
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
    "atcCode": "B05XA01",
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
    "atcCode": "B05XA06",
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
    "atcCode": "B05XA09",
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
    "atcCode": "B05BB01",
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
    "atcCode": "C03CA01",
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
    "atcCode": "R03AC02",
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
    "atcCode": "R03DA05",
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
    "atcCode": "R03DA04",
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
    "atcCode": "R05CB01",
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
    "atcCode": "V03AB15",
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
    "atcCode": "V03AB25",
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
    "atcCode": "M03CA01",
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
    "atcCode": "V03AB19",
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
    "atcCode": "V03AB04",
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
    "atcCode": "B06AA03",
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
    "atcCode": "N03AX14",
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
    "atcCode": "N03AA02",
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
    "atcCode": "N03AB02",
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
    "atcCode": "N03AG01",
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
    "atcCode": "R06AB04",
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
    "atcCode": "N06DA04",
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
