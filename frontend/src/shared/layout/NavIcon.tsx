import type { ReactNode } from 'react'
import type { NavIcon } from './navItems'

const CONTENT: Record<NavIcon, ReactNode> = {
  panel: (
    <g strokeWidth="3">
      <line x1="5" y1="20" x2="5" y2="11" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="19" y1="20" x2="19" y2="14" />
    </g>
  ),
  products: <path d="M3 8l9-5 9 5-9 5-9-5Zm0 0v9l9 5m0-9v9m9-14v9l-9 5" />,
  categories: <path d="M12 2 2 7l10 5 10-5-10-5Zm-10 10 10 5 10-5m-20 5 10 5 10-5" />,
  units: (
    <>
      <path d="M4 8h16v8H4z" />
      <path d="M8 8v3M12 8v4M16 8v3" />
    </>
  ),
  attributes: (
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="7" cy="18" r="2" />
    </>
  ),
  prices: (
    <>
      <path d="M12.6 2.6a2 2 0 0 0-1.4-.6H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8 8a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8l-8-8Z" />
      <circle cx="7" cy="7" r="1.4" />
    </>
  ),
  inventory: <path d="M3 6l9-4 9 4-9 4-9-4Zm0 6l9 4 9-4M3 16l9 4 9-4" />,
  sales: (
    <path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.8h7.2a2 2 0 0 0 2-1.6L21 8H6M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
  ),
  suppliers: (
    <>
      <path d="M2 6h11v9H2V6Zm11 3h4l3 3v3h-7V9Z" />
      <circle cx="6.5" cy="18" r="1.8" />
      <circle cx="17" cy="18" r="1.8" />
    </>
  ),
}

interface Props {
  icon: NavIcon
  className?: string
}

export function NavIconGlyph({ icon, className }: Props) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {CONTENT[icon]}
    </svg>
  )
}
