/**
 * The regional anaesthesia routes added to adult adjuvants (2026-10-18). They
 * are adult doses: a paediatric band built from the adult catalogue leaves
 * them out, and children get the caudal routes written for them instead
 * (pediatric-drug-profiles-v2.ts).
 */
export const REGIONAL_ADJUVANT_ROUTES: Readonly<Record<string, readonly string[]>> = {
  "Fentanyl": ["IT", "PD"],
  "Sufentanil": ["IT", "PD"],
  "Morphine": ["IT", "PD"],
  "Diamorphine": ["IT", "PD"],
  "Hydromorphone": ["IT", "PD"],
  "Clonidine": ["IT", "PD", "Peripheral nerve block"],
  "Dexmedetomidine": ["Peripheral nerve block"],
  "Dexamethasone": ["Peripheral nerve block"],
  "Buprenorphine": ["Peripheral nerve block"],
  "Hyaluronidase": ["Peripheral nerve block"],
}
