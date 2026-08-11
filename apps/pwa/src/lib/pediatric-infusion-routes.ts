import {
  resolvePediatricInfusionProfileSurface,
  selectApplicablePediatricInfusionProfile,
  visiblePediatricInfusionRoutes,
  type PediatricInfusionProfileRule,
} from "@lospor/core/clinical-rules"
import type { PediatricAgeInput } from "@lospor/core/pediatric"

export type PediatricInfusionAvailability = {
  /** The single applicable rule, or null when there is none or several. */
  rule: PediatricInfusionProfileRule | null
  /** True when several rules claim this child and none may be used. */
  conflict: boolean
  /** The routes still permitted — never the withdrawn ones. */
  routes: string[]
  /** Which of those routes to open on. */
  defaultRoute?: string
}

/**
 * Whether an infusion can be offered to this child at all, and by which routes.
 *
 * The order matters. A ruleset can withdraw one route rather than the whole
 * drug, so asking for the drug's authored default route first gets the question
 * backwards: a withdrawn default answers "not available" for an infusion that
 * is available intravenously, or intraosseously, or by anything else the rules
 * still permit. Work out the permitted routes first, and only then pick one —
 * the authored default when it survived, otherwise the first that did.
 *
 * A conflict is carried rather than collapsed into "no rule". They mean
 * opposite things to the anaesthetist: nothing applies here, versus too much
 * applies here and someone has to fix the ruleset. Reading only the profile
 * makes the second look like a drug the sheet simply forgot to respond to.
 */
export function resolvePediatricInfusionAvailability(input: {
  itemKey: string
  age: PediatricAgeInput | null
  weightKg?: number | null
  profiles: readonly PediatricInfusionProfileRule[]
}): PediatricInfusionAvailability {
  const { profile, conflict } = selectApplicablePediatricInfusionProfile(input)
  if (!profile) return { rule: null, conflict, routes: [] }
  const routes = visiblePediatricInfusionRoutes(profile)
  const authoredDefault = resolvePediatricInfusionProfileSurface({ rule: profile }).route
  return {
    rule: profile,
    conflict,
    routes,
    defaultRoute: routes.includes(authoredDefault) ? authoredDefault : routes[0],
  }
}
