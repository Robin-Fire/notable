import type { Category, Note, NotiertApi, PlannerEvent, PlannerEventInput, DeletedPlannerEvent, PlannerTask, TagRecord } from '../shared/contracts'

import { meetingOccurrences } from '../shared/meetingRecurrence'
import { eventOverlapsLocalDay, localDateBounds } from '../shared/plannerDates'

// Browser-only sample data. Electron supplies the real API and database.
type Item = (Note & { meetingTitle: null }) | PlannerTask
const now = Date.now()
const initialCategories: Category[] = [{ id: '11111111-1111-4111-8111-111111111111', name: 'Work' }, { id: '22222222-2222-4222-8222-222222222222', name: 'Personal' }]
const sample: Item[] = [
  { id: '14141414-1414-4414-8414-141414141414', body: 'Ideas for the next release\nKeep the capture flow quick and calm.', meetingId: null, meetingTitle: null, createdAt: now, updatedAt: now, deletedAt: null, revision: 1, kind: 'note', processedAt: now, completedAt: null, categoryId: initialCategories[0]!.id, tags: ['Planning', 'Ideas'], images: [] },
  { id: '15151515-1515-4515-8515-151515151515', body: 'A thought to file later', meetingId: null, meetingTitle: null, createdAt: now, updatedAt: now, deletedAt: null, revision: 1, kind: 'inbox', processedAt: null, completedAt: null, categoryId: null, tags: [], images: [] },
]
const initialTags: TagRecord[] = [
  { id: '33333333-3333-4333-8333-333333333333', name: 'Planning', categoryId: initialCategories[0]!.id, color: '#2563eb', count: 0 },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Ideas', categoryId: initialCategories[0]!.id, color: '#e65b50', count: 0 },
  { id: '55555555-5555-4555-8555-555555555555', name: 'Home', categoryId: initialCategories[1]!.id, color: '#18824b', count: 0 },
]
const stored = (() => { try { return JSON.parse(localStorage.getItem('notiert-browser-preview') ?? localStorage.getItem('notable-browser-preview') ?? 'null') as { items: Item[]; categories: Category[]; tags: TagRecord[]; events?: PlannerEvent[] } | null } catch { return null } })()
let items = stored?.items ?? sample
items = items.map((item) => ({ ...item, completedAt: 'completedAt' in item ? item.completedAt : null, categoryId: 'categoryId' in item ? item.categoryId : null })).map((item) => item.kind === 'task' ? { ...item, priorityPosition: 'priorityPosition' in item ? item.priorityPosition : 0, ready: 'ready' in item ? item.ready : Boolean('plannedDate' in item && item.plannedDate), position: 'position' in item ? item.position : 0, beforeEventId: 'beforeEventId' in item ? item.beforeEventId : null } as PlannerTask : item)
let events: PlannerEvent[] = stored?.events ?? []
const categories = stored?.categories ?? initialCategories
const tags = stored?.tags ?? initialTags
const listeners = new Set<() => void>()
const listen = (callback: () => void) => { listeners.add(callback); return () => listeners.delete(callback) }
const changed = () => { localStorage.setItem('notiert-browser-preview', JSON.stringify({ items, categories, tags, events })); listeners.forEach((callback) => callback()) }
const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value })
const visible = () => items.filter((item) => item.deletedAt === null)
const tagList = () => tags.map((tag) => ({ ...tag, count: visible().filter((item) => item.tags.includes(tag.name)).length }))
const plannerTasks = () => visible().filter((item): item is PlannerTask => item.kind === 'task' && 'plannedDate' in item && item.completedAt === null)
const allPlannerTasks = () => visible().filter((item): item is PlannerTask => item.kind === 'task' && 'plannedDate' in item)
const nextPriority = (categoryId: string | null) => Math.max(-1, ...plannerTasks().filter((task) => task.categoryId === categoryId).map((task) => task.priorityPosition)) + 1
const assignCategory = (item: Item, categoryId: string | null) => {
  if (item.categoryId === categoryId) return
  if (item.kind === 'task') (item as PlannerTask).priorityPosition = nextPriority(categoryId)
  item.categoryId = categoryId
}
const readyTasks = () => plannerTasks().filter((task) => task.ready && !task.plannedDate).sort((a, b) => a.position - b.position || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
const saveEvent = (input: PlannerEventInput) => {
  try {
    const occurrences = meetingOccurrences(input.startAt, input.endAt, input.recurrence)
    const saved = occurrences.map((times, index) => ({ id: index === 0 && input.id ? input.id : crypto.randomUUID(), title: input.title, ...times, allDay: input.allDay }))
    events = [...events.filter((event) => event.id !== input.id), ...saved]
    for (const task of plannerTasks()) {
      if (task.beforeEventId === input.id && task.plannedDate && !eventOverlapsLocalDay(saved[0]!.startAt, saved[0]!.endAt, task.plannedDate)) task.beforeEventId = null
    }
    changed(); return ok(saved[0]!)
  } catch (reason) { return Promise.resolve({ ok: false as const, code: 'INVALID_RECURRENCE', message: reason instanceof Error ? reason.message : 'The meeting could not be saved.' }) }
}
const settings = { shortcut: 'Control+N', shortcutEnabled: true, shortcutRegistered: true, launchAtLogin: false, theme: 'light' as const, monitor: 'active', captureProtection: false, protectionTestApp: '', protectionTestDate: '', protectionTestOS: '', lastBackupAt: null, backupWarning: false, firstRunComplete: true, closeToTray: true }

const api = {
  updates: { getStatus: () => ok({ status: 'idle' as const }), check: () => ok(undefined), install: () => ok(undefined), onChanged: () => () => {} },
  capture: { submit: ({ body, categoryId }: { body: string; categoryId?: string | null }) => { const id = crypto.randomUUID(); items = [{ id, body, meetingId: null, meetingTitle: null, createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null, revision: 1, kind: 'inbox', processedAt: null, completedAt: null, categoryId: categoryId ?? null, tags: [], images: [] }, ...items]; changed(); return ok({ id }) } },
  notes: {
    list: (filter: { scope: 'notes' | 'trash'; tags?: string[]; kinds?: string[]; query?: string; categoryId?: string; sort?: string; includeCompleted?: boolean }) => { const found = items.filter((item) => (filter.scope === 'trash' ? item.deletedAt !== null : item.deletedAt === null && (filter.includeCompleted || item.completedAt === null)) && (!filter.categoryId || item.categoryId === filter.categoryId) && (!filter.tags?.length || filter.tags.some((tag) => item.tags.includes(tag))) && (!filter.kinds?.length || filter.kinds.includes(item.kind)) && (!filter.query || item.body.toLowerCase().includes(filter.query.toLowerCase()))); if (filter.sort === 'priority') found.sort((a, b) => (a.kind === 'task' ? (a.completedAt === null ? 0 : 1) : 2) - (b.kind === 'task' ? (b.completedAt === null ? 0 : 1) : 2) || (a.kind === 'task' && b.kind === 'task' ? (a as PlannerTask).priorityPosition - (b as PlannerTask).priorityPosition : b.createdAt - a.createdAt)); return ok({ items: found, nextCursor: null, total: found.length }) },
    tags: () => ok(tags.map((tag) => tag.name)), taxonomy: () => ok({ categories: [...categories], tags: tagList() }),
    createCategory: (name: string) => { const category = { id: crypto.randomUUID(), name }; categories.push(category); changed(); return ok(category) },
    createTag: ({ name, categoryId }: { name: string; categoryId: string | null }) => { const tag = { id: crypto.randomUUID(), name, categoryId, color: '#85858e', count: 0 }; tags.push(tag); changed(); return ok(tag) },
    updateTag: ({ id, categoryId, color }: { id: string; categoryId: string | null; color: string }) => { const tag = tags.find((entry) => entry.id === id); if (tag) Object.assign(tag, { categoryId, color }); changed(); return ok(undefined) },
    get: (id: string) => ok(items.find((item) => item.id === id) ?? null), image: () => ok(''),
    update: ({ id, body }: { id: string; body: string }) => { const item = items.find((entry) => entry.id === id)!; item.body = body; item.revision++; changed(); return ok(item) },
    updateItem: ({ id, body, tags: names, categoryId }: { id: string; body: string; tags: string[]; categoryId?: string | null }) => { const item = items.find((entry) => entry.id === id)!; item.body = body; item.tags = names; if (categoryId !== undefined) assignCategory(item, categoryId); item.revision++; changed(); return ok(item) },
    setCategory: ({ id, categoryId }: { id: string; categoryId: string | null }) => { const item = items.find((entry) => entry.id === id); if (item) assignCategory(item, categoryId); changed(); return ok(undefined) },
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
    classify: ({ id, kind, tags: names, categoryId }: { id: string; kind: 'note' | 'task'; tags: string[]; categoryId?: string | null }) => { const item = items.find((entry) => entry.id === id); if (item) { const effectiveCategory = categoryId === undefined ? item.categoryId : categoryId; Object.assign(item, { kind, tags: names, categoryId: effectiveCategory, processedAt: Date.now(), ...(kind === 'task' ? { plannedDate: null, beforeEventId: null, position: visible().filter((entry) => entry.kind === 'task').length, priorityPosition: nextPriority(effectiveCategory), ready: false } : {}) }) }; for (const name of names) if (!tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) tags.push({ id: crypto.randomUUID(), name, categoryId: categoryId ?? null, color: '#85858e', count: 0 }); changed(); return ok(undefined) },
    tasks: (from: string, to: string) => { const open = plannerTasks().filter((task) => task.plannedDate ? task.plannedDate < from || task.plannedDate <= to : task.ready); const done = allPlannerTasks().filter((task) => task.completedAt != null && task.plannedDate !== null && task.plannedDate >= from && task.plannedDate <= to); return ok({ tasks: [...open, ...done].sort((a, b) => (a.plannedDate ?? '').localeCompare(b.plannedDate ?? '') || (a.beforeEventId ?? '').localeCompare(b.beforeEventId ?? '') || Number(a.completedAt != null) - Number(b.completedAt != null) || a.position - b.position || a.createdAt - b.createdAt), events: events.filter((event) => event.startAt < localDateBounds(to).end && event.endAt > localDateBounds(from).start).sort((a, b) => a.startAt - b.startAt), tags: tags.map((tag) => tag.name) }) },
    backlog: ({ categoryId = null, query = '', tagNames, includeUntagged, cursor, limit = 50 }: { categoryId?: string | null; query?: string; tagNames?: string[]; includeUntagged?: boolean; cursor?: { priorityPosition: number; id: string }; limit?: number } = {}) => {
      const normalized = query.trim().toLocaleLowerCase()
      const hasTagFilter = tagNames !== undefined || includeUntagged !== undefined
      const found = plannerTasks().filter((task) => !task.ready && !task.plannedDate && task.categoryId === categoryId && (!hasTagFilter || Boolean(tagNames?.some((tag) => task.tags.some((name) => name.toLowerCase() === tag.toLowerCase())) || (includeUntagged && task.tags.length === 0))) && (!normalized || `${task.body} ${task.tags.join(' ')}`.toLocaleLowerCase().includes(normalized))).sort((a, b) => a.priorityPosition - b.priorityPosition || a.id.localeCompare(b.id))
      const remaining = cursor ? found.filter((task) => task.priorityPosition > cursor.priorityPosition || (task.priorityPosition === cursor.priorityPosition && task.id > cursor.id)) : found
      const page = remaining.slice(0, limit)
      const last = page.at(-1)
      const availableTags = [...new Set(plannerTasks().filter((task) => !task.ready && !task.plannedDate && task.categoryId === categoryId).flatMap((task) => task.tags))].sort((a, b) => a.localeCompare(b))
      return ok({ items: page, nextCursor: remaining.length > limit && last ? { priorityPosition: last.priorityPosition, id: last.id } : null, total: found.length, tagNames: availableTags })
    },
    setReady: ({ id }: { id: string }) => {
      const task = items.find((item) => item.id === id && item.kind === 'task') as PlannerTask | undefined
      if (task) { task.position = Math.max(-1, ...readyTasks().filter((entry) => entry.id !== id).map((entry) => entry.position)) + 1; task.ready = true; task.plannedDate = null; task.beforeEventId = null }
      changed(); return ok(undefined)
    },
    setTaskCompleted: ({ id, completed }: { id: string; completed: boolean }) => {
      const task = allPlannerTasks().find((entry) => entry.id === id)
      if (task && (task.completedAt === null) !== completed) {
        if (completed) { task.completedAt = Date.now(); task.ready = false }
        else { task.completedAt = null; task.priorityPosition = nextPriority(task.categoryId); task.plannedDate = null; task.beforeEventId = null; task.ready = false; task.position = 0 }
      }
      changed(); return ok(undefined)
    },
    reorderBacklog: ({ id, categoryId, beforeId }: { id: string; categoryId: string | null; beforeId: string | null }) => {
      const ordered = plannerTasks().filter((task) => task.categoryId === categoryId).sort((a, b) => a.priorityPosition - b.priorityPosition || a.id.localeCompare(b.id))
      const ids = ordered.map((task) => task.id)
      const oldIndex = ids.indexOf(id)
      if (oldIndex < 0) return ok(undefined)
      ids.splice(oldIndex, 1)
      const index = beforeId ? ids.indexOf(beforeId) : ids.length
      ids.splice(index < 0 ? ids.length : index, 0, id)
      ids.forEach((taskId, priorityPosition) => { const task = plannerTasks().find((entry) => entry.id === taskId); if (task) task.priorityPosition = priorityPosition })
      changed(); return ok(undefined)
    },
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
    createEvent: saveEvent,
    updateEvent: saveEvent,
    deleteEvent: (id: string) => {
      const event = events.find((entry) => entry.id === id)
      if (!event) return Promise.resolve({ ok: false as const, code: 'NOT_FOUND', message: 'This meeting no longer exists.' })
      const anchors = plannerTasks().filter((task) => task.beforeEventId === id).map((task) => ({ id: task.id, plannedDate: task.plannedDate, position: task.position }))
      plannerTasks().filter((task) => task.beforeEventId === id).forEach((task) => { task.beforeEventId = null })
      events = events.filter((entry) => entry.id !== id)
      changed(); return ok({ event, anchors })
    },
    undoDeleteEvent: ({ event, anchors }: DeletedPlannerEvent) => {
      events.push(event)
      for (const anchor of anchors) {
        const task = plannerTasks().find((entry) => entry.id === anchor.id && entry.plannedDate === anchor.plannedDate && entry.beforeEventId === null)
        if (task) { task.beforeEventId = event.id; task.position = anchor.position }
      }
      changed(); return ok(undefined)
    }, onChanged: listen,
  },
  settings: { get: () => ok(settings), displays: () => ok([]), update: () => ok(settings), onChanged: () => () => {}, openFolder: () => ok(undefined) },
  data: { export: () => ok(undefined), backup: () => ok(undefined), restore: () => ok(undefined), diagnostics: () => ok(undefined) },
  windows: { openCapture() { window.dispatchEvent(new window.Event('notiert:browser-capture')) }, openNotes() {}, openSettings() {}, quit() {}, ready() {}, onView: () => () => {} },
} as unknown as NotiertApi

Object.defineProperty(window, 'notiert', { value: api, configurable: true, writable: true })
