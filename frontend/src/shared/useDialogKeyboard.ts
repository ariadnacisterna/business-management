import { useEffect, useRef, useState, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const openDialogs: HTMLElement[] = []

function registerDialog(dialog: HTMLElement) {
  const firstNestedIndex = openDialogs.findIndex((candidate) => dialog.contains(candidate))
  if (firstNestedIndex === -1) {
    openDialogs.push(dialog)
    return
  }
  openDialogs.splice(firstNestedIndex, 0, dialog)
}

function unregisterDialog(dialog: HTMLElement) {
  const index = openDialogs.indexOf(dialog)
  if (index !== -1) openDialogs.splice(index, 1)
}

function isTopDialog(dialog: HTMLElement): boolean {
  return openDialogs[openDialogs.length - 1] === dialog
}

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.closest('[aria-hidden="true"]') === null,
  )
}

function moveFocusWithinDialog(dialog: HTMLElement, event: KeyboardEvent) {
  const active = document.activeElement
  if (active !== dialog && !dialog.contains(active)) return
  const focusables = focusableElements(dialog)
  if (focusables.length === 0) {
    event.preventDefault()
    return
  }
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (event.shiftKey && (active === first || active === dialog)) {
    event.preventDefault()
    last.focus()
    return
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

export function useDialogKeyboard(dialogRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  const [returnFocusTarget] = useState(() => document.activeElement)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return

    registerDialog(dialog)
    if (!dialog.contains(document.activeElement)) dialog.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (dialog === null || !isTopDialog(dialog)) return
      if (event.key === 'Escape') {
        if (event.defaultPrevented) return
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key === 'Tab') moveFocusWithinDialog(dialog, event)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      unregisterDialog(dialog)
      if (returnFocusTarget instanceof HTMLElement && returnFocusTarget.isConnected) {
        returnFocusTarget.focus()
      }
    }
  }, [dialogRef, returnFocusTarget])
}
