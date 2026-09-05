import { useEffect, useState } from 'react'

const MONTH_FORMATTER = new Intl.DateTimeFormat('es-AR', { month: 'long' })
const TIME_FORMATTER = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatDate(now: Date): string {
  const day = now.getDate()
  const month = capitalize(MONTH_FORMATTER.format(now))
  const year = now.getFullYear()
  return `${day} de ${month} del ${year}`
}

export function HeaderClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  return (
    <span className="hidden items-baseline gap-3 text-lg font-bold text-ink sm:flex">
      <span>{formatDate(now)}</span>
      <span aria-hidden="true" className="opacity-40">
        |
      </span>
      <span>{TIME_FORMATTER.format(now)}</span>
    </span>
  )
}
