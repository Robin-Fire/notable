import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, type DragEndEvent, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, FolderKanban, GripVertical, Hash, Search, X } from 'lucide-react'
import type { Category, PlannerBacklogPage, PlannerTask, TagRecord } from '../../shared/contracts'
import { TaskDetailDialog } from '../calenban/TaskDetailDialog'

const valueOf = <T,>(result: { ok: true; value: T } | { ok: false; message: string }): T => {
  if (!result.ok) throw new Error(result.message)
  return result.value
}
const pageSize = 50
type Group = { id: string; name: string; categoryId: string | null; tags: TagRecord[]; allTags: TagRecord[] }

export function BacklogView() {
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<TagRecord[]>([])
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [detailTask, setDetailTask] = useState<PlannerTask | null>(null)
  const [error, setError] = useState('')
  const [taxonomyReady, setTaxonomyReady] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 150)
    return () => clearTimeout(timer)
  }, [query])

  const refreshTaxonomy = useCallback(async () => {
    try {
      const data = valueOf(await window.notiert.notes.taxonomy())
      setCategories((current) => JSON.stringify(current) === JSON.stringify(data.categories) ? current : data.categories)
      setTags((current) => JSON.stringify(current) === JSON.stringify(data.tags) ? current : data.tags)
      setTaxonomyReady(true)
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Categories and tags could not be loaded.') }
  }, [])
  useEffect(() => { void refreshTaxonomy(); return window.notiert.notes.onChanged(() => { void refreshTaxonomy() }) }, [refreshTaxonomy])

  const groups = useMemo<Group[]>(() => [
    ...categories.map((category) => ({ id: category.id, name: category.name, categoryId: category.id, tags: tags.filter((tag) => tag.categoryId === category.id), allTags: tags })),
    { id: 'unassigned', name: 'Unassigned', categoryId: null, tags: tags.filter((tag) => tag.categoryId === null), allTags: tags },
  ], [categories, tags])
  const total = groups.reduce((sum, group) => sum + (counts[group.id] ?? 0), 0)
  const setGroupCount = useCallback((id: string, count: number) => setCounts((current) => current[id] === count ? current : { ...current, [id]: count }), [])

  return <section className="backlog-page">
    <header className="backlog-header"><div><span className="eyebrow">TO-DOS BY CATEGORY</span><h1>Backlog <span className="title-count">{total}</span></h1><p>Drag to set priority within each category. The order carries over to category and tag views.</p></div></header>
    <div className="backlog-toolbar"><label className="search-box"><Search size={15} /><input aria-label="Search backlog" placeholder="Search tasks or tags…" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button aria-label="Clear backlog search" onClick={() => setQuery('')}><X size={13} /></button>}</label><span>{total} {total === 1 ? 'to-do' : 'to-dos'}</span></div>
    {error && <div className="inline-error" role="alert">{error}<button type="button" onClick={() => void refreshTaxonomy()}>Retry</button></div>}
    <div className="backlog-groups">
      {!taxonomyReady ? <div className="loading-state"><span className="spinner" /> Loading backlog…</div> : groups.map((group) => <BacklogCategoryGroup key={group.id} group={group} categories={categories} query={debouncedQuery} onCount={setGroupCount} onOpenTask={setDetailTask} onError={setError} />)}
    </div>
    {detailTask && <TaskDetailDialog task={detailTask} suggestions={tags.map((tag) => tag.name)} onClose={() => setDetailTask(null)} onChanged={() => setDetailTask(null)} />}
  </section>
}

function BacklogCategoryGroup({ group, categories, query, onCount, onOpenTask, onError }: { group: Group; categories: Category[]; query: string; onCount: (id: string, count: number) => void; onOpenTask: (task: PlannerTask) => void; onError: (message: string) => void }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [includeUntagged, setIncludeUntagged] = useState(true)
  const [additionalTagNames, setAdditionalTagNames] = useState<string[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [tasks, setTasks] = useState<PlannerTask[]>([])
  const [cursor, setCursor] = useState<PlannerBacklogPage['nextCursor']>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const tagOptions = useMemo<TagRecord[]>(() => {
    const names = new Set(group.tags.map((tag) => tag.name.toLocaleLowerCase()))
    return [...group.tags, ...additionalTagNames.filter((name) => !names.has(name.toLocaleLowerCase())).map((name): TagRecord => group.allTags.find((tag) => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase()) ?? { id: `backlog:${group.id}:${name}`, name, categoryId: group.categoryId, color: '#85858e', count: 0 })]
  }, [additionalTagNames, group.allTags, group.categoryId, group.id, group.tags])
  const selectedTags = tagOptions.filter((tag) => selected[tag.name] !== false).map((tag) => tag.name)
  const everyTagSelected = tagOptions.every((tag) => selected[tag.name] !== false) && includeUntagged
  const selectionFilter = useMemo(() => everyTagSelected ? {} : { tagNames: selectedTags, includeUntagged }, [everyTagSelected, includeUntagged, selectedTags.join('\u0000')])

  const refresh = useCallback(async () => {
    const request = ++requestId.current
    setLoading(true)
    setLoadingMore(false)
    try {
      const page = valueOf(await window.notiert.planner.backlog({ categoryId: group.categoryId, query, ...selectionFilter, limit: pageSize }))
      if (request !== requestId.current) return
      const extraTags = (page.tagNames ?? []).filter((name) => !group.tags.some((tag) => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
      setAdditionalTagNames((current) => current.length === extraTags.length && current.every((name, index) => name === extraTags[index]) ? current : extraTags)
      setTasks(page.items); setCursor(page.nextCursor); setTotal(page.total); onCount(group.id, page.total); setError(''); setLoaded(true)
    } catch (reason) {
      if (request === requestId.current) setError(reason instanceof Error ? reason.message : 'This category could not be loaded.')
    } finally { if (request === requestId.current) setLoading(false) }
  }, [group.categoryId, group.id, group.tags, onCount, query, selectionFilter, selectedTags.join('\u0000')])

  useEffect(() => {
    void refresh()
    const unsubscribe = window.notiert.planner.onChanged(() => { void refresh() })
    return () => { requestId.current += 1; unsubscribe() }
  }, [refresh])

  async function loadMore() {
    if (!cursor || loading || loadingMore) return
    const request = requestId.current
    setLoadingMore(true)
    try {
      const page = valueOf(await window.notiert.planner.backlog({ categoryId: group.categoryId, query, ...selectionFilter, cursor, limit: pageSize }))
      if (request !== requestId.current) return
      setTasks((current) => [...current, ...page.items]); setCursor(page.nextCursor); setTotal(page.total); onCount(group.id, page.total); setError('')
    } catch (reason) { if (request === requestId.current) setError(reason instanceof Error ? reason.message : 'Older to-dos could not be loaded.') }
    finally { if (request === requestId.current) setLoadingMore(false) }
  }

  function toggleTag(name: string) { setSelected((current) => ({ ...current, [name]: !(current[name] ?? true) })) }
  function selectAll() { setSelected({}); setIncludeUntagged(true) }
  async function setCategory(id: string, categoryId: string | null) {
    try { valueOf(await window.notiert.notes.setCategory({ id, categoryId })) }
    catch (reason) { onError(reason instanceof Error ? reason.message : 'Category could not be changed.') }
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  async function onDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id || query) return
    const oldIndex = tasks.findIndex((task) => task.id === event.active.id)
    const newIndex = tasks.findIndex((task) => task.id === event.over!.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(tasks, oldIndex, newIndex)
    let beforeId = reordered[newIndex + 1]?.id ?? null
    try {
      if (beforeId === null && cursor) {
        const nextPage = valueOf(await window.notiert.planner.backlog({ categoryId: group.categoryId, query, ...selectionFilter, cursor, limit: pageSize }))
        beforeId = nextPage.items[0]?.id ?? null
      }
      setTasks(reordered)
      valueOf(await window.notiert.planner.reorderBacklog({ id: String(event.active.id), categoryId: group.categoryId, beforeId })); void refresh()
    }
    catch (reason) { void refresh(); onError(reason instanceof Error ? reason.message : 'Priority could not be saved.') }
  }

  const canShowTasks = selectedTags.length > 0 || includeUntagged
  return <section className="backlog-group" aria-label={`${group.name} backlog`}>
    <button type="button" className="backlog-group-heading" aria-expanded={!collapsed} onClick={() => setCollapsed((current) => !current)}><FolderKanban size={16} /><b>{group.name}</b><span>{total}</span><ChevronDown size={15} className={collapsed ? 'is-closed' : ''} /></button>
    {!collapsed && <>
      <div className="backlog-category-filters" aria-label={`Filter ${group.name} by tag`}>
        {tagOptions.map((tag) => <button key={tag.id} type="button" className={`filter-pill ${selected[tag.name] !== false ? 'is-selected' : ''}`} aria-pressed={selected[tag.name] !== false} onClick={() => toggleTag(tag.name)}><Hash size={11} style={{ color: tag.color }} />{tag.name}</button>)}
        <button type="button" className={`filter-pill ${includeUntagged ? 'is-selected' : ''}`} aria-pressed={includeUntagged} onClick={() => setIncludeUntagged((value) => !value)}>No tag</button>
        {!everyTagSelected && <button type="button" className="filter-clear" onClick={selectAll}>Select all</button>}
      </div>
      {error && <div className="inline-error" role="alert">{error}<button type="button" onClick={() => void refresh()}>Retry</button></div>}
      {loading && !loaded ? <div className="loading-state"><span className="spinner" /> Loading to-dos…</div> : !tasks.length ? <div className="backlog-empty">{canShowTasks ? (query ? 'No to-dos match this search.' : 'No to-dos in this category.') : 'Select a tag to show matching to-dos.'}</div> : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onDragEnd(event)}>
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          <div className="backlog-task-list">{tasks.map((task) => <SortableBacklogTask key={task.id} task={task} categories={categories} onOpen={() => onOpenTask(task)} onReady={async () => {
            try { valueOf(await window.notiert.planner.setReady({ id: task.id })) }
            catch (reason) { onError(reason instanceof Error ? reason.message : 'To-do could not be added to Ready.') }
          }} onCategoryChange={(categoryId) => void setCategory(task.id, categoryId)} draggingDisabled={Boolean(query)} />)}</div>
        </SortableContext>
      </DndContext>}
      {cursor && <button type="button" className="load-more" disabled={loading || loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Loading…' : `Load ${Math.min(pageSize, total - tasks.length)} more to-dos`}</button>}
    </>}
  </section>
}

function SortableBacklogTask({ task, categories, onOpen, onReady, onCategoryChange, draggingDisabled }: { task: PlannerTask; categories: Category[]; onOpen: () => void; onReady: () => void; onCategoryChange: (categoryId: string | null) => void; draggingDisabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: draggingDisabled })
  return <article ref={setNodeRef} className={`backlog-task ${isDragging ? 'is-dragging' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
    <button type="button" className="backlog-drag-handle" aria-label={`Reorder ${task.body.split('\n')[0] || 'to-do'}`} title={draggingDisabled ? 'Clear search to reorder' : 'Drag to change priority'} {...attributes} {...listeners} disabled={draggingDisabled}><GripVertical size={15} /></button>
    <div className="backlog-task-main"><button type="button" className="backlog-task-title" onClick={onOpen}>{task.body.split('\n').find((line) => line.trim()) || (task.images.length ? 'Image to-do' : 'Untitled task')}</button>{task.tags.length > 0 && <div className="backlog-task-tags">{task.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}</div>
    <select aria-label={`Category for ${task.body.split('\n')[0] || 'to-do'}`} value={task.categoryId ?? ''} onChange={(event) => onCategoryChange(event.target.value || null)}><option value="">Unassigned</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
    <button type="button" className="button secondary small" onClick={onReady}>Add to Ready</button>
  </article>
}
