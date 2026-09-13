interface Props {
  imageUrl: string | null
  name: string
  sizeClassName: string
}

export function ProductThumbnail({ imageUrl, name, sizeClassName }: Props) {
  if (imageUrl !== null) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={`${sizeClassName} shrink-0 rounded-lg border border-line object-cover`}
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      className={`${sizeClassName} flex shrink-0 items-center justify-center rounded-lg border border-line bg-line/15 text-ink/30`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-1/2 w-1/2"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </div>
  )
}
