import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Check, Clock3 } from 'lucide-react'
import type { PlannerEvent } from '../../shared/contracts'
const localInput = (timestamp: number) => new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
const dateInput = (isoDate: string) => `${isoDate}T09:00`

export function EventDialog({ event, initialDate, onClose, onSave }: {
  event: PlannerEvent | 'new'
  initialDate: string
  onClose: () => void
  onSave: (input: { id?: string; title: string; startAt: number; endAt: number; allDay: boolean }) => Promise<string | null>
}) {
  const [title, setTitle] = useState(event === 'new' ? '' : event.title)
  const [start, setStart] = useState(event === 'new' ? dateInput(initialDate) : localInput(event.startAt))
  const [end, setEnd] = useState(event === 'new' ? `${initialDate}T09:30` : localInput(event.endAt))
  const [allDay, setAllDay] = useState(event !== 'new' && event.allDay)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLFormElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const previousFocus = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null)

  useEffect(() => {
    titleRef.current?.focus()
    return () => previousFocus.current?.focus()
  }, [])

  function containFocus(keyEvent: KeyboardEvent<HTMLFormElement>) {
    if (keyEvent.key === 'Escape') { keyEvent.preventDefault(); onClose(); return }
    if (keyEvent.key !== 'Tab' || !dialogRef.current) return
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)')]
    const first = focusable[0], last = focusable.at(-1)
    if (keyEvent.shiftKey && document.activeElement === first) { keyEvent.preventDefault(); last?.focus() }
    else if (!keyEvent.shiftKey && document.activeElement === last) { keyEvent.preventDefault(); first?.focus() }
  }

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault()
    setError('')
    const startDate = new Date(start)
    if (!Number.isFinite(startDate.getTime())) { setError('Choose a valid meeting start.'); return }
    let startAt = startDate.getTime()
    let endAt = new Date(end).getTime()
    if (allDay) {
      startDate.setHours(0, 0, 0, 0)
      startAt = startDate.getTime()
      const next = new Date(startDate)
      next.setDate(next.getDate() + 1)
      endAt = next.getTime()
    }
    if (!Number.isFinite(endAt) || endAt <= startAt) { setError('End time must be after start time.'); return }
    const saveError = await onSave({ ...(event === 'new' ? {} : { id: event.id }), title, startAt, endAt, allDay })
    if (saveError) setError(saveError)
  }

  return <div className="modal-backdrop"><form ref={dialogRef} className="dialog-card event-dialog" role="dialog" aria-modal="true" aria-labelledby="event-dialog-title" onSubmit={(formEvent) => void submit(formEvent)} onKeyDown={containFocus}>
    <div className="event-dialog-kicker"><Clock3 size={15} /> SCHEDULED MEETING</div>
    <h2 id="event-dialog-title">{event === 'new' ? 'Add a meeting' : 'Edit meeting'}</h2>
    <label>Title<input ref={titleRef} className="text-field" maxLength={120} value={title} onChange={(change) => setTitle(change.target.value)} required aria-describedby={error ? 'event-error' : undefined} /></label>
    {!allDay && <div className="event-form-times"><label>Starts<input className="text-field" type="datetime-local" value={start} onChange={(change) => setStart(change.target.value)} required aria-invalid={Boolean(error)} aria-describedby={error ? 'event-error' : undefined} /></label><label>Ends<input className="text-field" type="datetime-local" value={end} onChange={(change) => setEnd(change.target.value)} required aria-invalid={Boolean(error)} aria-describedby={error ? 'event-error' : undefined} /></label></div>}
    {allDay && <label>Date<input className="text-field" type="date" value={start.slice(0, 10)} onChange={(change) => setStart(`${change.target.value}T00:00`)} required aria-invalid={Boolean(error)} aria-describedby={error ? 'event-error' : undefined} /></label>}
    <label className="all-day-choice"><input type="checkbox" checked={allDay} onChange={(change) => setAllDay(change.target.checked)} /> All day</label>
    <p>Meeting rows stay compact, regardless of their duration. Tasks can be ordered around them.</p>
    {error && <div id="event-error" className="inline-error" role="alert">{error}</div>}
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary"><Check size={14} /> Save meeting</button></div>
  </form></div>
}
