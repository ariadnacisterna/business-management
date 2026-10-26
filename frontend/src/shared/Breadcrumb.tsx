import { ancestorsOf } from './layout/navItems'

interface Props {
  segments: string[]
}

export function Breadcrumb({ segments }: Props) {
  const full = segments.length > 0 ? [...ancestorsOf(segments[0]), ...segments] : segments
  const last = full[full.length - 1]
  const rest = full.slice(0, -1)
  return (
    <p className="m-0 min-w-0 text-base opacity-60 [overflow-wrap:anywhere]">
      {rest.map((segment, index) => (
        <span key={index}>{segment} › </span>
      ))}
      <span className="text-brand">{last}</span>
    </p>
  )
}
