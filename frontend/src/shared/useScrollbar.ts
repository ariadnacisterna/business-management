import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export function useScrollbar(deps: unknown[]) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollbar, setScrollbar] = useState({ visible: false, thumbTop: 0, thumbHeight: 0 })
  const dragRef = useRef<{ startY: number; startScrollTop: number; range: number } | null>(null)

  function updateScrollbar() {
    const container = scrollRef.current
    if (container === null) return

    const viewport = container.clientHeight
    const total = container.scrollHeight
    const maxScrollTop = total - viewport

    const next =
      maxScrollTop <= 0
        ? { visible: false, thumbTop: 0, thumbHeight: 0 }
        : (() => {
            const thumbHeight = Math.max(32, viewport * (viewport / total))
            const thumbTop = (container.scrollTop / maxScrollTop) * (viewport - thumbHeight)
            return { visible: true, thumbTop, thumbHeight }
          })()

    setScrollbar((prev) =>
      prev.visible === next.visible &&
      Math.abs(prev.thumbTop - next.thumbTop) < 0.5 &&
      Math.abs(prev.thumbHeight - next.thumbHeight) < 0.5
        ? prev
        : next,
    )
  }

  useLayoutEffect(() => {
    updateScrollbar()
  })

  useEffect(() => {
    const container = scrollRef.current
    const content = container?.firstElementChild ?? null
    if (container === null || content === null || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(updateScrollbar)
    observer.observe(container)
    observer.observe(content)

    window.addEventListener('resize', updateScrollbar)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateScrollbar)
    }
  }, deps)

  function handleThumbPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const container = scrollRef.current
    if (container === null) return

    const viewport = container.clientHeight
    const maxScrollTop = container.scrollHeight - container.clientHeight
    const range = viewport - scrollbar.thumbHeight
    if (range <= 0) return

    dragRef.current = { startY: event.clientY, startScrollTop: container.scrollTop, range }
    event.currentTarget.setPointerCapture(event.pointerId)

    function handlePointerMove(moveEvent: PointerEvent) {
      const drag = dragRef.current
      if (drag === null || container === null) return
      const deltaY = moveEvent.clientY - drag.startY
      const scrollDelta = (deltaY / drag.range) * maxScrollTop
      container.scrollTop = Math.min(maxScrollTop, Math.max(0, drag.startScrollTop + scrollDelta))
    }

    function handlePointerUp() {
      dragRef.current = null
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  return { scrollRef, scrollbar, updateScrollbar, handleThumbPointerDown }
}
