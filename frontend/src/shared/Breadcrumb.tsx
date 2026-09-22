interface Props {
  segments: string[]
}

export function Breadcrumb({ segments }: Props) {
  const last = segments[segments.length - 1]
  const rest = segments.slice(0, -1)
  return (
    <p className="m-0 min-w-0 text-base opacity-60 [overflow-wrap:anywhere]">
      {rest.map((segment, index) => (
        <span key={index}>{segment} › </span>
      ))}
      <span className="text-brand">{last}</span>
    </p>
  )
}
