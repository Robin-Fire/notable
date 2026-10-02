import type { PlannerEvent, PlannerTask } from '../../shared/contracts'
import { addLocalDays, fromLocalISODate } from '../../shared/plannerDates'
import type { CalendarEvent } from '../components/reui/event-calendar/event-calendar-types'

export type CalendarItemData = { kind: 'meeting'; record: PlannerEvent } | { kind: 'task'; record: PlannerTask }
export type CalendarItem = CalendarEvent<CalendarItemData>
export function meetingItem(record: PlannerEvent): CalendarItem {
  return { id: `meeting:${record.id}`, title: record.title, start: new Date(record.startAt), end: new Date(record.endAt), allDay: record.allDay, color: 'var(--blue)', data: { kind: 'meeting', record } }
}
export function taskItem(record: PlannerTask): CalendarItem | null {
  if (!record.plannedDate && record.plannedStartAt === null) return null
  const timed = record.plannedStartAt !== null && record.plannedEndAt !== null
  return { id: `task:${record.id}`, title: record.body.split('\n')[0] || 'Untitled task', start: timed ? new Date(record.plannedStartAt!) : fromLocalISODate(record.plannedDate!), end: timed ? new Date(record.plannedEndAt!) : fromLocalISODate(addLocalDays(record.plannedDate!, 1)), allDay: !timed, color: 'var(--green)', readOnly: record.completedAt !== null, resizable: timed && record.completedAt === null, data: { kind: 'task', record } }
}
export function calendarItems(tasks: PlannerTask[], events: PlannerEvent[]): CalendarItem[] {
  return [...events.map(meetingItem), ...tasks.flatMap((task) => { const item = taskItem(task); return item ? [item] : [] })]
}
