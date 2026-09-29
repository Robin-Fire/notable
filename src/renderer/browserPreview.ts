import type { Category, Note, NotableApi, PlannerTask, TagRecord } from '../shared/contracts'

// Browser-only sample data. Electron supplies the real API and database.
type Item = (Note & { meetingTitle: null }) | PlannerTask
const now = Date.now()
const sample: Item[] = [
  { id: '14141414-1414-4414-8414-141414141414', body: 'Ideas for the next release\nKeep the capture flow quick and calm.', meetingId: null, meetingTitle: null, createdAt: now, updatedAt: now, deletedAt: null, revision: 1, kind: 'note', processedAt: now, tags: ['Planning', 'Ideas'], images: [] },
  { id: '15151515-1515-4515-8515-151515151515', body: 'A thought to file later', meetingId: null, meetingTitle: null, createdAt: now, updatedAt: now, deletedAt: null, revision: 1, kind: 'inbox', processedAt: null, tags: [], images: [] },
]
const initialCategories: Category[] = [{ id: '11111111-1111-4111-8111-111111111111', name: 'Work' }, { id: '22222222-2222-4222-8222-222222222222', name: 'Personal' }]
const initialTags: TagRecord[] = [
  { id: '33333333-3333-4333-8333-333333333333', name: 'Planning', categoryId: initialCategories[0]!.id, color: '#2563eb', count: 0 },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Ideas', categoryId: initialCategories[0]!.id, color: '#e65b50', count: 0 },
  { id: '55555555-5555-4555-8555-555555555555', name: 'Home', categoryId: initialCategories[1]!.id, color: '#18824b', count: 0 },
]
const stored = (() => { try { return JSON.parse(localStorage.getItem('notable-browser-preview') ?? 'null') as { items: Item[]; categories: Category[]; tags: TagRecord[] } | null } catch { return null } })()
let items = stored?.items ?? sample
items = items.map((item) => item.kind === 'task' ? { ...item, projectId: 'projectId' in item ? item.projectId : null, ready: 'ready' in item ? item.ready : Boolean('plannedDate' in item && item.plannedDate), position: 'position' in item ? item.position : 0, beforeEventId: 'beforeEventId' in item ? item.beforeEventId : null } as PlannerTask : item)
const categories = stored?.categories ?? initialCategories
const tags = stored?.tags ?? initialTags
const listeners = new Set<() => void>()
const listen = (callback: () => void) => { listeners.add(callback); return () => listeners.delete(callback) }
const changed = () => { localStorage.setItem('notable-browser-preview', JSON.stringify({ items, categories, tags })); listeners.forEach((callback) => callback()) }
const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value })
const visible = () => items.filter((item) => item.deletedAt === null)
const tagList = () => tags.map((tag) => ({ ...tag, count: visible().filter((item) => item.tags.includes(tag.name)).length }))
const plannerTasks = () => visible().filter((item): item is PlannerTask => item.kind === 'task' && 'plannedDate' in item && (!('status' in item) || item.status === 'open'))
const readyTasks = () => plannerTasks().filter((task) => task.ready && !task.plannedDate).sort((a, b) => a.position - b.position || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
const settings = { shortcut: 'Control+N', shortcutEnabled: true, shortcutRegistered: true, launchAtLogin: false, theme: 'light' as const, monitor: 'active', captureProtection: false, protectionTestApp: '', protectionTestDate: '', protectionTestOS: '', lastBackupAt: null, backupWarning: false, firstRunComplete: true, closeToTray: true }

const api = {
  updates: { getStatus: () => ok({ status: 'idle' as const }), check: () => ok(undefined), install: () => ok(undefined), onChanged: () => () => {} },
  capture: { submit: ({ body }: { body: string }) => { const id = crypto.randomUUID(); items = [{ id, body, meetingId: null, meetingTitle: null, createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null, revision: 1, kind: 'inbox', processedAt: null, tags: [], images: [] }, ...items]; changed(); return ok({ id }) } },
  notes: {
    list: (filter: { scope: 'notes' | 'trash'; tags?: string[]; kinds?: string[]; query?: string }) => { const found = items.filter((item) => (filter.scope === 'trash' ? item.deletedAt !== null : item.deletedAt === null) && (!filter.tags?.length || filter.tags.some((tag) => item.tags.includes(tag))) && (!filter.kinds?.length || filter.kinds.includes(item.kind)) && (!filter.query || item.body.toLowerCase().includes(filter.query.toLowerCase()))); return ok({ items: found, nextCursor: null, total: found.length }) },
    tags: () => ok(tags.map((tag) => tag.name)), taxonomy: () => ok({ categories: [...categories], tags: tagList() }),
    createCategory: (name: string) => { const category = { id: crypto.randomUUID(), name }; categories.push(category); changed(); return ok(category) },
    createTag: ({ name, categoryId }: { name: string; categoryId: string | null }) => { const tag = { id: crypto.randomUUID(), name, categoryId, color: '#85858e', count: 0 }; tags.push(tag); changed(); return ok(tag) },
    updateTag: ({ id, categoryId, color }: { id: string; categoryId: string | null; color: string }) => { const tag = tags.find((entry) => entry.id === id); if (tag) Object.assign(tag, { categoryId, color }); changed(); return ok(undefined) },
    get: (id: string) => ok(items.find((item) => item.id === id) ?? null), image: () => ok(''),
    update: ({ id, body }: { id: string; body: string }) => { const item = items.find((entry) => entry.id === id)!; item.body = body; item.revision++; changed(); return ok(item) },
    updateItem: ({ id, body, tags: names }: { id: string; body: string; tags: string[] }) => { const item = items.find((entry) => entry.id === id)!; item.body = body; item.tags = names; item.revision++; changed(); return ok(item) },
    setTags: ({ id, tags: names }: { id: string; tags: string[] }) => { const item = items.find((entry) => entry.id === id); if (item) item.tags = names; changed(); return ok(undefined) },
    trash: (ids: string[]) => { items.filter((item) => ids.includes(item.id)).forEach((item) => { item.deletedAt = Date.now() }); changed(); return ok(undefined) },
    restore: (ids: string[]) => { items.filter((item) => ids.includes(item.id)).forEach((item) => { item.deletedAt = null }); changed(); return ok(undefined) },
    deletePermanently: (ids: string[]) => { items = items.filter((item) => !ids.includes(item.id)); changed(); return ok(undefined) },
    emptyTrash: () => { items = visible(); changed(); return ok(undefined) }, copy: (ids: string[]) => ok(items.filter((item) => ids.includes(item.id)).map((item) => item.body).join('\n')), onChanged: listen,
  },
  planner: {
    inbox: () => { const inbox = visible().filter((item) => item.kind === 'inbox'); return ok({ items: inbox, nextCursor: null, total: inbox.length }) },
    inboxCount: () => ok(visible().filter((item) => item.kind === 'inbox').length),
    unfile: (id: string) => { const item = items.find((entry) => entry.id === id); if (item) item.kind = 'inbox'; changed(); return ok(undefined) },
    classify: ({ id, kind, tags: names, projectId }: { id: string; kind: 'note' | 'task'; tags: string[]; projectId?: string | null }) => { const item = items.find((entry) => entry.id === id); if (item) Object.assign(item, { kind, tags: names, processedAt: Date.now(), ...(kind === 'task' ? { plannedDate: null, beforeEventId: null, position: visible().filter((entry) => entry.kind === 'task').length, projectId: projectId ?? null, ready: false } : {}) }); for (const name of names) if (!tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) tags.push({ id: crypto.randomUUID(), name, categoryId: projectId ?? null, color: '#85858e', count: 0 }); changed(); return ok(undefined) },
    tasks: (from: string, to: string) => ok({ tasks: plannerTasks().filter((task) => task.plannedDate ? task.plannedDate < from || task.plannedDate <= to : task.ready).sort((a, b) => (a.plannedDate ?? '').localeCompare(b.plannedDate ?? '') || (a.beforeEventId ?? '').localeCompare(b.beforeEventId ?? '') || a.position - b.position || a.createdAt - b.createdAt), events: [], tags: tags.map((tag) => tag.name) }),
    backlog: ({ query = '', cursor, limit = 50 }: { query?: string; cursor?: { sortAt: number; id: string }; limit?: number } = {}) => {
      const normalized = query.trim().toLocaleLowerCase()
      const found = plannerTasks().filter((task) => !task.ready && !task.plannedDate && (!normalized || `${task.body} ${task.tags.join(' ')}`.toLocaleLowerCase().includes(normalized))).sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
      const remaining = cursor ? found.filter((task) => task.createdAt < cursor.sortAt || (task.createdAt === cursor.sortAt && task.id < cursor.id)) : found
      const page = remaining.slice(0, limit)
      const last = page.at(-1)
      return ok({ items: page, nextCursor: remaining.length > limit && last ? { sortAt: last.createdAt, id: last.id } : null, total: found.length })
    },
    setReady: ({ id }: { id: string }) => {
      const task = items.find((item) => item.id === id && item.kind === 'task') as PlannerTask | undefined
      if (task) { task.position = Math.max(-1, ...readyTasks().filter((entry) => entry.id !== id).map((entry) => entry.position)) + 1; task.ready = true; task.plannedDate = null; task.beforeEventId = null }
      changed(); return ok(undefined)
    },
    setProject: ({ id, projectId }: { id: string; projectId: string | null }) => { const task = items.find((item) => item.id === id) as PlannerTask | undefined; if (task) task.projectId = projectId; changed(); return ok(undefined) },
    move: ({ id, plannedDate, beforeEventId, beforeId }: { id: string; plannedDate: string | null; beforeEventId: string | null; beforeId: string | null }) => {
      const task = plannerTasks().find((entry) => entry.id === id)
      if (task) {
        const sourceDate = task.plannedDate
        const sourceEventId = task.beforeEventId
        const sourceWasReady = task.ready
        const sameSlot = plannerTasks().filter((entry) => entry.id !== id && entry.plannedDate === plannedDate && entry.beforeEventId === beforeEventId && (plannedDate !== null || entry.ready)).sort((a, b) => a.position - b.position || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
        task.plannedDate = plannedDate; task.beforeEventId = beforeEventId; task.ready = true
        const ids = sameSlot.map((entry) => entry.id)
        const index = beforeId ? ids.indexOf(beforeId) : -1
        ids.splice(index < 0 ? ids.length : index, 0, id)
        for (const [position, taskId] of ids.entries()) {
          const entry = plannerTasks().find((candidate) => candidate.id === taskId)
          if (entry) entry.position = position
        }
        if ((sourceDate !== null || sourceWasReady) && (sourceDate !== plannedDate || sourceEventId !== beforeEventId)) {
          const sourceSlot = plannerTasks().filter((entry) => entry.id !== id && entry.plannedDate === sourceDate && entry.beforeEventId === sourceEventId && (sourceDate !== null || entry.ready)).sort((a, b) => a.position - b.position || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
          sourceSlot.forEach((entry, position) => { entry.position = position })
        }
      }
      changed(); return ok(undefined)
    },
    createEvent: () => ok({ id: crypto.randomUUID(), title: 'Meeting', startAt: now, endAt: now + 3600000, allDay: false }),
    updateEvent: () => ok({ id: crypto.randomUUID(), title: 'Meeting', startAt: now, endAt: now + 3600000, allDay: false }),
    deleteEvent: () => ok({ event: { id: crypto.randomUUID(), title: 'Meeting', startAt: now, endAt: now + 3600000, allDay: false }, anchors: [] }), undoDeleteEvent: () => ok(undefined), onChanged: listen,
  },
  settings: { get: () => ok(settings), displays: () => ok([]), update: () => ok(settings), onChanged: () => () => {}, openFolder: () => ok(undefined) },
  data: { export: () => ok(undefined), backup: () => ok(undefined), restore: () => ok(undefined), diagnostics: () => ok(undefined) },
  windows: { openCapture() { window.dispatchEvent(new window.Event('notable:browser-capture')) }, openNotes() {}, openSettings() {}, quit() {}, ready() {}, onView: () => () => {} },
} as unknown as NotableApi

Object.defineProperty(window, 'notable', { value: api, configurable: true, writable: true })
