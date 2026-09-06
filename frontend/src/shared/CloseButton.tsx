import { useState } from 'react'

interface Props {
  onClose: () => void
  className?: string
}

const CLOSE_DELAY_MS = 150

export function CloseButton({ onClose, className = '' }: Props) {
  const [closing, setClosing] = useState(false)

  function handleClick() {
    setClosing(true)
    setTimeout(onClose, CLOSE_DELAY_MS)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={closing}
      aria-label="Cerrar"
      className={`z-10 flex h-14 w-14 shrink-0 items-center justify-center transition-colors ${
        closing ? 'text-danger' : 'text-ink/60 hover:text-danger'
      } ${className}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-7 w-7"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  )
}
