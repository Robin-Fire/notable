import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Archive, Copy, Save, Trash2 } from 'lucide-react'
import type { PlannerTask } from '../../shared/contracts'
import { collectTags, TagEditor } from '../components/TagEditor'
import { ItemImages } from '../components/ItemImages'

function resultValue<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(result.message)
  return result.value
}

export function TaskDetailDialog({ task, suggestions, onClose, onChanged }: { task: PlannerTask; suggestions: string[]; onClose: () => void; onChanged: () => void }) {
  const [body, setBody] = useState(task.body)
  const [tags, setTags] = useState(task.tags)
  const [tagDraft, setTagDraft] = useState('')
  const [savedBody, setSavedBody] = useState(task.body)
  const [savedTags, setSavedTags] = useState(task.tags)
  const [revision, setRevision] = useState(task.revision)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const changed = body !== savedBody || collectTags(tags, tagDraft).join('\u0000') !== savedTags.join('\u0000')

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus()
    return () => previousFocus.current?.focus()
  }, [])

  function containFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (changed && !window.confirm('Discard unsaved task changes?')) return
      onClose()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('textarea, input, button:not(:disabled)')]
    const first = focusable[0], last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }

  async function save() {
    setBusy(true); setError('')
    try {
      const result = resultValue(await window.notable.notes.updateItem({ id: task.id, expectedRevision: revision, body, tags: collectTags(tags, tagDraft) }))
      setRevision(result.revision); setSavedBody(result.body); setSavedTags(result.tags); setTags(result.tags); setTagDraft(''); onChanged()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The task could not be saved.') }
    finally { setBusy(false) }
  }

  async function copy() {
    try { const text = resultValue(await window.notable.notes.copy([task.id])); setNotice(text ? 'Copied to clipboard.' : 'Nothing to copy.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The task could not be copied.') }
  }

  async function trash() {
    if (changed && !window.confirm('Discard unsaved changes and move this task to Trash?')) return
    setBusy(true)
    try { resultValue(await window.notable.notes.trash([task.id])); onChanged(); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The task could not be moved to Trash.') }
    finally { setBusy(false) }
  }

  async function returnToInbox() {
    if (changed && !window.confirm('Discard unsaved changes and return this task to Inbox?')) return
    setBusy(true)
    try { resultValue(await window.notable.planner.unfile(task.id)); onChanged(); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The task could not be returned to Inbox.') }
    finally { setBusy(false) }
  }

  return <div className="modal-backdrop"><div ref={dialogRef} className="dialog-card task-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="task-detail-title" onKeyDown={containFocus}>
    <div className="event-dialog-kicker">TO-DO DETAILS</div><h2 id="task-detail-title">Edit to-do</h2>
    <label className="task-detail-body-label">Full text<textarea className="note-editor task-detail-editor" value={body} maxLength={50_000} onChange={(event) => setBody(event.target.value)} aria-label="Full task text" /></label>
    <ItemImages images={task.images} />
    <div className="task-detail-tags"><span>Tags</span><TagEditor tags={tags} draft={tagDraft} onTagsChange={setTags} onDraftChange={setTagDraft} suggestions={suggestions} disabled={busy} /></div>
    {error && <div className="inline-error" role="alert">{error}</div>}
    {notice && <div role="status" className="task-detail-notice">{notice}</div>}
    <div className="task-detail-actions">
      <button className="button secondary small" onClick={() => void copy()} disabled={busy}><Copy size={14} /> Copy</button>
      <button className="button secondary small" onClick={() => void returnToInbox()} disabled={busy}><Archive size={14} /> Return to Inbox</button>
      <button className="button secondary small danger-action" onClick={() => void trash()} disabled={busy}><Trash2 size={14} /> Trash</button>
      <span />
      <button className="button secondary small" onClick={() => { if (!changed || window.confirm('Discard unsaved task changes?')) onClose() }} disabled={busy}>Close</button>
      <button className="button primary small" onClick={() => void save()} disabled={busy || !changed}><Save size={14} /> Save</button>
    </div>
  </div></div>
}
