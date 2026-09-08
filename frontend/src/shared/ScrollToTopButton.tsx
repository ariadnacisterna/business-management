import { useEffect, useRef, useState } from 'react'

const SCROLL_THRESHOLD = 400

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false)
  const scrollTargetRef = useRef<Window | Element | null>(null)

  useEffect(() => {
    const handleScroll = (event: Event) => {
      const element = event.target instanceof Element ? event.target : null
      const target: Window | Element = element ?? window
      const top = element ? element.scrollTop : window.scrollY

      if (top > SCROLL_THRESHOLD) {
        scrollTargetRef.current = target
        setVisible(true)
      } else if (scrollTargetRef.current === target) {
        scrollTargetRef.current = null
        setVisible(false)
      }
    }

    if (window.scrollY > SCROLL_THRESHOLD) {
      scrollTargetRef.current = window
      setVisible(true)
    }

    window.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [])

  if (!visible) {
    return null
  }

  const handleClick = () => {
    const target = scrollTargetRef.current ?? window
    target.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Volver arriba"
      className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-line text-ink/60 shadow-lg transition-colors hover:bg-ink/20"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-7 w-7 rotate-180 opacity-70"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  )
}
