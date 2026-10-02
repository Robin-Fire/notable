import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { PlannerTask, TaskPlacement } from '../../shared/contracts'
import { resolveCalendarDrop } from './calendarDrop'

type DragGhost = { task: PlannerTask; x: number; y: number; placement: TaskPlacement | null }
export function useReadyDrag(root: RefObject<HTMLDivElement | null>, schedule: (task: PlannerTask, placement: TaskPlacement) => Promise<boolean>) {
  const [ghost, setGhost] = useState<DragGhost | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)
  const lastDrag = useRef(0)
  const saveRef = useRef(schedule)
  saveRef.current = schedule
  useEffect(() => () => cancelRef.current?.(), [])

  function begin(event: ReactPointerEvent<HTMLElement>, task: PlannerTask) {
    if (event.button !== 0 || !event.isPrimary) return
    cancelRef.current?.()
    const source = event.currentTarget, pointerId = event.pointerId
    const startX = event.clientX, startY = event.clientY
    let x = startX, y = startY, active = false, frame = 0
    let touchTimer: ReturnType<typeof setTimeout> | undefined
    const touch = event.pointerType === 'touch'
    const oldCursor = document.body.style.cursor
    const activate = () => {
      active = true
      document.body.style.cursor = 'grabbing'
      source.setPointerCapture(pointerId)
      update()
      frame = requestAnimationFrame(scroll)
    }
    const update = () => setGhost({ task, x, y, placement: root.current ? resolveCalendarDrop(root.current, x, y) : null })
    const scroll = () => {
      const viewport = root.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')
      if (viewport) {
        const rect = viewport.getBoundingClientRect()
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          const before = viewport.scrollTop
          if (y < rect.top + 48) viewport.scrollTop -= Math.ceil((rect.top + 48 - y) / 4)
          else if (y > rect.bottom - 48) viewport.scrollTop += Math.ceil((y - rect.bottom + 48) / 4)
          if (before !== viewport.scrollTop) update()
        }
      }
      frame = requestAnimationFrame(scroll)
    }
    const cleanup = () => {
      clearTimeout(touchTimer); cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', cancel)
      if (source.hasPointerCapture(pointerId)) source.releasePointerCapture(pointerId)
      document.body.style.cursor = oldCursor
      cancelRef.current = null
      if (active) lastDrag.current = performance.now()
      setGhost(null)
    }
    const cancel = () => cleanup()
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); cleanup() } }
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      x = event.clientX; y = event.clientY
      const distance = Math.hypot(x - startX, y - startY)
      if (!active) {
        if (touch) { if (distance > 5) cleanup(); return }
        if (distance < 5) return
        activate()
      }
      event.preventDefault(); update()
    }
    const release = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      const placement = active && root.current ? resolveCalendarDrop(root.current, event.clientX, event.clientY) : null
      cleanup()
      if (placement) void saveRef.current(task, placement)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', cancel)
    cancelRef.current = cleanup
    if (touch) touchTimer = setTimeout(activate, 250)
  }
  return { begin, ghost, wasDragged: () => performance.now() - lastDrag.current < 300 }
}
