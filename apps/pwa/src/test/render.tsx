import React from "react"
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer"

export function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree: TestRenderer.ReactTestRenderer | undefined

  act(() => {
    tree = TestRenderer.create(element)
  })

  if (!tree) throw new Error("Failed to render test tree")
  return tree
}

export function getByText(tree: TestRenderer.ReactTestRenderer, text: string): ReactTestInstance {
  return tree.root.find(node => node.children.includes(text))
}

export function queryByText(tree: TestRenderer.ReactTestRenderer, text: string): ReactTestInstance | null {
  try {
    return getByText(tree, text)
  } catch {
    return null
  }
}

export function pressByText(tree: TestRenderer.ReactTestRenderer, text: string) {
  let node: ReactTestInstance | null = getByText(tree, text)

  while (node && typeof node.props.onPress !== "function") {
    node = node.parent
  }

  if (!node) throw new Error(`No pressable ancestor found for text: ${text}`)
  if (node.props.disabled) return

  act(() => {
    node.props.onPress()
  })
}

export function update(tree: TestRenderer.ReactTestRenderer, element: React.ReactElement) {
  act(() => {
    tree.update(element)
  })
}
