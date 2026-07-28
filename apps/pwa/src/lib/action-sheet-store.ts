// Tiny external store backing the web action-sheet host. On native we use
// Alert.alert (which renders a real OS action sheet); react-native-web's Alert
// is a dead no-op, so on web actionSheet() pushes a request here and
// ActionSheetHost renders an in-app modal instead.

export type SheetAction = {
  label: string
  destructive?: boolean
  cancel?: boolean
  onPress?: () => void
}

export type ActionSheetRequest = {
  title?: string
  message?: string
  actions: SheetAction[]
}

let current: ActionSheetRequest | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export function subscribeActionSheet(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getActionSheetSnapshot(): ActionSheetRequest | null {
  return current
}

export function showActionSheet(req: ActionSheetRequest): void {
  current = req
  emit()
}

export function dismissActionSheet(): void {
  if (current === null) return
  current = null
  emit()
}
