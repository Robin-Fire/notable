import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, FileText, Info, ListTodo, Tag, X } from 'lucide-react'
import type { Category, InboxPage, Note, TagRecord } from '../../shared/contracts'
import { collectTags, TagEditor } from '../components/TagEditor'
import { ItemImages } from '../components/ItemImages'

const valueOf = <T,>(result: { ok: true; value: T } | { ok: false; message: string }) => {
  if (!result.ok) throw new Error(result.message)
  return result.value
}

function dateLabel(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
}

export function InboxView({ onOpen }: { onOpen: (id: string) => void }) {
  const [items, setItems] = useState<Note[]>([])
  const [total, setTotal] = useState(0)
  const [nextCursor, setNextCursor] = useState<InboxPage['nextCursor']>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tagRecords, setTagRecords] = useState<TagRecord[]>([])
  const filingRef = useRef(false)
  const filingBroadcastSeen = useRef(false)
  const skipNextBroadcast = useRef(false)

  const load = useCallback(async (cursor?: InboxPage['nextCursor'], append = false) => {
    setLoading(true)
    try {
      const page = valueOf(await window.notable.planner.inbox({ cursor: cursor ?? undefined, limit: 50 }))
      setItems((current) => append ? [...current, ...page.items] : page.items)
      setNextCursor(page.nextCursor); setTotal(page.total); setError('')
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Inbox could not be loaded.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load(); return window.notable.planner.onChanged(() => {
    if (filingRef.current) { filingBroadcastSeen.current = true; return }
    if (skipNextBroadcast.current) { skipNextBroadcast.current = false; return }
    void load()
  }) }, [load])
  useEffect(() => { void window.notable.notes.taxonomy().then((result) => { if (result.ok) { setCategories(result.value.categories); setTagRecords(result.value.tags); setSuggestions(result.value.tags.map((tag) => tag.name)) } }) }, [])

  async function file(item: Note, kind: 'note' | 'task', tags: string[], categoryId: string | null) {
    if (pendingId) return
    filingRef.current = true
    filingBroadcastSeen.current = false
    setPendingId(item.id)
    try {
      valueOf(await window.notable.planner.classify({ id: item.id, kind, tags, categoryId }))
      try { localStorage.removeItem(`inbox-tags:${item.id}`) } catch { /* Filing still succeeded. */ }
      setItems((current) => current.filter((candidate) => candidate.id !== item.id))
      setTotal((count) => Math.max(0, count - 1))
      if (!filingBroadcastSeen.current) skipNextBroadcast.current = true
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The item could not be filed.') }
    finally { filingRef.current = false; setPendingId(null) }
  }

  async function setCategory(id: string, categoryId: string | null) {
    try { valueOf(await window.notable.notes.setCategory({ id, categoryId })); return true }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Category could not be changed.'); return false }
  }

  return <section className="inbox-page">
    <header className="planner-page-heading"><div><span className="eyebrow">CAPTURE FIRST · SORT WHEN READY</span><h1>Inbox <span className="title-count">{total}</span></h1><p>Every thought lands here. Add tags, then file it as a note or a task.</p></div></header>
    {error && <div className="inline-error" role="alert"><Info size={15} /><span>{error}</span><button onClick={() => void load()}>Retry</button></div>}
    {loading && !items.length ? <div className="loading-state"><span className="spinner" /> Loading inbox…</div> : !items.length ? <div className="inbox-empty"><div className="empty-mark"><Archive size={19} /></div><h2>Nothing waiting.</h2><p>New captures appear here, ready for a quick sort.</p></div> : <><div className="inbox-list">{items.map((item) => <InboxCard key={item.id} item={item} onFile={file} onCategoryChange={setCategory} onOpen={onOpen} busy={pendingId !== null} suggestions={suggestions} categories={categories} tagRecords={tagRecords} />)}</div>{nextCursor && <button className="load-more" onClick={() => void load(nextCursor, true)} disabled={loading}>Load older Inbox items</button>}</>}
  </section>
}

function readTagDraft(item: Note): { tags: string[]; draft: string; categoryId: string | null } {
  try {
    const stored = localStorage.getItem(`inbox-tags:${item.id}`)
    if (stored) {
      const value: unknown = JSON.parse(stored)
      if (value && typeof value === 'object' && 'tags' in value && 'draft' in value && Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === 'string') && typeof value.draft === 'string') return { tags: collectTags(value.tags), draft: value.draft, categoryId: 'categoryId' in value && (typeof value.categoryId === 'string' || value.categoryId === null) ? value.categoryId : item.categoryId }
    }
  } catch { /* Use the stored item tags when local drafts are unavailable. */ }
  return { tags: item.tags, draft: '', categoryId: item.categoryId }
}

function InboxCard({ item, onFile, onCategoryChange, onOpen, busy, suggestions, categories, tagRecords }: { item: Note; onFile: (item: Note, kind: 'note' | 'task', tags: string[], categoryId: string | null) => void; onCategoryChange: (id: string, categoryId: string | null) => Promise<boolean>; onOpen: (id: string) => void; busy: boolean; suggestions: string[]; categories: Category[]; tagRecords: TagRecord[] }) {
  const stateRef = useRef<{ tags: string[]; draft: string; categoryId: string | null } | null>(null)
  if (!stateRef.current) stateRef.current = readTagDraft(item)
  const [tags, setTags] = useState(stateRef.current.tags)
  const [draft, setDraft] = useState(stateRef.current.draft)
  const [categoryId, setCategoryId] = useState<string | null>(stateRef.current.categoryId)
  const [tagsOpen, setTagsOpen] = useState(false)
  const tagPickerRef = useRef<HTMLDivElement>(null)
  const tagButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!tagsOpen) return
    tagPickerRef.current?.querySelector('input')?.focus()
    const dismiss = (event: PointerEvent) => {
      if (!tagPickerRef.current?.contains(event.target as Node)) setTagsOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [tagsOpen])
  function persist(value: { tags: string[]; draft: string; categoryId: string | null }) {
    try { localStorage.setItem(`inbox-tags:${item.id}`, JSON.stringify(value)) } catch { /* Classification still uses the in-memory value. */ }
  }
  const changeTags = (next: string[]) => { stateRef.current = { ...stateRef.current!, tags: next }; setTags(next); persist(stateRef.current) }
  const changeDraft = (next: string) => { stateRef.current = { ...stateRef.current!, draft: next }; setDraft(next); persist(stateRef.current) }
  const categoryTags = categoryId ? tagRecords.filter((tag) => tag.categoryId === categoryId) : []
  function toggleCategoryTag(name: string) { changeTags(tags.some((tag) => tag.toLocaleLowerCase() === name.toLocaleLowerCase()) ? tags.filter((tag) => tag.toLocaleLowerCase() !== name.toLocaleLowerCase()) : collectTags(tags, name)) }
  return <article className="inbox-card">
    <button className="inbox-card-body" disabled={busy} onClick={() => onOpen(item.id)} aria-label="Open and edit this captured item">
      <span className="inbox-card-text">{item.body.trim() || (item.images.length ? 'Image capture' : 'Empty capture')}</span>
      <span className="inbox-card-time">{dateLabel(item.createdAt)}</span>
    </button>
    <ItemImages images={item.images} />
    <div className="inbox-card-actions">
      <div className="inbox-tag-picker" ref={tagPickerRef} onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); setTagsOpen(false); tagButtonRef.current?.focus() }
      }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setTagsOpen(false) }}>
        <button ref={tagButtonRef} className="inbox-tag-trigger" disabled={busy} aria-label="Edit tags" aria-expanded={tagsOpen} onClick={() => setTagsOpen(!tagsOpen)}>
          <Tag size={13} /><span>{tags.length ? `${tags.length} tag${tags.length === 1 ? '' : 's'}` : draft.trim() ? 'Tag draft' : 'Add tags'}</span>
        </button>
        {tagsOpen && <div className="inbox-tag-popover" role="group" aria-label="Tags">
          <div className="inbox-tag-heading"><strong>Tags</strong><button aria-label="Close tags" onClick={() => { setTagsOpen(false); tagButtonRef.current?.focus() }}><X size={14} /></button></div>
          {categoryId && <div className="inbox-category-tags" aria-label={`Tags in ${categories.find((category) => category.id === categoryId)?.name ?? 'category'}`}>{categoryTags.length ? categoryTags.map((tag) => {
            const selected = tags.some((name) => name.toLocaleLowerCase() === tag.name.toLocaleLowerCase())
            return <button type="button" key={tag.id} disabled={busy} className={selected ? 'is-selected' : ''} aria-pressed={selected} onClick={() => toggleCategoryTag(tag.name)}>{tag.name}</button>
          }) : <span>No tags in this category yet.</span>}</div>}
          <TagEditor tags={tags} draft={draft} onTagsChange={changeTags} onDraftChange={changeDraft} suggestions={categoryId ? categoryTags.map((tag) => tag.name) : suggestions} disabled={busy} hint="Enter to add · drafts saved automatically" />
        </div>}
      </div>
      <label className="inbox-category-select">Category <select disabled={busy} aria-label="Category for item" value={categoryId ?? ''} onChange={(event) => {
        const selected = event.target.value || null
        const previous = categoryId
        setCategoryId(selected)
        setTagsOpen(Boolean(selected))
        stateRef.current = { ...stateRef.current!, categoryId: selected }
        persist(stateRef.current)
        void onCategoryChange(item.id, selected).then((saved) => {
          if (!saved && stateRef.current?.categoryId === selected) {
            setCategoryId(previous)
            stateRef.current = { ...stateRef.current, categoryId: previous }
            persist(stateRef.current)
          }
        })
      }}><option value="">Unassigned</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <div className="inbox-file-actions"><span className="inbox-file-hint">File as</span><button disabled={busy} className="button secondary small" onClick={() => onFile(item, 'note', collectTags(tags, draft), categoryId)}><FileText size={14} /> Note</button><button disabled={busy} className="button primary small" onClick={() => onFile(item, 'task', collectTags(tags, draft), categoryId)}><ListTodo size={14} /> To-do</button></div>
    </div>
    {tags.length > 0 && <div className="inbox-tag-summary">{tags.map((tag) => <span key={tag} className="inbox-tag-label"><Tag size={10} />{tag}</span>)}</div>}
  </article>
}
