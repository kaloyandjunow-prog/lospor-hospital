"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

/**
 * Two rules for the whole web app (10.8.0).
 *
 * - No browser context menu (right click, or a long press on a tablet), except
 *   on the sign-in screen (a password manager or paste may be needed there),
 *   and inside anything marked `data-allow-context-menu`. The two-factor code
 *   field is marked `data-no-context-menu` and never has one, sign-in or not.
 * - The field being typed in goes to the middle of what is visible above the
 *   on-screen keyboard as soon as it is touched, not once typing starts.
 */
const CONTEXT_MENU_PATHS = ["/login"]

function isTextField(element: Element | null): element is HTMLElement {
  if (!element) return false
  if (element instanceof HTMLTextAreaElement) return true
  if (element instanceof HTMLInputElement) return !["button", "checkbox", "radio", "range", "submit", "reset", "file", "color"].includes(element.type)
  return element instanceof HTMLElement && element.isContentEditable
}

/**
 * Whether a focused field should be brought to the middle: with a finger, or when the on-screen keyboard has
 * shrunk the visible area. Not with a mouse, and not inside a dialog or a fixed popover: scrolling the page behind it
 * moves nothing there and only jumps the page.
 */
function wantsCentring(element: HTMLElement): boolean {
  if (element.closest("[role=dialog], [role=alertdialog], [data-no-centre]")) return false
  for (let node: HTMLElement | null = element; node && node !== document.body; node = node.parentElement) if (getComputedStyle(node).position === "fixed") return false
  const viewport = window.visualViewport
  const keyboard = !!viewport && viewport.height < window.innerHeight - 80
  return keyboard || window.matchMedia("(pointer: coarse)").matches
}

function centre(element: HTMLElement): void {
  if (!wantsCentring(element)) return
  const viewport = window.visualViewport
  const rect = element.getBoundingClientRect()
  const visibleTop = viewport?.offsetTop ?? 0
  const visibleHeight = viewport?.height ?? window.innerHeight
  const middle = visibleTop + visibleHeight / 2
  const delta = rect.top + rect.height / 2 - middle
  if (Math.abs(delta) > 24) window.scrollBy({ top: delta, behavior: "smooth" })
}

export function GlobalInteractionGuards() {
  const pathname = usePathname()

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest?.("[data-no-context-menu]")) { event.preventDefault(); return }
      if (CONTEXT_MENU_PATHS.some(path => pathname?.startsWith(path))) return
      if ((event.target as Element | null)?.closest?.("[data-allow-context-menu]")) return
      event.preventDefault()
    }
    document.addEventListener("contextmenu", onContextMenu)
    return () => document.removeEventListener("contextmenu", onContextMenu)
  }, [pathname])

  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Element | null
      if (!isTextField(target)) return
      // Once now, and again when the keyboard has opened and the visible area shrunk.
      centre(target)
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => { if (document.activeElement === target) centre(target) }, 350)
    }
    const onResize = () => {
      const active = document.activeElement
      if (isTextField(active)) centre(active)
    }
    document.addEventListener("focusin", onFocusIn)
    window.visualViewport?.addEventListener("resize", onResize)
    return () => {
      document.removeEventListener("focusin", onFocusIn)
      window.visualViewport?.removeEventListener("resize", onResize)
      if (pending) clearTimeout(pending)
    }
  }, [])

  return null
}
