import { CalendarDays, Plus } from 'lucide-react'
import type { PlannerEvent, PlannerTask } from '../../shared/contracts'
import { fromLocalISODate } from '../../shared/plannerDates'
import { KanbanColumn, KanbanColumnContent } from '../components/reui/kanban'
import { MeetingRow, PlannerTaskCard } from './PlannerCards'

const fromISO = fromLocalISODate

export function PlannerDayColumn({ day, today, days, dayEvents, laneTasks, onDeleteTask, onOpen, onEditMeeting, onDeleteMeeting, onAddMeeting }: {
  day: string
  today: string
  days: string[]
  dayEvents: PlannerEvent[]
  laneTasks: (day: string, eventId: string | null) => PlannerTask[]
  onDeleteTask: (id: string) => void
  onOpen: (task: PlannerTask) => void
  onEditMeeting: (event: PlannerEvent) => void
  onDeleteMeeting: (id: string) => void
  onAddMeeting: (day: string) => void
}) {
  const endTasks = laneTasks(day, null)
  const openCount = endTasks.length + dayEvents.reduce((count, event) => count + laneTasks(day, event.id).length, 0)
  return <KanbanColumn day={day}>
    <header className={`day-header ${day === today ? 'is-today' : ''}`}><span>{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(fromISO(day)).toUpperCase()}</span><b>{new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(fromISO(day))}</b><small>{openCount} open</small><button type="button" className="day-add-meeting" aria-label={`Add meeting on ${day}`} title="Add meeting on this day" onClick={() => onAddMeeting(day)}><Plus size={13} /></button></header>
    <div className="day-sequence">
      {dayEvents.map((meeting) => {
        const lane = laneTasks(day, meeting.id)
        return <div className="day-slot" key={meeting.id}><KanbanColumnContent id={`lane:${day}:${meeting.id}`} items={lane.map((task) => task.id)}>
          {lane.map((task) => <PlannerTaskCard key={task.id} task={task} days={days} onDelete={onDeleteTask} onOpen={onOpen} />)}
          <MeetingRow event={meeting} events={dayEvents} day={day} onEdit={onEditMeeting} onDelete={onDeleteMeeting} />
        </KanbanColumnContent></div>
      })}
      <div className="day-slot day-end-slot"><KanbanColumnContent id={`lane:${day}:end`} items={endTasks.map((task) => task.id)}>
        {endTasks.map((task) => <PlannerTaskCard key={task.id} task={task} days={days} onDelete={onDeleteTask} onOpen={onOpen} />)}
        {!dayEvents.length && !endTasks.length && <div className="drop-hint">Drop a task here</div>}
      </KanbanColumnContent></div>
    </div>
    <div className="day-footer"><CalendarDays size={12} /><span>{dayEvents.length} {dayEvents.length === 1 ? 'meeting' : 'meetings'}</span></div>
  </KanbanColumn>
}
