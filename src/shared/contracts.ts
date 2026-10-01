import type { z } from 'zod'
import { z as Z } from 'zod'

export const ImageRefSchema = Z.object({ id: Z.string().uuid(), mimeType: Z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']) })
export type ImageRef = z.infer<typeof ImageRefSchema>
export type CaptureImage = ImageRef & { dataUrl: string }
export const NoteSchema = Z.object({
  id: Z.string(), body: Z.string(), meetingId: Z.string().nullable(), createdAt: Z.number(), updatedAt: Z.number(),
  deletedAt: Z.number().nullable(), revision: Z.number(), kind: Z.enum(['inbox', 'note', 'task']).default('note'),
  processedAt: Z.number().nullable().default(null), categoryId: Z.string().nullable().default(null), tags: Z.array(Z.string()).default([]), images: Z.array(ImageRefSchema).default([]),
})
export const PlannerEventSchema = Z.object({ id: Z.string(), title: Z.string(), startAt: Z.number(), endAt: Z.number(), allDay: Z.boolean() })
export const PlannerTaskSchema = NoteSchema.extend({ meetingTitle: Z.string().nullable(), plannedDate: Z.string().nullable(), position: Z.number(), priorityPosition: Z.number().int().nonnegative(), beforeEventId: Z.string().nullable(), ready: Z.boolean() })
export const ClassifyItemSchema = Z.object({ id: Z.string().uuid(), kind: Z.enum(['note', 'task']), tags: Z.array(Z.string().max(40)).max(20), categoryId: Z.string().uuid().nullable().optional() })
export const PlannerReadySchema = Z.object({ id: Z.string().uuid() })
export const PlannerCategorySchema = Z.object({ id: Z.string().uuid(), categoryId: Z.string().uuid().nullable() })
export const ItemCategorySchema = PlannerCategorySchema
export const PlannerMoveSchema = Z.object({ id: Z.string().uuid(), plannedDate: Z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), beforeEventId: Z.string().uuid().nullable(), beforeId: Z.string().uuid().nullable() })
export const PlannerQuerySchema = Z.object({ from: Z.string(), to: Z.string() })
export const PlannerBacklogQuerySchema = Z.object({
  categoryId: Z.string().uuid().nullable().default(null),
  query: Z.string().max(500).default(''),
  tagNames: Z.array(Z.string().max(40)).max(1000).optional(),
  includeUntagged: Z.boolean().optional(),
  cursor: Z.object({ priorityPosition: Z.number().int().nonnegative(), id: Z.string().uuid() }).optional(),
  limit: Z.number().int().min(1).max(100).default(50),
})
export const PlannerBacklogReorderSchema = Z.object({ id: Z.string().uuid(), categoryId: Z.string().uuid().nullable(), beforeId: Z.string().uuid().nullable() })
export const PlannerEventInputSchema = Z.object({ id: Z.string().uuid().optional(), title: Z.string().trim().min(1).max(120), startAt: Z.number().int(), endAt: Z.number().int(), allDay: Z.boolean(), recurrence: Z.object({ frequency: Z.enum(['daily', 'weekly', 'monthly']), until: Z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).optional() }).refine((event) => event.endAt > event.startAt, 'End time must be after start time.')
export const DeletedPlannerEventSchema = Z.object({
  event: PlannerEventSchema.extend({ id: Z.string().uuid() }),
  anchors: Z.array(Z.object({ id: Z.string().uuid(), plannedDate: Z.string().nullable(), position: Z.number().int().nonnegative() })).max(10000),
})
export const SettingsSchema = Z.object({
  shortcut: Z.string(), shortcutEnabled: Z.boolean(), shortcutRegistered: Z.boolean(), launchAtLogin: Z.boolean(), theme: Z.enum(['system', 'light', 'dark']),
  monitor: Z.string(), captureProtection: Z.boolean(), protectionTestApp: Z.string(), protectionTestDate: Z.string(),
  protectionTestOS: Z.string(), lastBackupAt: Z.number().nullable(), backupWarning: Z.boolean(), firstRunComplete: Z.boolean(), closeToTray: Z.boolean(),
})
export const NoteFilterSchema = Z.object({
  query: Z.string().max(500).default(''), scope: Z.enum(['notes', 'trash']), sort: Z.enum(['newest', 'oldest', 'priority']).default('newest'),
  categoryId: Z.string().uuid().optional(),
  dateFrom: Z.number().optional(), dateTo: Z.number().optional(),
  kinds: Z.array(Z.enum(['inbox', 'note', 'task'])).max(3).optional(), tags: Z.array(Z.string().max(40)).max(10000).optional(),
  cursor: Z.object({ sortAt: Z.number(), id: Z.string(), priorityPosition: Z.number().int().nonnegative().optional(), kindRank: Z.number().int().min(0).max(1).optional() }).optional(), limit: Z.number().int().min(1).max(100).default(50),
})
export const CaptureSubmitSchema = Z.object({ requestId: Z.string().uuid(), generation: Z.number().int().nonnegative(), body: Z.string().max(100000), categoryId: Z.string().uuid().nullable().optional() })
export const NoteUpdateSchema = Z.object({ id: Z.string().uuid(), expectedRevision: Z.number().int(), body: Z.string().max(100000) })
export const IdsSchema = Z.array(Z.string().uuid()).min(1).max(500)
export const InboxPageSchema = Z.object({ cursor: Z.object({ sortAt: Z.number().int(), id: Z.string().uuid() }).optional(), limit: Z.number().int().min(1).max(100).default(50) })
export const CategoryNameSchema = Z.string().trim().min(1).max(60)
export const TagNameSchema = Z.string().trim().min(1).max(40)
export const TagUpdateSchema = Z.object({ id: Z.string().uuid(), categoryId: Z.string().uuid().nullable(), color: Z.string().regex(/^#[0-9a-fA-F]{6}$/) })

export type Note = z.infer<typeof NoteSchema>
export type PlannerEvent = z.infer<typeof PlannerEventSchema>
export type PlannerEventInput = z.infer<typeof PlannerEventInputSchema>
export type DeletedPlannerEvent = z.infer<typeof DeletedPlannerEventSchema>
export type PlannerTask = z.infer<typeof PlannerTaskSchema>
export type Settings = z.infer<typeof SettingsSchema>
export type NoteFilter = z.infer<typeof NoteFilterSchema>
export type CaptureState = { body: string; images: CaptureImage[]; generation: number; revision: number; shortcut: string; theme: Settings['theme']; available: boolean; categoryId: string | null }
export type ApiResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string }
export type NotePage = { items: (Note & { meetingTitle: string | null })[]; nextCursor: { sortAt: number; id: string; priorityPosition?: number; kindRank?: number } | null; total: number }
export type InboxPage = { items: (Note & { meetingTitle: string | null })[]; nextCursor: { sortAt: number; id: string } | null; total: number }
export type PlannerBacklogPage = { items: PlannerTask[]; nextCursor: { priorityPosition: number; id: string } | null; total: number; tagNames: string[] }
export type Category = { id: string; name: string }
export type TagRecord = { id: string; name: string; categoryId: string | null; color: string; count: number }

export type NotableApi = {
  updates: {
    getStatus(): Promise<ApiResult<{ status: 'idle' | 'checking' | 'available' | 'downloaded' | 'error'; version?: string; message?: string }>>
    check(): Promise<ApiResult<void>>
    install(): Promise<ApiResult<void>>
    onChanged(callback: (status: { status: 'idle' | 'checking' | 'available' | 'downloaded' | 'error'; version?: string; message?: string }) => void): () => void
  }
  capture: {
    getState(): Promise<ApiResult<CaptureState>>
    categories(): Promise<ApiResult<Category[]>>
    updateDraft(input: { body: string; generation: number; revision: number; categoryId: string | null }): Promise<ApiResult<{ revision: number }>>
    flushBeforeQuit(input: { body: string; generation: number; revision: number; categoryId: string | null }): Promise<ApiResult<{ revision: number }>>
    submit(input: z.infer<typeof CaptureSubmitSchema>): Promise<ApiResult<{ id: string }>>
    addImage(input: { generation: number; dataUrl: string }): Promise<ApiResult<CaptureImage>>
    removeImage(input: { generation: number; id: string }): Promise<ApiResult<void>>
    dismiss(reason: 'escape' | 'blur' | 'saved'): Promise<ApiResult<void>>
    resize(height: number): void
    onState(callback: (state: Partial<CaptureState>) => void): () => void
    onQuitRequest(callback: () => void): () => void
    respondToQuit(saved: boolean, body: string): void
    ready(): void
  }
  notes: {
    list(filter: NoteFilter): Promise<ApiResult<NotePage>>
    tags(): Promise<ApiResult<string[]>>
    taxonomy(): Promise<ApiResult<{ categories: Category[]; tags: TagRecord[] }>>
    createCategory(name: string): Promise<ApiResult<Category>>
    createTag(input: { name: string; categoryId: string | null }): Promise<ApiResult<TagRecord>>
    updateTag(input: z.infer<typeof TagUpdateSchema>): Promise<ApiResult<void>>
    get(id: string): Promise<ApiResult<(Note & { meetingTitle: string | null }) | null>>
    image(id: string): Promise<ApiResult<string>>
    update(input: z.infer<typeof NoteUpdateSchema>): Promise<ApiResult<Note>>
    updateItem(input: { id: string; expectedRevision: number; body: string; tags: string[]; categoryId?: string | null }): Promise<ApiResult<Note & { meetingTitle: string | null }>>
    setCategory(input: z.infer<typeof ItemCategorySchema>): Promise<ApiResult<void>>
    setTags(input: { id: string; tags: string[] }): Promise<ApiResult<void>>
    trash(ids: string[]): Promise<ApiResult<void>>
    restore(ids: string[]): Promise<ApiResult<void>>
    deletePermanently(ids: string[]): Promise<ApiResult<void>>
    emptyTrash(): Promise<ApiResult<void>>
    copy(ids: string[]): Promise<ApiResult<string>>
    onChanged(callback: (sequence: number) => void): () => void
  }
  planner: {
    inbox(input?: { cursor?: InboxPage['nextCursor']; limit?: number }): Promise<ApiResult<InboxPage>>
    inboxCount(): Promise<ApiResult<number>>
    unfile(id: string): Promise<ApiResult<void>>
    classify(input: z.infer<typeof ClassifyItemSchema>): Promise<ApiResult<void>>
    tasks(from: string, to: string): Promise<ApiResult<{ tasks: PlannerTask[]; events: PlannerEvent[]; tags: string[] }>>
    backlog(input?: z.infer<typeof PlannerBacklogQuerySchema>): Promise<ApiResult<PlannerBacklogPage>>
    setReady(input: z.infer<typeof PlannerReadySchema>): Promise<ApiResult<void>>
    reorderBacklog(input: { id: string; categoryId: string | null; beforeId: string | null }): Promise<ApiResult<void>>
    move(input: z.infer<typeof PlannerMoveSchema>): Promise<ApiResult<void>>
    createEvent(input: z.infer<typeof PlannerEventInputSchema>): Promise<ApiResult<PlannerEvent>>
    updateEvent(input: z.infer<typeof PlannerEventInputSchema> & { id: string }): Promise<ApiResult<PlannerEvent>>
    deleteEvent(id: string): Promise<ApiResult<DeletedPlannerEvent>>
    undoDeleteEvent(snapshot: DeletedPlannerEvent): Promise<ApiResult<void>>
    onChanged(callback: (sequence: number) => void): () => void
  }
  settings: {
    get(): Promise<ApiResult<Settings>>
    update(input: Partial<Pick<Settings, 'shortcut' | 'shortcutEnabled' | 'launchAtLogin' | 'theme' | 'monitor' | 'captureProtection' | 'protectionTestApp' | 'protectionTestDate' | 'closeToTray' | 'firstRunComplete'>>): Promise<ApiResult<Settings>>
    onChanged(callback: () => void): () => void
    openFolder(): Promise<ApiResult<void>>
    displays(): Promise<ApiResult<{ id: number; label: string; primary: boolean }[]>>
  }
  data: {
    export(input: { format: 'txt' | 'md'; scope: 'selected' | 'all' | 'full'; ids?: string[] }): Promise<ApiResult<void>>
    backup(): Promise<ApiResult<void>>
    restore(): Promise<ApiResult<void>>
    diagnostics(): Promise<ApiResult<void>>
  }
  windows: { openCapture(): void; openNotes(): void; openSettings(): void; quit(): void; ready(): void; onView(callback: (view: 'all' | 'inbox' | 'calenban' | 'trash' | 'settings') => void): () => void }
}
