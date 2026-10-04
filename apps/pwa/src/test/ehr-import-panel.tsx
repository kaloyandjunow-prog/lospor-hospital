import React from "react"
import { act, type ReactTestInstance } from "react-test-renderer"
import { expect, vi } from "vitest"
import { normalizeEhrImport } from "@lospor/core/ehr-import"
import { buildEhrReviewPlan, type EhrReviewInput } from "@lospor/core/ehr-import-review"
import type { EhrUnreadSource } from "@lospor/core/ehr-import-transport"
import { render } from "@/test/render"
import { EhrImportPanel } from "@/components/EhrImportPanel"

/**
 * Shared by the EhrImportPanel test files. The mocks of notify and preferences
 * stay in each test file, because vi.mock is hoisted per file.
 */

export function panel(
  fields: Record<string, unknown>,
  rest: Partial<Omit<EhrReviewInput, "canonical">> = {},
  handlers: Partial<{
    onAccept: (patch: Record<string, unknown>, appliedKeys: string[], modeChange: unknown) => void
    onDecline: (itemKey: string) => void
    onRequestModeChange: () => void
  }> = {},
  identityUnverified?: boolean,
  unreadSources?: EhrUnreadSource[],
  modeChangeAvailable?: boolean,
) {
  const { canonical } = normalizeEhrImport({ identifierType: "IZ", identifier: "42", fields })
  const current = rest.current ?? {}
  const plan = buildEhrReviewPlan({ canonical, current, ...rest })
  return render(
    <EhrImportPanel
      plan={plan}
      identityUnverified={identityUnverified}
      unreadSources={unreadSources}
      current={current}
      currentClinicalMode={rest.currentClinicalMode}
      modeChangeAvailable={modeChangeAvailable}
      labelFor={field => field}
      onAccept={handlers.onAccept ?? vi.fn()}
      onDecline={handlers.onDecline ?? vi.fn()}
      onRequestModeChange={handlers.onRequestModeChange}
      onClose={vi.fn()}
    />,
  )
}

export function texts(tree: ReturnType<typeof render>): string[] {
  return tree.root
    .findAll(n => String(n.type) === "Text")
    .map(n => n.children.filter(c => typeof c === "string").join(""))
    .filter(Boolean)
}

/**
 * A test name the catalogue actually holds, with its canonical unit.
 *
 * These fixtures used the shorthand "Hb" and no unit, which passed when any
 * name flowed through untouched. Core now resolves an incoming result against
 * the catalogue and refuses one it has no field for -- an unrecognised name is
 * `unsupported-test` and an unconvertible unit is `unconverted`, neither of
 * which is offered pre-ticked. That is the point of the check: a hospital's own
 * code reaches a LOSPOR field only once a site has mapped it. So the fixture
 * has to name a real test, or it is exercising the refusal path rather than the
 * freshness ranking these tests are about.
 */
export const HB = "Haemoglobin (Hb)"

export function rowFor(tree: ReturnType<typeof render>, title: string) {
  const node = tree.root.findAll(n =>
    typeof n.type !== "string"
    && n.props?.accessibilityRole === "checkbox"
    && texts({ root: n } as never).includes(title))[0]
  expect(node, `no row titled "${title}"`).toBeDefined()
  return node
}

/** Presses go through act, or the state they set never reaches the next read. */
export function tap(node: ReactTestInstance) {
  expect(typeof node.props.onPress, "node is not pressable").toBe("function")
  act(() => { node.props.onPress() })
}

/** The first pressable whose own text satisfies `match`. */
export function pressable(tree: ReturnType<typeof render>, match: (text: string) => boolean) {
  const node = tree.root.findAll(n =>
    typeof n.props?.onPress === "function"
    && texts({ root: n } as never).some(match))[0]
  expect(node, "no pressable matched").toBeDefined()
  return node
}
