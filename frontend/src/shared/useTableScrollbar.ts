import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export function useTableScrollbar([first, second, third]: readonly unknown[]) {
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const theadRef = useRef<HTMLTableSectionElement>(null)
  const [scrollbar, setScrollbar] = useState({ visible: false, headerHeight: 0, thumbTop: 0, thumbHeight: 0 })
  const dragRef = useRef<{ startY: number; startScrollTop: number; range: number } | null>(null)

  const updateScrollbar = useCallback(() => {
    const container = tableScrollRef.current
    const header = theadRef.current
    if (container === null || header === null) return

    const headerHeight = header.offsetHeight
    const bodyViewport = container.clientHeight - headerHeight
    const bodyTotal = container.scrollHeight - headerHeight
    const maxScrollTop = container.scrollHeight - container.clientHeight

    const next =
      bodyTotal <= bodyViewport || maxScrollTop <= 0
        ? { visible: false, headerHeight, thumbTop: 0, thumbHeight: 0 }
        : (() => {
            const thumbHeight = Math.max(32, bodyViewport * (bodyViewport / bodyTotal))
            const thumbTop = headerHeight + (container.scrollTop / maxScrollTop) * (bodyViewport - thumbHeight)
            return { visible: true, headerHeight, thumbTop, thumbHeight }
          })()

    setScrollbar((prev) =>
      prev.visible === next.visible &&
      prev.headerHeight === next.headerHeight &&
      Math.abs(prev.thumbTop - next.thumbTop) < 0.5 &&
      Math.abs(prev.thumbHeight - next.thumbHeight) < 0.5
        ? prev
        : next,
    )
  }, [])

  useLayoutEffect(() => {
    updateScrollbar()
  })

  useEffect(() => {
    const container = tableScrollRef.current
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
  }, [updateScrollbar, first, second, third])

  function handleThumbPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const container = tableScrollRef.current
    const header = theadRef.current
    if (container === null || header === null) return

    const headerHeight = header.offsetHeight
    const bodyViewport = container.clientHeight - headerHeight
    const maxScrollTop = container.scrollHeight - container.clientHeight
    const range = bodyViewport - scrollbar.thumbHeight
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

  return { tableScrollRef, theadRef, scrollbar, updateScrollbar, handleThumbPointerDown }
}
