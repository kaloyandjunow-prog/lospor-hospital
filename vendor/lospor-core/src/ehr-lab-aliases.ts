/**
 * What hospitals call our tests.
 *
 * A laboratory sends `ХГБ`, `HGB`, `Хемоглобин` or `Hb`. All four mean
 * haemoglobin, none of them is a code, and until now each was a question an
 * operator had to answer at every site that ever sent it. Recognising the
 * obvious ones costs nothing and leaves the mapping screen for the labels that
 * genuinely need a human — which is the difference between a screen somebody
 * works through and a screen somebody stops opening.
 *
 * Two rules decide what belongs here.
 *
 * An alias must be unambiguous *as a label*. `Ca` is calcium everywhere, so it
 * is here; `T4` is not, because free and total thyroxine are different
 * measurements with different reference ranges and a laboratory abbreviating
 * one of them is not saying which. The cost of a wrong alias is a value landing
 * in a field whose reference range does not apply to it, which is the same
 * clinical error a wrong LOINC code causes and is the reason this list is
 * short rather than exhaustive.
 *
 * An alias is *recognition only*. Nothing here is ever displayed: a clinician
 * sees our test name, or -- for a result nobody could place -- the hospital's
 * own label exactly as it arrived. These strings exist to match incoming text
 * and for no other purpose.
 *
 * Bulgarian is included because that is where this runs. A Bulgarian
 * laboratory information system exports Bulgarian labels, and expecting every
 * site to map `Кръвна захар` by hand is expecting them to do work we can do
 * once.
 */

/**
 * alias -> our test name.
 *
 * Keys are matched after folding (NFC, trimmed, collapsed whitespace,
 * lowercased), so case and spacing here are for readability only.
 */
export const LAB_NAME_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  // ── Haematology ───────────────────────────────────────────────────────────
  "hb": "Haemoglobin (Hb)",
  "hgb": "Haemoglobin (Hb)",
  "haemoglobin": "Haemoglobin (Hb)",
  "hemoglobin": "Haemoglobin (Hb)",
  "хгб": "Haemoglobin (Hb)",
  "хемоглобин": "Haemoglobin (Hb)",
  "hct": "Haematocrit (Hct)",
  "haematocrit": "Haematocrit (Hct)",
  "hematocrit": "Haematocrit (Hct)",
  "хематокрит": "Haematocrit (Hct)",
  "rbc": "Erythrocytes (RBC)",
  "erythrocytes": "Erythrocytes (RBC)",
  "еритроцити": "Erythrocytes (RBC)",
  "wbc": "Leucocytes (WBC)",
  "leucocytes": "Leucocytes (WBC)",
  "leukocytes": "Leucocytes (WBC)",
  "левкоцити": "Leucocytes (WBC)",
  "plt": "Platelets",
  "тромбоцити": "Platelets",
  "неутрофили": "Neutrophils",
  "лимфоцити": "Lymphocytes",
  "моноцити": "Monocytes",
  "еозинофили": "Eosinophils",
  "ретикулоцити": "Reticulocytes",

  // ── Coagulation ───────────────────────────────────────────────────────────
  "pt": "PT (Prothrombin time)",
  "prothrombin time": "PT (Prothrombin time)",
  "протромбиново време": "PT (Prothrombin time)",
  "inr": "INR",
  "инр": "INR",
  "aptt": "aPTT",
  "ptt": "aPTT",
  "аптв": "aPTT",
  "fibrinogen": "Fibrinogen",
  "фибриноген": "Fibrinogen",
  "d dimer": "D-dimer",
  "ddimer": "D-dimer",
  "д-димер": "D-dimer",

  // ── Electrolytes ──────────────────────────────────────────────────────────
  // Symbols only where the element has one meaning in a laboratory report.
  "na": "Sodium (Na⁺)",
  "sodium": "Sodium (Na⁺)",
  "натрий": "Sodium (Na⁺)",
  "k": "Potassium (K⁺)",
  "potassium": "Potassium (K⁺)",
  "калий": "Potassium (K⁺)",
  "cl": "Chloride (Cl⁻)",
  "chloride": "Chloride (Cl⁻)",
  "хлор": "Chloride (Cl⁻)",
  // Bicarbonate only in its venous/serum sense. The arterial one is its own
  // test on the blood gas panel and is not aliased, because a laboratory
  // writing "HCO3" on a gas report means that one.
  "bicarbonate": "Bicarbonate (HCO₃⁻)",
  "бикарбонат": "Bicarbonate (HCO₃⁻)",
  "ca": "Calcium (Ca²⁺)",
  "calcium": "Calcium (Ca²⁺)",
  "калций": "Calcium (Ca²⁺)",
  // Deliberately separate from total calcium: they are different measurements
  // and a laboratory that reports both distinguishes them.
  "ionised calcium": "Ionised Ca²⁺",
  "ionized calcium": "Ionised Ca²⁺",
  "йонизиран калций": "Ionised Ca²⁺",
  "mg": "Magnesium (Mg²⁺)",
  "magnesium": "Magnesium (Mg²⁺)",
  "магнезий": "Magnesium (Mg²⁺)",
  "phosphate": "Phosphate",
  "фосфат": "Phosphate",

  // ── Biochemistry ──────────────────────────────────────────────────────────
  "creatinine": "Creatinine",
  "crea": "Creatinine",
  "креатинин": "Creatinine",
  "urea": "Urea (BUN)",
  "bun": "Urea (BUN)",
  "урея": "Urea (BUN)",
  "glucose": "Glucose",
  "glu": "Glucose",
  "глюкоза": "Glucose",
  "кръвна захар": "Glucose",
  "hba1c": "HbA1c",
  "гликиран хемоглобин": "HbA1c",
  "lactate": "Lactate",
  "лактат": "Lactate",
  "uric acid": "Uric acid",
  "пикочна киселина": "Uric acid",
  "egfr": "eGFR",
  "total protein": "Total protein",
  "общ белтък": "Total protein",
  "albumin": "Albumin",
  "албумин": "Albumin",

  // ── Liver ─────────────────────────────────────────────────────────────────
  "alt": "ALT (SGPT)",
  "sgpt": "ALT (SGPT)",
  "алат": "ALT (SGPT)",
  "ast": "AST (SGOT)",
  "sgot": "AST (SGOT)",
  "асат": "AST (SGOT)",
  "alp": "ALP",
  "alkaline phosphatase": "ALP",
  "алкална фосфатаза": "ALP",
  "ggt": "GGT",
  "ггт": "GGT",
  "total bilirubin": "Total bilirubin",
  "общ билирубин": "Total bilirubin",
  "direct bilirubin": "Direct bilirubin",
  "директен билирубин": "Direct bilirubin",

  // ── Cardiac ───────────────────────────────────────────────────────────────
  // No bare "troponin": high-sensitivity and conventional assays have different
  // reference ranges and units, and a laboratory writing "Troponin" is not
  // saying which it ran. That is a mapping question for the site.
  "hs-tni": "Troponin I (hs-cTnI)",
  "hs-ctni": "Troponin I (hs-cTnI)",
  "hs-tnt": "Troponin T (hs-cTnT)",
  "hs-ctnt": "Troponin T (hs-cTnT)",
  "ck": "CK (Creatine kinase)",
  "creatine kinase": "CK (Creatine kinase)",
  "цк": "CK (Creatine kinase)",
  "ck-mb": "CK-MB",
  "ckmb": "CK-MB",
  "bnp": "BNP",
  "nt-probnp": "NT-proBNP",
  "ntprobnp": "NT-proBNP",
  "myoglobin": "Myoglobin",
  "миоглобин": "Myoglobin",

  // ── Thyroid ───────────────────────────────────────────────────────────────
  // "T4" and "T3" alone are not here: free and total are different tests.
  "tsh": "TSH",
  "тсх": "TSH",
  "ft4": "Free T4 (fT4)",
  "free t4": "Free T4 (fT4)",
  "свободен т4": "Free T4 (fT4)",
  "ft3": "Free T3 (fT3)",
  "free t3": "Free T3 (fT3)",
  "свободен т3": "Free T3 (fT3)",

  // ── Inflammatory ──────────────────────────────────────────────────────────
  "crp": "CRP",
  "c reactive protein": "CRP",
  "црп": "CRP",
  "esr": "ESR",
  "соe": "ESR",
  "ferritin": "Ferritin",
  "феритин": "Ferritin",
  "pct": "Procalcitonin (PCT)",
  "procalcitonin": "Procalcitonin (PCT)",
  "прокалцитонин": "Procalcitonin (PCT)",
  "il-6": "IL-6",
  "il6": "IL-6",

  // ── Blood gas ─────────────────────────────────────────────────────────────
  // These name arterial blood explicitly, so they are safe: a venous gas is a
  // different reading of the same patient and a laboratory says which it took.
  "pao2": "PaO₂",
  "paco2": "PaCO₂",
  "sao2": "SaO₂",
  "be": "Base excess (BE)",
  "base excess": "Base excess (BE)",
})
