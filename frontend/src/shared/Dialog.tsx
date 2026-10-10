import { useRef, type FormEvent, type ReactNode } from 'react'
import { useDialogKeyboard } from './useDialogKeyboard'

interface Props {
  label: string
  onClose: () => void
  className: string
  role?: 'dialog' | 'alertdialog'
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  noValidate?: boolean
  children: ReactNode
}

export function Dialog({ label, onClose, className, role = 'dialog', onSubmit, noValidate, children }: Props) {
  const dialogRef = useRef<HTMLElement | null>(null)
  useDialogKeyboard(dialogRef, onClose)

  const dialogProps = {
    role,
    'aria-modal': true,
    'aria-label': label,
    tabIndex: -1,
    className: `${className} focus:outline-none`,
  }

  if (onSubmit !== undefined) {
    return (
      <form
        ref={(element) => {
          dialogRef.current = element
        }}
        onSubmit={onSubmit}
        noValidate={noValidate}
        {...dialogProps}
      >
        {children}
      </form>
    )
  }

  return (
    <div
      ref={(element) => {
        dialogRef.current = element
      }}
      {...dialogProps}
    >
      {children}
    </div>
  )
}
