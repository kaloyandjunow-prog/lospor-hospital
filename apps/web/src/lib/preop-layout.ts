/**
 * How a case screen is drawn: beside the case panel ("sidebar"), as one long
 * scrolling page ("scroll"), or one section at a time ("tabs", shown as
 * "Sectioned"). The setting that chooses it is in case-layout.ts (10.0.0);
 * the name stays because the preop form had it first.
 */
export type PreopLayout = "sidebar" | "scroll" | "tabs"
