// The wrappers live in core, shared with mobile. Nothing here was ever
// platform-specific; both apps simply had their own copy.
export * from "@lospor/core/clinical-display"
import { applyStoredBulgarianNames } from "./bulgarian-names-web"

// Names drawn in this browser follow the reader's Bulgarian-name switches.
applyStoredBulgarianNames()
export { clinicalEventName } from "./clinical-event-name"

// The PAED band beside the score on the postop form; the words are core vocabulary.
export { displayPaedBand } from "@lospor/core/risk-band-display"
