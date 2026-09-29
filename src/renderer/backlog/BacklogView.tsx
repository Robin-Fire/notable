import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, FolderKanban, Search, X } from 'lucide-react'
import type { Category, PlannerBacklogPage, PlannerTask } from '../../shared/contracts'
import { TaskDetailDialog } from '../calenban/TaskDetailDialog'

const valueOf = <T,>(result: { ok: true; value: T } | { ok: false; message: string }): T => {
  if (!result.ok) throw new Error(result.message)
  return result.value
}
const pageSize = 50

export function BacklogView() {
  const [tasks, setTasks] = useState<PlannerTask[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [cursor, setCursor] = useState<PlannerBacklogPage['nextCursor']>(null)
  const [total, setTotal] = useState(0)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [detailTask, setDetailTask] = useState<PlannerTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 150)
    return () => clearTimeout(timer)
  }, [query])

  const refreshTaxonomy = useCallback(async () => {
    try {
      const metadata = valueOf(await window.notable.notes.taxonomy())
      setCategories(metadata.categories)
      setTags(metadata.tags.map((tag) => tag.name))
    } catch { /* The Backlog view reports task loading errors separately. */ }
  }, [])

  const refresh = useCallback(async () => {
    const request = ++requestId.current
    setLoading(true)
    setLoadingMore(false)
    try {
      const page = valueOf(await window.notable.planner.backlog({ query: debouncedQuery, limit: pageSize }))
      if (request !== requestId.current) return
      setTasks(page.items)
      setCursor(page.nextCursor)
      setTotal(page.total)
      setError('')
    } catch (reason) {
      if (request === requestId.current) setError(reason instanceof Error ? reason.message : 'Backlog could not be loaded.')
    } finally {
      if (request === requestId.current) setLoading(false)
    }
  }, [debouncedQuery])

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    const request = requestId.current
    setLoadingMore(true)
    try {
      const page = valueOf(await window.notable.planner.backlog({ query: debouncedQuery, cursor, limit: pageSize }))
      if (request !== requestId.current) return
      setTasks((current) => [...current, ...page.items])
      setCursor(page.nextCursor)
      setTotal(page.total)
      setError('')
    } catch (reason) {
      if (request === requestId.current) setError(reason instanceof Error ? reason.message : 'Older tasks could not be loaded.')
    } finally {
      if (request === requestId.current) setLoadingMore(false)
    }
  }, [cursor, debouncedQuery, loadingMore])

  useEffect(() => {
    void refresh()
    return window.notable.planner.onChanged(() => { void refresh() })
  }, [refresh])
  useEffect(() => {
    void refreshTaxonomy()
    return window.notable.notes.onChanged(() => { void refreshTaxonomy() })
  }, [refreshTaxonomy])

  const groups = useMemo(() => {
    const categoryById = new Map(categories.map((category) => [category.id, category]))
    const grouped = new Map<string, { id: string; name: string; tasks: PlannerTask[] }>()
    for (const category of categories) grouped.set(category.id, { id: category.id, name: category.name, tasks: [] })
    grouped.set('unassigned', { id: 'unassigned', name: 'Unassigned', tasks: [] })
    for (const task of tasks) {
      const category = task.projectId ? categoryById.get(task.projectId) : undefined
      grouped.get(category?.id ?? 'unassigned')!.tasks.push(task)
    }
    return [...grouped.values()].filter((group) => group.tasks.length)
  }, [categories, tasks])

  async function setReady(id: string) {
    try { valueOf(await window.notable.planner.setReady({ id })) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Task could not be added to Plan.') }
  }
  async function setProject(id: string, projectId: string | null) {
    try { valueOf(await window.notable.planner.setProject({ id, projectId })) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Project could not be changed.') }
  }

  return <section className="backlog-page">
    <header className="backlog-header"><div><span className="eyebrow">ALL PROJECTS, ONE VIEW</span><h1>Backlog <span className="title-count">{total}</span></h1><p>Review tasks across projects. Add the ones you want to consider to Ready in Plan.</p></div></header>
    <div className="backlog-toolbar"><label className="search-box"><Search size={15} /><input aria-label="Search backlog" placeholder="Search tasks or tags…" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button aria-label="Clear backlog search" onClick={() => setQuery('')}><X size={13} /></button>}</label><span>{cursor ? `Showing ${tasks.length} of ${total}` : `${total} ${total === 1 ? 'task' : 'tasks'}`}</span></div>
    {error && <div className="inline-error" role="alert">{error}<button type="button" onClick={() => void refresh()}>Retry</button></div>}
    <div className="backlog-groups">{loading && !tasks.length ? <div className="loading-state"><span className="spinner" /> Loading backlog…</div> : groups.length ? <>
      {groups.map((group) => <section className="backlog-group" key={group.id}>
        <button type="button" className="backlog-group-heading" aria-expanded={!collapsed[group.id]} onClick={() => setCollapsed((current) => ({ ...current, [group.id]: !current[group.id] }))}><FolderKanban size={16} /><b>{group.name}</b><span>{group.tasks.length}</span><ChevronDown size={15} className={collapsed[group.id] ? 'is-closed' : ''} /></button>
        {!collapsed[group.id] && <div className="backlog-task-list">{group.tasks.map((task) => <article className="backlog-task" key={task.id}><div className="backlog-task-main"><button type="button" className="backlog-task-title" onClick={() => setDetailTask(task)}>{task.body.split('\n').find((line) => line.trim()) || (task.images.length ? 'Image to-do' : 'Untitled task')}</button>{task.tags.length > 0 && <div className="backlog-task-tags">{task.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}</div><select aria-label={`Project for ${task.body.split('\n')[0] || 'task'}`} value={task.projectId ?? ''} onChange={(event) => void setProject(task.id, event.target.value || null)}><option value="">Unassigned</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><button type="button" className="button secondary small" onClick={() => void setReady(task.id)}>Add to Ready</button></article>)}</div>}
      </section>)}
      {cursor && <button type="button" className="load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Loading…' : `Load ${Math.min(pageSize, total - tasks.length)} older tasks`}</button>}
    </> : <div className="backlog-empty">{debouncedQuery ? 'No backlog tasks match this search.' : 'Your Backlog is empty.'}</div>}</div>
    {detailTask && <TaskDetailDialog task={detailTask} suggestions={tags} onClose={() => setDetailTask(null)} onChanged={() => setDetailTask(null)} />}
  </section>
}
