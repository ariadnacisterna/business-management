import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export function useTableScrollbar(deps: unknown[]) {
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const theadRef = useRef<HTMLTableSectionElement>(null)
  const [scrollbar, setScrollbar] = useState({ visible: false, headerHeight: 0, thumbTop: 0, thumbHeight: 0 })
  const dragRef = useRef<{ startY: number; startScrollTop: number; range: number } | null>(null)

  function updateScrollbar() {
    const container = tableScrollRef.current
    const header = theadRef.current
    if (container === null || header === null) return

    const headerHeight = header.offsetHeight
    const bodyViewport = container.clientHeight - headerHeight
    const bodyTotal = container.scrollHeight - headerHeight
    const maxScrollTop = container.scrollHeight - container.clientHeight

    if (bodyTotal <= bodyViewport || maxScrollTop <= 0) {
      setScrollbar({ visible: false, headerHeight, thumbTop: 0, thumbHeight: 0 })
      return
    }

    const thumbHeight = Math.max(32, bodyViewport * (bodyViewport / bodyTotal))
    const thumbTop = headerHeight + (container.scrollTop / maxScrollTop) * (bodyViewport - thumbHeight)
    setScrollbar({ visible: true, headerHeight, thumbTop, thumbHeight })
  }

  useLayoutEffect(updateScrollbar, deps)

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
  }, deps)

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
