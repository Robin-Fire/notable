import type { PlannerTask } from './contracts'

export type PlannerMoveTarget = {
  id: string
  plannedDate: string | null
  beforeEventId: string | null
  beforeId: string | null
}

export function resolvePlannerDrop(activeId: string, overId: string | null, deltaY: number, tasks: PlannerTask[]): PlannerMoveTarget | null {
  if (!overId || activeId === overId) return null
  const active = tasks.find((task) => task.id === activeId)
  if (!active) return null
  if (overId === 'lane:unscheduled') return active.plannedDate === null ? null : { id: active.id, plannedDate: null, beforeEventId: null, beforeId: null }

  if (overId.startsWith('lane:')) {
    const [, day, anchor = 'end'] = overId.split(':')
    if (anchor === 'overdue') return null
    if (day === 'unscheduled') return active.plannedDate === null ? null : { id: active.id, plannedDate: null, beforeEventId: null, beforeId: null }
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
    const beforeEventId = anchor === 'end' ? null : anchor
    return { id: active.id, plannedDate: day, beforeEventId, beforeId: null }
  }

  const target = tasks.find((task) => task.id === overId)
  if (!target) return null
  const slotTasks = tasks.filter((task) => task.id !== active.id && task.completedAt == null && task.plannedDate === target.plannedDate && task.beforeEventId === target.beforeEventId).sort((a, b) => a.position - b.position)
  const targetIndex = slotTasks.findIndex((task) => task.id === target.id)
  const insertionIndex = targetIndex + (deltaY > 0 ? 1 : 0)
  const beforeId = slotTasks[insertionIndex]?.id ?? null
  return { id: active.id, plannedDate: target.plannedDate, beforeEventId: target.beforeEventId, beforeId }
}
