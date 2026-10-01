import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'
import { ArrowLeft, ArrowRight, ChevronDown, Info, PanelLeftClose, PanelLeftOpen, Plus, RotateCcw } from 'lucide-react'
import type { DeletedPlannerEvent, PlannerEvent, PlannerEventInput, PlannerTask } from '../../shared/contracts'
import { addLocalDays, eventOverlapsLocalDay, fromLocalISODate, mondayISO, toLocalISODate } from '../../shared/plannerDates'
import { resolvePlannerDrop } from '../../shared/plannerDrop'
import { Kanban, KanbanBoard, KanbanColumnContent } from '../components/reui/kanban'
import { EventDialog } from './EventDialog'
import { PlannerDayColumn } from './PlannerDayColumn'
import { PlannerTaskCard } from './PlannerCards'
import { TaskDetailDialog } from './TaskDetailDialog'
import { UnscheduledPane } from './UnscheduledPane'
import { usePlannerData } from './usePlannerData'

const getValue = <T,>(result: { ok: true; value: T } | { ok: false; message: string }): T => {
  if (!result.ok) throw new Error(result.message)
  return result.value
}
const toISO = toLocalISODate
const plusDays = addLocalDays
const mondayOf = mondayISO
const dayTitle = (iso: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(fromLocalISODate(iso))
type PlannerMode = 'day' | 'three' | 'week'
const modeDays: Record<PlannerMode, number> = { day: 1, three: 3, week: 7 }

export function CalenbanView() {
  const [mode, setMode] = useState<PlannerMode>('three')
  const [rangeStart, setRangeStart] = useState(() => toISO(new Date()))
  const [showTray, setShowTray] = useState(true)
  const [showOverdue, setShowOverdue] = useState(() => window.innerWidth >= 900)
  const rangeEnd = plusDays(rangeStart, modeDays[mode] - 1)
  const { tasks, events, tags, loading, error: loadError, refresh } = usePlannerData(rangeStart, rangeEnd)
  const [mutationError, setMutationError] = useState('')
  const [eventDialog, setEventDialog] = useState<PlannerEvent | 'new' | null>(null)
  const [eventDate, setEventDate] = useState(rangeStart)
  const [deletedEvent, setDeletedEvent] = useState<DeletedPlannerEvent | null>(null)
  const [detailTask, setDetailTask] = useState<PlannerTask | null>(null)
  const days = useMemo(() => Array.from({ length: modeDays[mode] }, (_, index) => plusDays(rangeStart, index)), [mode, rangeStart])
  const today = toISO(new Date())

  useEffect(() => {
    if (!deletedEvent) return
    const timer = setTimeout(() => setDeletedEvent(null), 10_000)
    return () => clearTimeout(timer)
  }, [deletedEvent])

  const unscheduled = tasks.filter((task) => task.plannedDate === null)
  const overdue = tasks.filter((task) => task.plannedDate !== null && task.plannedDate < days[0]!)
  const eventById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events])
  const tasksBySlot = useMemo(() => {
    const slots = new Map<string, PlannerTask[]>()
    for (const task of tasks) {
      if (!task.plannedDate) continue
      const anchoredEvent = task.beforeEventId ? eventById.get(task.beforeEventId) : undefined
      const visibleAnchor = anchoredEvent && eventOverlapsLocalDay(anchoredEvent.startAt, anchoredEvent.endAt, task.plannedDate) ? task.beforeEventId : null
      const key = `${task.plannedDate}\u0000${visibleAnchor ?? ''}`
      slots.set(key, [...(slots.get(key) ?? []), task])
    }
    for (const list of slots.values()) list.sort((left, right) => left.position - right.position)
    return slots
  }, [eventById, tasks])
  const eventsByDay = useMemo(() => {
    const byDay = new Map<string, PlannerEvent[]>()
    for (const day of days) byDay.set(day, events.filter((event) => eventOverlapsLocalDay(event.startAt, event.endAt, day)).sort((a, b) => a.startAt - b.startAt))
    return byDay
  }, [days, events])
  const moveTask = useCallback(async (id: string, plannedDate: string | null, beforeEventId: string | null, beforeId: string | null) => {
    try { getValue(await window.notable.planner.move({ id, plannedDate, beforeEventId, beforeId })); setMutationError('') }
    catch (reason) { setMutationError(reason instanceof Error ? reason.message : 'The task could not be moved.') }
  }, [])

  const onDrop = useCallback((event: DragEndEvent, placement: 'before' | 'after') => {
    const target = resolvePlannerDrop(String(event.active.id), event.over ? String(event.over.id) : null, placement === 'after' ? 1 : -1, tasks)
    if (target) void moveTask(target.id, target.plannedDate, target.beforeEventId, target.beforeId)
  }, [moveTask, tasks])

  function startNewEvent(day?: string) {
    setEventDate(day ?? (days.includes(today) ? today : days[0]!))
    setEventDialog('new')
  }

  function selectMode(next: PlannerMode) {
    const selectedDay = days.includes(today) ? today : days[0]!
    setMode(next)
    setRangeStart(next === 'week' ? mondayOf(fromLocalISODate(selectedDay)) : selectedDay)
  }

  function navigate(direction: -1 | 1) { setRangeStart((start) => plusDays(start, direction * modeDays[mode])) }

  function jumpToDay(day: string) {
    document.querySelector<HTMLElement>(`[data-day="${day}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
  }

  async function saveEvent(input: PlannerEventInput): Promise<string | null> {
    try {
      if (input.id) getValue(await window.notable.planner.updateEvent({ ...input, id: input.id }))
      else getValue(await window.notable.planner.createEvent(input))
      setMutationError('')
      setEventDialog(null)
      return null
    } catch (reason) { const message = reason instanceof Error ? reason.message : 'The meeting could not be saved.'; setMutationError(message); return message }
  }

  async function removeEvent(id: string) {
    try { setDeletedEvent(getValue(await window.notable.planner.deleteEvent(id))); setMutationError('') }
    catch (reason) { setMutationError(reason instanceof Error ? reason.message : 'The meeting could not be removed.') }
  }

  async function undoDeleteEvent() {
    if (!deletedEvent) return
    try { getValue(await window.notable.planner.undoDeleteEvent(deletedEvent)); setDeletedEvent(null); setMutationError('') }
    catch (reason) { setMutationError(reason instanceof Error ? reason.message : 'The meeting could not be restored.') }
  }

  async function deleteTask(id: string) {
    try { getValue(await window.notable.notes.trash([id])); setMutationError(''); setDetailTask((task) => task?.id === id ? null : task) }
    catch (reason) { setMutationError(reason instanceof Error ? reason.message : 'The task could not be deleted.') }
  }
  const laneTasks = (day: string, eventId: string | null) => tasksBySlot.get(`${day}\u0000${eventId ?? ''}`) ?? []

  return <section className="calenban-page">
    <header className="calenban-toolbar">
      <div className="planner-heading"><span className="eyebrow">YOUR TIME, IN ONE PLACE</span><h1>Plan</h1></div>
      <div className="calenban-controls">
        <div className="planner-view-switch" role="group" aria-label="Days to show">
          <button type="button" aria-pressed={mode === 'day'} onClick={() => selectMode('day')}>Day</button>
          <button type="button" aria-pressed={mode === 'three'} onClick={() => selectMode('three')}>3 days</button>
          <button type="button" aria-pressed={mode === 'week'} onClick={() => selectMode('week')}>Week</button>
        </div>
        <div className="planner-range-controls">
          <button className="icon-button bordered" aria-label={`Previous ${mode === 'day' ? 'day' : mode === 'three' ? 'three days' : 'week'}`} onClick={() => navigate(-1)}><ArrowLeft size={15} /></button>
          <button className="button secondary small" onClick={() => setRangeStart(mode === 'week' ? mondayOf(new Date()) : today)}>Today</button>
          <button className="icon-button bordered" aria-label={`Next ${mode === 'day' ? 'day' : mode === 'three' ? 'three days' : 'week'}`} onClick={() => navigate(1)}><ArrowRight size={15} /></button>
        </div>
        <button className="button secondary small tray-toggle" aria-pressed={showTray} onClick={() => setShowTray((visible) => !visible)}>{showTray ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}{showTray ? 'Hide Ready' : `Show Ready (${unscheduled.length})`}</button>
        <button className="button primary small" onClick={() => startNewEvent()}><Plus size={14} /> Add meeting</button>
      </div>
    </header>
    <div className="planner-range-bar">
      <div className="week-caption">{mode === 'day' ? dayTitle(days[0]!) : `${dayTitle(days[0]!)} — ${dayTitle(days.at(-1)!)}`}</div>
      {mode === 'week' && <nav className="planner-day-jump" aria-label="Jump to a day in this week">{days.map((day) => <button key={day} type="button" className={day === today ? 'is-today' : ''} onClick={() => jumpToDay(day)}>{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(fromLocalISODate(day))} {fromLocalISODate(day).getDate()}</button>)}</nav>}
    </div>
    {(mutationError || loadError) && <div className="inline-error" role="alert"><Info size={15} /><span>{mutationError || loadError}</span><button onClick={() => { setMutationError(''); void refresh() }}>Reload</button></div>}
    {loading && !tasks.length && !events.length ? <div className="loading-state"><span className="spinner" /> Loading your plan…</div> : <>
      <Kanban onMove={onDrop} overlay={(id) => { const task = tasks.find((item) => item.id === id); return task ? <div className="task-overlay">{task.body.split('\n')[0] || 'Untitled task'}</div> : null }}>
        {overdue.length > 0 && <div className={`overdue-tray ${showOverdue ? '' : 'is-collapsed'}`}><div className="overdue-heading"><b>Past plan</b><span>{overdue.length} open {overdue.length === 1 ? 'task' : 'tasks'}{showOverdue ? ' · drag onto a day to reschedule' : ''}</span><button type="button" aria-expanded={showOverdue} onClick={() => setShowOverdue((visible) => !visible)}><ChevronDown size={13} /> {showOverdue ? 'Hide' : 'Show tasks'}</button></div>{showOverdue && <KanbanColumnContent id="lane:overdue" items={overdue.map((task) => task.id)}><div className="overdue-cards">{overdue.map((task) => <PlannerTaskCard key={task.id} task={task} days={days} onDelete={deleteTask} onOpen={setDetailTask} />)}</div></KanbanColumnContent>}</div>}
        <div className={`calenban-workspace ${showTray ? '' : 'without-tray'} mode-${mode}`}>
          {showTray && <UnscheduledPane tasks={unscheduled} days={days} onDeleteTask={deleteTask} onOpen={setDetailTask} />}
          <KanbanBoard>{days.map((day) => <PlannerDayColumn key={day} day={day} today={today} days={days} dayEvents={eventsByDay.get(day) ?? []} laneTasks={laneTasks} onDeleteTask={deleteTask} onOpen={setDetailTask} onEditMeeting={setEventDialog} onDeleteMeeting={removeEvent} onAddMeeting={startNewEvent} />)}</KanbanBoard>
        </div>
      </Kanban>
    </>}
    {eventDialog && <EventDialog event={eventDialog} initialDate={eventDate} onClose={() => setEventDialog(null)} onSave={saveEvent} />}
    {detailTask && <TaskDetailDialog task={detailTask} suggestions={tags} onClose={() => setDetailTask(null)} onChanged={() => setMutationError('')} />}
    {deletedEvent && <div className="planner-undo-toast" role="status"><RotateCcw size={15} /><span>Meeting removed</span><button type="button" onClick={() => void undoDeleteEvent()}>Undo</button></div>}
  </section>
}

