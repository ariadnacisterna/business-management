interface Props {
  text: string
  query: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function HighlightedText({ text, query }: Props) {
  const trimmedQuery = query.trim()
  if (trimmedQuery === '') return <>{text}</>

  const parts = text.split(new RegExp(`(${escapeRegExp(trimmedQuery)})`, 'gi'))

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === trimmedQuery.toLowerCase() ? (
          <span key={index} className="bg-brand/10 text-brand">
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  )
}
