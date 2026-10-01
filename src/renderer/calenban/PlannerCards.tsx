import { EllipsisVertical, Pencil, Trash2 } from 'lucide-react'
import type { PlannerEvent, PlannerTask } from '../../shared/contracts'
import { toLocalISODate } from '../../shared/plannerDates'
import { KanbanItem, KanbanItemHandle } from '../components/reui/kanban'

const toISO = toLocalISODate
const time = (timestamp: number) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(timestamp)

export function MeetingRow({ event, events, day, onEdit, onDelete }: { event: PlannerEvent; events: PlannerEvent[]; day: string; onEdit: (event: PlannerEvent) => void; onDelete: (id: string) => void }) {
  const overlaps = events.some((other) => other.id !== event.id && other.startAt < event.endAt && other.endAt > event.startAt)
  const startsBefore = toISO(new Date(event.startAt)) < day
  const endsAfter = toISO(new Date(event.endAt - 1)) > day
  return <article className={`compact-meeting ${event.allDay ? 'all-day' : ''}`} title={`${event.title} · ${event.allDay ? 'All day' : `${time(event.startAt)}–${time(event.endAt)}`}`}>
    <span className="meeting-pin" />
    <span className="compact-meeting-time">{startsBefore ? 'CONTINUED' : event.allDay ? 'ALL DAY' : time(event.startAt)}{endsAfter ? ' · CONTINUES' : !event.allDay && `–${time(event.endAt)}`}</span>
    <b>{event.title}{overlaps && <i className="event-overlap">OVERLAP</i>}</b>
    <div className="compact-meeting-actions"><button className="icon-button" title="Edit meeting" aria-label="Edit meeting" onClick={() => onEdit(event)}><Pencil size={12} /></button><button className="icon-button danger-icon" title="Remove meeting" aria-label="Remove meeting" onClick={() => onDelete(event.id)}><Trash2 size={12} /></button></div>
  </article>
}

export function PlannerTaskCard({ task, days, onDelete, onOpen, onComplete }: {
  task: PlannerTask
  days: string[]
  onDelete: (id: string) => void
  onOpen: (task: PlannerTask) => void
  onComplete: (id: string, completed: boolean) => void
}) {
  const title = task.body.split('\n').find((line) => line.trim())?.trim() || (task.images.length ? 'Image to-do' : 'Untitled task')
  const rest = task.body.split('\n').slice(1).join(' ').trim()
  const openDetails = () => onOpen(task)
  const menu = <details className="planner-task-menu"><summary aria-label={`Options for ${title}`} title="Task options"><EllipsisVertical size={15} /></summary><div className="planner-task-menu-popup"><button type="button" onClick={() => onDelete(task.id)}><Trash2 size={13} /> Delete task</button></div></details>
  const copy = <div className="planner-task-copy">
    <button type="button" className="planner-task-title" onClick={openDetails}>{title}</button>
    {rest && <small>{rest}</small>}
    {task.tags.length > 0 && <span className="planner-tags">{task.tags.map((tag) => <i key={tag}>{tag}</i>)}</span>}
    {task.images.length > 0 && <span className="planner-image-count">{task.images.length} {task.images.length === 1 ? 'image' : 'images'}</span>}
    {task.plannedDate && task.plannedDate < (days[0] ?? '') && <span className="past-due-label">Past plan</span>}
  </div>
  const content = <div className={`planner-task-card ${task.completedAt != null ? 'is-completed' : ''}`}>
    <input className="planner-task-completion" type="checkbox" aria-label={`${task.completedAt != null ? 'Reopen' : 'Mark as done'} to-do: ${title}`} checked={task.completedAt != null} onChange={(event) => onComplete(task.id, event.target.checked)} />
    {task.completedAt == null ? <KanbanItemHandle label={'Drag ' + title + ' to another day'}>⠿</KanbanItemHandle> : <span className="planner-task-drag-spacer" aria-hidden="true" />}
    {copy}
    {menu}
  </div>
  return task.completedAt != null ? <article className="planner-task-static" data-task-id={task.id}>{content}</article> : <KanbanItem id={task.id}>{content}</KanbanItem>
}
