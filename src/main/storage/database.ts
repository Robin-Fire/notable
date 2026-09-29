import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { AppError } from '../../shared/errors'
import type { CaptureImage, Category, DeletedPlannerEvent, ImageRef, Note, NoteFilter, NotePage, PlannerEvent, PlannerTask, TagRecord } from '../../shared/contracts'
import { eventOverlapsLocalDay, localDateBounds } from '../../shared/plannerDates'

type NoteRow = { id: string; body: string; meeting_id: string | null; created_at: number; updated_at: number; deleted_at: number | null; revision: number; meeting_title: string | null; kind: 'inbox' | 'note' | 'task'; processed_at: number | null; tag_names: string | null; image_refs: string | null; task_status: 'open' | 'done' | null; planned_date: string | null; task_position: number; before_event_id: string | null; project_id: string | null; task_ready: number }
type PlannerEventRow = { id: string; title: string; start_at: number; end_at: number; all_day: number }
const NOTE_PROJECTION = "n.*,m.title AS meeting_title,(SELECT group_concat(t.name,char(31)) FROM note_tags nt JOIN item_tags t ON t.id=nt.tag_id WHERE nt.note_id=n.id) AS tag_names,(SELECT group_concat(ref,char(31)) FROM (SELECT i.id||':'||i.mime_type AS ref FROM item_images i WHERE i.note_id=n.id ORDER BY i.position)) AS image_refs"
const NOTE_FROM = 'FROM notes n LEFT JOIN legacy_meeting_sessions m ON m.id=n.meeting_id'
const noteFrom = (row: NoteRow): Note & { meetingTitle: string | null } => ({ id: row.id, body: row.body, meetingId: row.meeting_id, createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at, revision: row.revision, meetingTitle: row.meeting_title, kind: row.kind, processedAt: row.processed_at, tags: row.tag_names ? row.tag_names.split('\x1f') : [], images: row.image_refs ? row.image_refs.split('\x1f').map((value) => { const [id, mimeType] = value.split(':'); return { id: id!, mimeType: mimeType as ImageRef['mimeType'] } }) : [] })
const eventFrom = (row: PlannerEventRow): PlannerEvent => ({ id: row.id, title: row.title, startAt: row.start_at, endAt: row.end_at, allDay: Boolean(row.all_day) })
const taskFrom = (row: NoteRow): PlannerTask => ({ ...noteFrom(row), plannedDate: row.planned_date, position: row.task_position, beforeEventId: row.before_event_id, projectId: row.project_id, ready: Boolean(row.task_ready) })
function normalizeTags(tags: string[]) {
  return [...new Map(tags.map((tag) => tag.trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean).map((tag): [string, string] => [tag.toLowerCase(), tag])).values()].slice(0, 20)
}
const isISODate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day
}
export class Store {
  db: Database.Database
  readonly path: string
  changeSequence = 0

  constructor(path: string) {
    this.path = path
    this.db = this.open(path)
    this.migrate()
  }

  private open(path: string) {
    const db = new Database(path)
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = FULL')
    db.pragma('foreign_keys = ON')
    db.pragma('busy_timeout = 2000')
    return db
  }

  private migrate() {
    const hasMigrationTable = Boolean(this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get())
    const currentVersion = hasMigrationTable ? (this.db.prepare('SELECT max(version) AS version FROM schema_migrations').get() as { version: number | null }).version ?? 0 : 0
    if (hasMigrationTable && currentVersion < 7) {
      const backupDirectory = path.join(path.dirname(this.path), 'backups')
      fs.mkdirSync(backupDirectory, { recursive: true })
      this.db.pragma('wal_checkpoint(TRUNCATE)')
      const backupName = `pre-migration-${Date.now()}.sqlite`
      fs.copyFileSync(this.path, path.join(backupDirectory, backupName))
      const older = fs.readdirSync(backupDirectory).filter((name) => name.startsWith('pre-migration-') && name.endsWith('.sqlite')).sort().reverse().slice(1)
      for (const name of older) fs.rmSync(path.join(backupDirectory, name), { force: true })
    }
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);`)
    const applied = new Set((this.db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version))
    if (!applied.has(1)) {
      const transaction = this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE notes (
            id TEXT PRIMARY KEY, capture_request_id TEXT UNIQUE, body TEXT NOT NULL,
            meeting_id TEXT REFERENCES meetings(id) ON DELETE SET NULL,
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, revision INTEGER NOT NULL DEFAULT 1
          );
          CREATE TABLE meetings (
            id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
            started_at INTEGER NOT NULL, ended_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
          );
          CREATE TABLE drafts(key TEXT PRIMARY KEY, body TEXT NOT NULL, meeting_id TEXT, generation INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
          CREATE TABLE app_state(key TEXT PRIMARY KEY, value TEXT NOT NULL);
          CREATE INDEX notes_created ON notes(deleted_at, created_at DESC, id DESC);
          CREATE INDEX notes_meeting_created ON notes(meeting_id, created_at DESC, id DESC);
          CREATE VIRTUAL TABLE note_search USING fts5(note_id UNINDEXED, body, meeting_title, tokenize='unicode61 remove_diacritics 2');
        `)
        this.db.prepare('INSERT INTO drafts(key,body,generation,revision,updated_at) VALUES(\'capture\',\'\',0,0,?)').run(Date.now())
        this.db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(1,?)').run(Date.now())
      })
      transaction()
    }
    if (!applied.has(2)) {
      const transaction = this.db.transaction(() => {
        this.db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(2,?)').run(Date.now())
      })
      transaction()
    }
    if (!applied.has(3)) {
      const transaction = this.db.transaction(() => {
        this.db.exec(`
          ALTER TABLE notes ADD COLUMN kind TEXT NOT NULL DEFAULT 'note';
          ALTER TABLE notes ADD COLUMN processed_at INTEGER;
          ALTER TABLE notes ADD COLUMN task_status TEXT;
          ALTER TABLE notes ADD COLUMN planned_date TEXT;
          ALTER TABLE notes ADD COLUMN due_date TEXT;
          ALTER TABLE notes ADD COLUMN task_position INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE notes ADD COLUMN before_event_id TEXT;
          ALTER TABLE notes ADD COLUMN completed_at INTEGER;
          CREATE TABLE item_tags(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
          CREATE TABLE note_tags(note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES item_tags(id) ON DELETE CASCADE, PRIMARY KEY(note_id,tag_id));
          CREATE TABLE planner_events(id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120), start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, all_day INTEGER NOT NULL DEFAULT 0 CHECK(all_day IN (0,1)), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
          CREATE INDEX notes_kind_created ON notes(kind,deleted_at,created_at DESC,id DESC);
          CREATE INDEX notes_plan ON notes(kind,task_status,planned_date,task_position);
          CREATE INDEX planner_events_start ON planner_events(start_at,end_at);
          ALTER TABLE meetings RENAME TO legacy_meeting_sessions;
        `)
        this.db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(3,?)').run(Date.now())
      })
      transaction()
    }
    if (!applied.has(4)) {
      const transaction = this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE item_images(id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE, position INTEGER NOT NULL, mime_type TEXT NOT NULL, data BLOB NOT NULL);
          CREATE INDEX item_images_note ON item_images(note_id,position);
          CREATE TABLE capture_draft_images(id TEXT PRIMARY KEY, position INTEGER NOT NULL, mime_type TEXT NOT NULL, data BLOB NOT NULL);
        `)
        this.db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(4,?)').run(Date.now())
      })
      transaction()
    }
    if (!applied.has(5)) {
      this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE categories(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, position INTEGER NOT NULL);
          ALTER TABLE item_tags ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL;
          ALTER TABLE item_tags ADD COLUMN color TEXT NOT NULL DEFAULT '#85858e';
          CREATE INDEX item_tags_category ON item_tags(category_id,name);
        `)
        this.db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(5,?)').run(Date.now())
      })()
    }
    if (!applied.has(6)) {
      this.db.transaction(() => {
        this.db.exec(`
          ALTER TABLE notes ADD COLUMN project_id TEXT REFERENCES categories(id) ON DELETE SET NULL;
          ALTER TABLE notes ADD COLUMN task_ready INTEGER NOT NULL DEFAULT 0 CHECK(task_ready IN (0,1));
          UPDATE notes SET task_ready=1 WHERE kind='task' AND planned_date IS NOT NULL;
          UPDATE notes SET project_id=(SELECT min(t.category_id) FROM note_tags nt JOIN item_tags t ON t.id=nt.tag_id WHERE nt.note_id=notes.id AND t.category_id IS NOT NULL)
            WHERE kind='task' AND 1=(SELECT count(DISTINCT t.category_id) FROM note_tags nt JOIN item_tags t ON t.id=nt.tag_id WHERE nt.note_id=notes.id AND t.category_id IS NOT NULL);
          CREATE INDEX notes_backlog ON notes(kind,deleted_at,task_status,task_ready,project_id,created_at);
        `)
        this.db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(6,?)').run(Date.now())
      })()
    }
    if (!applied.has(7)) {
      this.db.transaction(() => {
        this.db.exec(`
          UPDATE notes SET deleted_at=coalesce(completed_at,updated_at),task_status='open',completed_at=NULL,planned_date=NULL,before_event_id=NULL,task_ready=0,task_position=0,revision=revision+1
          WHERE kind='task' AND task_status='done';
        `)
        this.db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(7,?)').run(Date.now())
      })()
    }
    const version = this.db.prepare('SELECT max(version) AS version FROM schema_migrations').get() as { version: number | null }
    if (version.version !== 7) throw new AppError(version.version && version.version > 7 ? 'DB_NEWER_VERSION' : 'DB_INVALID_SCHEMA', 'This database has an unsupported notable schema.')
  }

  getCaptureDraft() {
    const draft = this.db.prepare("SELECT body,generation,revision FROM drafts WHERE key='capture'").get() as { body: string; generation: number; revision: number }
    const rows = this.db.prepare('SELECT id,mime_type,data FROM capture_draft_images ORDER BY position').all() as { id: string; mime_type: ImageRef['mimeType']; data: Buffer }[]
    return { ...draft, images: rows.map((row): CaptureImage => ({ id: row.id, mimeType: row.mime_type, dataUrl: `data:${row.mime_type};base64,${row.data.toString('base64')}` })) }
  }

  updateDraft(body: string, generation: number, revision: number) {
    const current = this.db.prepare("SELECT generation,revision FROM drafts WHERE key='capture'").get() as { generation: number; revision: number }
    if (generation < current.generation || (generation === current.generation && revision < current.revision)) return current.revision
    const nextRevision = generation === current.generation ? revision : 0
    this.db.prepare("UPDATE drafts SET body=?,generation=?,revision=?,updated_at=? WHERE key='capture'").run(body, generation, nextRevision, Date.now())
    return nextRevision
  }

  addDraftImage(generation: number, dataUrl: string): CaptureImage {
    const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
    if (!match || dataUrl.length > 7_000_000) throw new AppError('INVALID_IMAGE', 'Paste a PNG, JPEG, WebP, or GIF image under 5 MB.')
    const mimeType = match[1] as ImageRef['mimeType']
    const data = Buffer.from(match[2]!, 'base64')
    const valid = mimeType === 'image/png' ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mimeType === 'image/jpeg' ? data[0] === 255 && data[1] === 216 && data[2] === 255
      : mimeType === 'image/webp' ? data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'
      : ['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6))
    if (!valid || data.length === 0 || data.length > 5_000_000) throw new AppError('INVALID_IMAGE', 'Paste a PNG, JPEG, WebP, or GIF image under 5 MB.')
    const current = this.db.prepare("SELECT generation FROM drafts WHERE key='capture'").get() as { generation: number }
    if (generation !== current.generation) throw new AppError('STALE_DRAFT', 'The capture changed. Open it again before pasting.')
    const stats = this.db.prepare('SELECT count(*) AS count,coalesce(sum(length(data)),0) AS bytes FROM capture_draft_images').get() as { count: number; bytes: number }
    if (stats.count >= 5 || stats.bytes + data.length > 20_000_000) throw new AppError('TOO_MANY_IMAGES', 'A capture can hold up to five images and 20 MB total.')
    const id = randomUUID()
    this.db.prepare('INSERT INTO capture_draft_images(id,position,mime_type,data) VALUES(?,?,?,?)').run(id, stats.count, mimeType, data)
    return { id, mimeType, dataUrl }
  }

  removeDraftImage(generation: number, id: string) {
    const current = this.db.prepare("SELECT generation FROM drafts WHERE key='capture'").get() as { generation: number }
    if (generation !== current.generation) throw new AppError('STALE_DRAFT', 'The capture changed. Open it again before editing images.')
    this.db.prepare('DELETE FROM capture_draft_images WHERE id=?').run(id)
  }

  getItemImage(id: string): string {
    const row = this.db.prepare('SELECT mime_type,data FROM item_images WHERE id=?').get(id) as { mime_type: string; data: Buffer } | undefined
    if (!row) throw new AppError('NOT_FOUND', 'This image is no longer available.')
    return `data:${row.mime_type};base64,${row.data.toString('base64')}`
  }

  submitCapture(requestId: string, generation: number, body: string) {
    const cleaned = body.trim()
    const current = this.db.prepare("SELECT generation FROM drafts WHERE key='capture'").get() as { generation: number }
    const hasImages = generation === current.generation && Boolean(this.db.prepare('SELECT 1 FROM capture_draft_images LIMIT 1').get())
    if (!cleaned && !hasImages) throw new AppError('EMPTY_NOTE', 'Write something or paste an image before saving.')
    if ([...body].length > 50_000) throw new AppError('NOTE_TOO_LONG', 'Notes can contain up to 50,000 characters.')
    const existing = this.db.prepare('SELECT id FROM notes WHERE capture_request_id=?').get(requestId) as { id: string } | undefined
    if (existing) return existing.id
    const now = Date.now()
    const id = randomUUID()
    const commit = this.db.transaction(() => {
      this.db.prepare("INSERT INTO notes(id,capture_request_id,body,meeting_id,created_at,updated_at,revision,kind) VALUES(?,?,?,NULL,?,?,1,'inbox')")
        .run(id, requestId, body.replace(/\r\n?/g, '\n'), now, now)
      if (generation === current.generation) {
        this.db.prepare('INSERT INTO item_images(id,note_id,position,mime_type,data) SELECT id,?,position,mime_type,data FROM capture_draft_images').run(id)
        this.db.prepare('DELETE FROM capture_draft_images').run()
      }
      this.db.prepare("UPDATE drafts SET body='',generation=?,revision=0,updated_at=? WHERE key='capture' AND generation<=?").run(generation + 1, now, generation)
      this.syncSearch(id)
    })
    commit()
    this.changeSequence++
    return id
  }

  listNotes(filter: NoteFilter): NotePage {
    const trashScope = filter.scope === 'trash'
    const sortColumn = trashScope ? 'n.deleted_at' : 'n.created_at'
    const where: string[] = [trashScope ? 'n.deleted_at IS NOT NULL' : 'n.deleted_at IS NULL']
    const params: (string | number)[] = []
    if (filter.kinds?.length) {
      where.push(`n.kind IN (${filter.kinds.map(() => '?').join(',')})`)
      params.push(...filter.kinds)
    }
    if (filter.dateFrom !== undefined) { where.push(`${sortColumn}>=?`); params.push(filter.dateFrom) }
    if (filter.dateTo !== undefined) { where.push(`${sortColumn}<?`); params.push(filter.dateTo) }
    if (filter.tags?.length) {
      where.push(`EXISTS (SELECT 1 FROM note_tags nt JOIN item_tags t ON t.id=nt.tag_id WHERE nt.note_id=n.id AND t.name COLLATE NOCASE IN (${filter.tags.map(() => '?').join(',')}))`)
      params.push(...filter.tags)
    }
    const query = filter.query.trim()
    if (query) {
      const terms = query.match(/[\p{L}\p{N}_]+/gu) ?? []
      if (terms.length) {
        const match = terms.map((term) => `"${term.replaceAll('"', '""')}"*`).join(' AND ')
        where.push('n.id IN (SELECT note_id FROM note_search WHERE note_search MATCH ?)')
        params.push(match)
      } else {
        where.push("(instr(lower(n.body),lower(?))>0 OR instr(lower(coalesce(m.title,'')),lower(?))>0)")
        params.push(query, query)
      }
    }
    const base = where.join(' AND ')
    const count = this.db.prepare(`SELECT count(*) AS count FROM notes n LEFT JOIN legacy_meeting_sessions m ON m.id=n.meeting_id WHERE ${base}`).get(...params) as { count: number }
    const pageWhere = [...where]
    const pageParams = [...params]
    if (filter.cursor) {
      const operator = filter.sort === 'oldest' ? '>' : '<'
      pageWhere.push(`(${sortColumn}${operator}? OR (${sortColumn}=? AND n.id${operator}?))`)
      pageParams.push(filter.cursor.sortAt, filter.cursor.sortAt, filter.cursor.id)
    }
    const order = filter.sort === 'oldest' ? 'ASC' : 'DESC'
    const items = this.db.prepare(`SELECT ${NOTE_PROJECTION} ${NOTE_FROM} WHERE ${pageWhere.join(' AND ')} ORDER BY ${sortColumn} ${order},n.id ${order} LIMIT ?`)
      .all(...pageParams, filter.limit) as NoteRow[]
    const last = items.at(-1)
    const sortAt = last ? (trashScope ? last.deleted_at : last.created_at) : null
    return { items: items.map(noteFrom), nextCursor: items.length === filter.limit && last && sortAt !== null ? { sortAt, id: last.id } : null, total: count.count }
  }

  listTags(): string[] {
    return (this.db.prepare('SELECT name FROM item_tags ORDER BY name COLLATE NOCASE').all() as { name: string }[]).map((row) => row.name)
  }

  taxonomy(): { categories: Category[]; tags: TagRecord[] } {
    const categories = this.db.prepare('SELECT id,name FROM categories ORDER BY position,name COLLATE NOCASE').all() as Category[]
    const rows = this.db.prepare(`SELECT t.id,t.name,t.category_id AS categoryId,t.color,count(n.id) AS count
      FROM item_tags t LEFT JOIN note_tags nt ON nt.tag_id=t.id LEFT JOIN notes n ON n.id=nt.note_id AND n.deleted_at IS NULL
      GROUP BY t.id ORDER BY t.name COLLATE NOCASE`).all() as TagRecord[]
    return { categories, tags: rows }
  }

  createCategory(name: string): Category {
    const clean = name.trim().replace(/\s+/g, ' ')
    if (this.db.prepare('SELECT id FROM categories WHERE name=? COLLATE NOCASE').get(clean)) throw new AppError('DUPLICATE_CATEGORY', 'That category already exists.')
    const category = { id: randomUUID(), name: clean }
    this.db.prepare('INSERT INTO categories(id,name,position) VALUES(?,?,(SELECT count(*) FROM categories))').run(category.id, category.name)
    this.changeSequence++
    return category
  }

  createTag(name: string, categoryId: string | null): TagRecord {
    const clean = name.trim().replace(/\s+/g, ' ')
    if (categoryId && !this.db.prepare('SELECT id FROM categories WHERE id=?').get(categoryId)) throw new AppError('CATEGORY_MISSING', 'That category no longer exists.')
    if (this.db.prepare('SELECT id FROM item_tags WHERE name=? COLLATE NOCASE').get(clean)) throw new AppError('DUPLICATE_TAG', 'That tag already exists. Open its page to change its category.')
    const tag = { id: randomUUID(), name: clean, categoryId, color: '#85858e', count: 0 }
    this.db.prepare('INSERT INTO item_tags(id,name,category_id,color) VALUES(?,?,?,?)').run(tag.id, tag.name, tag.categoryId, tag.color)
    this.changeSequence++
    return tag
  }

  updateTag(id: string, categoryId: string | null, color: string) {
    if (categoryId && !this.db.prepare('SELECT id FROM categories WHERE id=?').get(categoryId)) throw new AppError('CATEGORY_MISSING', 'That category no longer exists.')
    const result = this.db.prepare('UPDATE item_tags SET category_id=?,color=? WHERE id=?').run(categoryId, color, id)
    if (!result.changes) throw new AppError('TAG_MISSING', 'That tag no longer exists.')
    this.changeSequence++
  }

  getNote(id: string) {
    const row = this.db.prepare(`SELECT ${NOTE_PROJECTION} ${NOTE_FROM} WHERE n.id=?`).get(id) as NoteRow | undefined
    return row ? noteFrom(row) : null
  }

  listInbox(cursor?: { sortAt: number; id: string }, limit = 50): { items: (Note & { meetingTitle: string | null })[]; nextCursor: { sortAt: number; id: string } | null; total: number } {
    const cursorWhere = cursor ? ' AND (n.created_at<? OR (n.created_at=? AND n.id<?))' : ''
    const params = cursor ? [cursor.sortAt, cursor.sortAt, cursor.id, limit] : [limit]
    const rows = this.db.prepare(`SELECT ${NOTE_PROJECTION} ${NOTE_FROM} WHERE n.deleted_at IS NULL AND n.kind='inbox'${cursorWhere} ORDER BY n.created_at DESC,n.id DESC LIMIT ?`).all(...params) as NoteRow[]
    const last = rows.at(-1)
    return { items: rows.map(noteFrom), nextCursor: rows.length === limit && last ? { sortAt: last.created_at, id: last.id } : null, total: this.inboxCount() }
  }

  inboxCount() {
    return (this.db.prepare("SELECT count(*) AS count FROM notes WHERE deleted_at IS NULL AND kind='inbox'").get() as { count: number }).count
  }

  classifyItem(id: string, kind: 'note' | 'task', tags: string[], projectId: string | null = null) {
    const cleanTags = normalizeTags(tags)
    const now = Date.now()
    const transaction = this.db.transaction(() => {
      if (projectId && !this.db.prepare('SELECT id FROM categories WHERE id=?').get(projectId)) throw new AppError('CATEGORY_MISSING', 'That project no longer exists.')
      const changed = this.db.prepare("UPDATE notes SET kind=?,processed_at=?,task_status=?,planned_date=?,due_date=?,task_position=0,before_event_id=NULL,completed_at=NULL,project_id=?,task_ready=0,updated_at=?,revision=revision+1 WHERE id=? AND deleted_at IS NULL AND kind='inbox'").run(kind, now, kind === 'task' ? 'open' : null, null, null, kind === 'task' ? projectId : null, now, id)
      if (!changed.changes) throw new AppError('ALREADY_FILED', 'This Inbox item has already been filed. Reload the Inbox to continue.')
      this.replaceItemTags(id, cleanTags, kind === 'task' ? projectId : null)
      if (kind === 'task' && !projectId) this.db.prepare(`UPDATE notes SET project_id=(SELECT min(t.category_id) FROM note_tags nt JOIN item_tags t ON t.id=nt.tag_id WHERE nt.note_id=? AND t.category_id IS NOT NULL) WHERE id=? AND 1=(SELECT count(DISTINCT t.category_id) FROM note_tags nt JOIN item_tags t ON t.id=nt.tag_id WHERE nt.note_id=? AND t.category_id IS NOT NULL)`).run(id, id, id)
    })
    transaction(); this.changeSequence++
  }

  unfilePlannerTask(id: string) {
    const current = this.db.prepare("SELECT planned_date,before_event_id FROM notes WHERE id=? AND kind='task' AND deleted_at IS NULL").get(id) as { planned_date: string | null; before_event_id: string | null } | undefined
    if (!current) throw new AppError('NOT_FOUND', 'This to-do no longer exists.')
    const transaction = this.db.transaction(() => {
      this.db.prepare("UPDATE notes SET kind='inbox',processed_at=NULL,task_status=NULL,planned_date=NULL,due_date=NULL,task_position=0,before_event_id=NULL,completed_at=NULL,project_id=NULL,task_ready=0,updated_at=?,revision=revision+1 WHERE id=? AND kind='task' AND deleted_at IS NULL").run(Date.now(), id)
      if (current.planned_date) this.compactTaskSlot(current.planned_date, current.before_event_id)
    })
    transaction(); this.changeSequence++
  }

  setItemTags(id: string, tags: string[]) {
    const current = this.getNote(id)
    if (!current || current.deletedAt !== null || current.kind === 'inbox') throw new AppError('NOT_FOUND', 'This item is not filed.')
    const cleanTags = normalizeTags(tags)
    const transaction = this.db.transaction(() => {
      const project = this.db.prepare("SELECT project_id FROM notes WHERE id=? AND kind='task'").get(id) as { project_id: string | null } | undefined
      this.replaceItemTags(id, cleanTags, project?.project_id ?? null)
      this.db.prepare('UPDATE notes SET revision=revision+1,updated_at=? WHERE id=?').run(Date.now(), id)
    })
    transaction(); this.changeSequence++
  }

  private replaceItemTags(id: string, tags: string[], projectId: string | null = null) {
    this.db.prepare('DELETE FROM note_tags WHERE note_id=?').run(id)
    for (const name of tags) {
      this.db.prepare('INSERT INTO item_tags(id,name,category_id) VALUES(?,?,?) ON CONFLICT(name) DO NOTHING').run(randomUUID(), name, projectId)
      const tag = this.db.prepare('SELECT id FROM item_tags WHERE name=? COLLATE NOCASE').get(name) as { id: string }
      this.db.prepare('INSERT INTO note_tags(note_id,tag_id) VALUES(?,?)').run(id, tag.id)
    }
  }

  listBacklog(input: { query?: string; cursor?: { sortAt: number; id: string }; limit?: number } = {}): { items: PlannerTask[]; nextCursor: { sortAt: number; id: string } | null; total: number } {
    const limit = input.limit ?? 50
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AppError('INVALID_INPUT', 'Choose a valid backlog page size.')
    const query = input.query?.trim() ?? ''
    const where = ["n.deleted_at IS NULL", "n.kind='task'", "n.task_status='open'", 'n.task_ready=0', 'n.planned_date IS NULL']
    const params: (string | number)[] = []
    if (query) {
      where.push("(instr(lower(n.body),lower(?))>0 OR EXISTS (SELECT 1 FROM note_tags nt JOIN item_tags t ON t.id=nt.tag_id WHERE nt.note_id=n.id AND instr(lower(t.name),lower(?))>0))")
      params.push(query, query)
    }
    const base = where.join(' AND ')
    const total = (this.db.prepare(`SELECT count(*) AS count FROM notes n WHERE ${base}`).get(...params) as { count: number }).count
    const pageWhere = [...where]
    const pageParams = [...params]
    if (input.cursor) {
      pageWhere.push('(n.created_at<? OR (n.created_at=? AND n.id<?))')
      pageParams.push(input.cursor.sortAt, input.cursor.sortAt, input.cursor.id)
    }
    const rows = this.db.prepare(`SELECT ${NOTE_PROJECTION} ${NOTE_FROM} WHERE ${pageWhere.join(' AND ')} ORDER BY n.created_at DESC,n.id DESC LIMIT ?`)
      .all(...pageParams, limit + 1) as NoteRow[]
    const hasMore = rows.length > limit
    const items = rows.slice(0, limit)
    const last = items.at(-1)
    return { items: items.map(taskFrom), nextCursor: hasMore && last ? { sortAt: last.created_at, id: last.id } : null, total }
  }

  setTaskReady(id: string) {
    const row = this.db.prepare("SELECT planned_date,before_event_id FROM notes WHERE id=? AND kind='task' AND task_status='open' AND deleted_at IS NULL").get(id) as { planned_date: string | null; before_event_id: string | null } | undefined
    if (!row) throw new AppError('NOT_FOUND', 'This open task no longer exists.')
    this.db.transaction(() => {
      const existingReady = this.db.prepare("SELECT id FROM notes WHERE kind='task' AND task_status='open' AND deleted_at IS NULL AND task_ready=1 AND planned_date IS NULL ORDER BY task_position,created_at,id").all() as { id: string }[]
      this.db.prepare('UPDATE notes SET task_ready=1,planned_date=NULL,before_event_id=NULL,task_position=0,updated_at=?,revision=revision+1 WHERE id=?').run(Date.now(), id)
      const ids = [...existingReady.map((task) => task.id).filter((taskId) => taskId !== id), id]
      const update = this.db.prepare('UPDATE notes SET task_position=? WHERE id=?')
      ids.forEach((taskId, position) => update.run(position, taskId))
      if (row.planned_date) this.compactTaskSlot(row.planned_date, row.before_event_id)
    })()
    this.changeSequence++
  }

  setTaskProject(id: string, projectId: string | null) {
    if (projectId && !this.db.prepare('SELECT id FROM categories WHERE id=?').get(projectId)) throw new AppError('CATEGORY_MISSING', 'That project no longer exists.')
    const changed = this.db.prepare("UPDATE notes SET project_id=?,updated_at=?,revision=revision+1 WHERE id=? AND kind='task' AND deleted_at IS NULL").run(projectId, Date.now(), id)
    if (!changed.changes) throw new AppError('NOT_FOUND', 'This task no longer exists.')
    this.changeSequence++
  }

  listPlanner(from: string, to: string): { tasks: PlannerTask[]; events: PlannerEvent[]; tags: string[] } {
    if (!isISODate(from) || !isISODate(to) || to < from) throw new AppError('INVALID_INPUT', 'Choose a valid planner date range.')
    const start = new Date(`${from}T00:00:00`).getTime()
    const end = localDateBounds(to).end
    const rows = this.db.prepare(`SELECT ${NOTE_PROJECTION} ${NOTE_FROM} WHERE n.deleted_at IS NULL AND n.kind='task' AND n.task_status='open' AND ((n.planned_date IS NULL AND n.task_ready=1) OR (n.planned_date>=? AND n.planned_date<=?) OR n.planned_date<?) ORDER BY coalesce(n.planned_date,''),n.before_event_id,n.task_position,n.created_at,n.id`).all(from, to, from) as NoteRow[]
    const tasks = rows.map(taskFrom)
    const events = (this.db.prepare('SELECT * FROM planner_events WHERE start_at<? AND end_at>? ORDER BY start_at,end_at,title').all(end, start) as PlannerEventRow[]).map(eventFrom)
    const tags = (this.db.prepare('SELECT name FROM item_tags ORDER BY name COLLATE NOCASE').all() as { name: string }[]).map((row) => row.name)
    return { tasks, events, tags }
  }

  movePlannerTask(id: string, plannedDate: string | null, beforeEventId: string | null, beforeId: string | null) {
    if (plannedDate !== null && !isISODate(plannedDate)) throw new AppError('INVALID_INPUT', 'Choose a valid planner date.')
    const row = this.db.prepare("SELECT planned_date,before_event_id,task_position FROM notes WHERE id=? AND kind='task' AND task_status='open' AND deleted_at IS NULL").get(id) as { planned_date: string | null; before_event_id: string | null; task_position: number } | undefined
    if (!row) throw new AppError('NOT_FOUND', 'This open task no longer exists.')
    if (plannedDate === null && beforeEventId !== null) throw new AppError('INVALID_INPUT', 'An unscheduled task cannot be attached to a meeting.')
    if (beforeEventId) {
      const bounds = localDateBounds(plannedDate!)
      if (!this.db.prepare('SELECT id FROM planner_events WHERE id=? AND start_at<? AND end_at>?').get(beforeEventId, bounds.end, bounds.start)) throw new AppError('INVALID_INPUT', 'That meeting does not overlap the selected day.')
    }
    const readySlot = plannedDate === null ? ' AND task_ready=1' : ''
    const sameSlot = this.db.prepare(`SELECT id FROM notes WHERE kind='task' AND task_status='open' AND deleted_at IS NULL AND planned_date IS ? AND before_event_id IS ?${readySlot} ORDER BY task_position,created_at,id`).all(plannedDate, beforeEventId) as { id: string }[]
    if (beforeId && !sameSlot.some((item) => item.id === beforeId && item.id !== id)) throw new AppError('INVALID_INPUT', 'The task order changed. Reload and try again.')
    const transaction = this.db.transaction(() => {
      this.db.prepare('UPDATE notes SET planned_date=?,before_event_id=?,task_ready=1,task_position=0,revision=revision+1,updated_at=? WHERE id=?').run(plannedDate, beforeEventId, Date.now(), id)
      const ids = sameSlot.map((item) => item.id).filter((taskId) => taskId !== id)
      const index = beforeId ? ids.indexOf(beforeId) : ids.length
      ids.splice(index < 0 ? ids.length : index, 0, id)
      const update = this.db.prepare('UPDATE notes SET task_position=? WHERE id=?')
      ids.forEach((taskId, position) => update.run(position, taskId))
      if (row.planned_date !== null) this.compactTaskSlot(row.planned_date, row.before_event_id)
      else this.compactReadySlot()
    })
    transaction(); this.changeSequence++
  }

  private compactTaskSlot(day: string, eventId: string | null) {
    const rows = this.db.prepare("SELECT id FROM notes WHERE kind='task' AND task_status='open' AND deleted_at IS NULL AND planned_date=? AND before_event_id IS ? ORDER BY task_position,created_at,id").all(day, eventId) as { id: string }[]
    const update = this.db.prepare('UPDATE notes SET task_position=? WHERE id=?')
    rows.forEach((row, position) => update.run(position, row.id))
  }

  private compactReadySlot() {
    const rows = this.db.prepare("SELECT id FROM notes WHERE kind='task' AND task_status='open' AND deleted_at IS NULL AND task_ready=1 AND planned_date IS NULL AND before_event_id IS NULL ORDER BY task_position,created_at,id").all() as { id: string }[]
    const update = this.db.prepare('UPDATE notes SET task_position=? WHERE id=?')
    rows.forEach((row, position) => update.run(position, row.id))
  }

  savePlannerEvent(input: { id?: string; title: string; startAt: number; endAt: number; allDay: boolean }): PlannerEvent {
    const title = input.title.trim()
    if (!title || title.length > 120 || !Number.isSafeInteger(input.startAt) || !Number.isSafeInteger(input.endAt) || input.endAt <= input.startAt) throw new AppError('INVALID_INPUT', 'Enter a title and valid meeting start and end times.')
    const now = Date.now()
    const id = input.id ?? randomUUID()
    const save = this.db.transaction(() => {
      this.db.prepare('INSERT INTO planner_events(id,title,start_at,end_at,all_day,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,start_at=excluded.start_at,end_at=excluded.end_at,all_day=excluded.all_day,updated_at=excluded.updated_at').run(id, title, input.startAt, input.endAt, input.allDay ? 1 : 0, now, now)
      const taskRows = this.db.prepare("SELECT id,planned_date,before_event_id FROM notes WHERE before_event_id=? AND kind='task' AND deleted_at IS NULL").all(id) as { id: string; planned_date: string | null; before_event_id: string | null }[]
      for (const task of taskRows) {
        const bounds = task.planned_date ? localDateBounds(task.planned_date) : null
        if (!bounds || input.startAt >= bounds.end || input.endAt <= bounds.start) {
          this.db.prepare('UPDATE notes SET before_event_id=NULL,revision=revision+1,updated_at=? WHERE id=?').run(now, task.id)
          if (task.planned_date) this.compactTaskSlot(task.planned_date, null)
        }
      }
      return this.db.prepare('SELECT * FROM planner_events WHERE id=?').get(id) as PlannerEventRow
    })
    const row = save()
    this.changeSequence++
    return eventFrom(row)
  }

  updatePlannerEvent(input: { id: string; title: string; startAt: number; endAt: number; allDay: boolean }) {
    if (!this.db.prepare('SELECT id FROM planner_events WHERE id=?').get(input.id)) throw new AppError('NOT_FOUND', 'This scheduled meeting no longer exists.')
    return this.savePlannerEvent(input)
  }

  deletePlannerEvent(id: string): DeletedPlannerEvent {
    const event = this.db.prepare('SELECT * FROM planner_events WHERE id=?').get(id) as PlannerEventRow | undefined
    if (!event) throw new AppError('NOT_FOUND', 'This meeting no longer exists.')
    const affected = this.db.prepare("SELECT id,planned_date,task_position FROM notes WHERE before_event_id=? AND kind='task' AND deleted_at IS NULL ORDER BY task_position,created_at,id").all(id) as { id: string; planned_date: string | null; task_position: number }[]
    const transaction = this.db.transaction(() => {
      this.db.prepare('UPDATE notes SET before_event_id=NULL,revision=revision+1,updated_at=? WHERE before_event_id=?').run(Date.now(), id)
      this.db.prepare('DELETE FROM planner_events WHERE id=?').run(id)
      for (const task of affected) if (task.planned_date) this.compactTaskSlot(task.planned_date, null)
    })
    transaction(); this.changeSequence++
    return { event: eventFrom(event), anchors: affected.map((task) => ({ id: task.id, plannedDate: task.planned_date, position: task.task_position })) }
  }

  undoDeletePlannerEvent(snapshot: DeletedPlannerEvent) {
    const { event, anchors } = snapshot
    if (this.db.prepare('SELECT id FROM planner_events WHERE id=?').get(event.id)) throw new AppError('ALREADY_EXISTS', 'This meeting has already been restored.')
    const now = Date.now()
    const restore = this.db.transaction(() => {
      this.db.prepare('INSERT INTO planner_events(id,title,start_at,end_at,all_day,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(event.id, event.title, event.startAt, event.endAt, event.allDay ? 1 : 0, now, now)
      const days = new Set<string>()
      for (const anchor of anchors) {
        if (!anchor.plannedDate || !eventOverlapsLocalDay(event.startAt, event.endAt, anchor.plannedDate)) continue
        const changed = this.db.prepare("UPDATE notes SET before_event_id=?,task_position=?,revision=revision+1,updated_at=? WHERE id=? AND kind='task' AND deleted_at IS NULL AND planned_date=? AND before_event_id IS NULL").run(event.id, anchor.position, now, anchor.id, anchor.plannedDate)
        if (changed.changes) days.add(anchor.plannedDate)
      }
      for (const day of days) { this.compactTaskSlot(day, event.id); this.compactTaskSlot(day, null) }
    })
    restore(); this.changeSequence++
  }

  updateNote(id: string, expectedRevision: number, body: string) {
    const current = this.getNote(id)
    if (!current) throw new AppError('NOT_FOUND', 'This note no longer exists.')
    if (current.revision !== expectedRevision) throw new AppError('REVISION_CONFLICT', 'This note changed elsewhere. Reload it before saving.')
    if ([...body].length > 50_000) throw new AppError('NOTE_TOO_LONG', 'Notes can contain up to 50,000 characters.')
    const now = Date.now()
    const transaction = this.db.transaction(() => {
      const changed = this.db.prepare('UPDATE notes SET body=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=? AND deleted_at IS NULL').run(body.replace(/\r\n?/g, '\n'), now, id, expectedRevision)
      if (!changed.changes) throw new AppError('REVISION_CONFLICT', 'This note changed elsewhere. Reload it before saving.')
      this.syncSearch(id)
    })
    transaction()
    this.changeSequence++
    const updated = this.getNote(id)
    if (!updated) throw new AppError('NOT_FOUND', 'This note no longer exists.')
    return updated
  }

  updateItem(id: string, expectedRevision: number, body: string, tags: string[]) {
    const current = this.getNote(id)
    if (!current || current.deletedAt !== null) throw new AppError('NOT_FOUND', 'This item no longer exists.')
    if (current.revision !== expectedRevision) throw new AppError('REVISION_CONFLICT', 'This item changed elsewhere. Reload it before saving.')
    if ([...body].length > 50_000) throw new AppError('NOTE_TOO_LONG', 'Notes can contain up to 50,000 characters.')
    const cleanTags = normalizeTags(tags)
    const now = Date.now()
    const transaction = this.db.transaction(() => {
      const changed = this.db.prepare('UPDATE notes SET body=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=? AND deleted_at IS NULL').run(body.replace(/\r\n?/g, '\n'), now, id, expectedRevision)
      if (!changed.changes) throw new AppError('REVISION_CONFLICT', 'This item changed elsewhere. Reload it before saving.')
      const project = this.db.prepare("SELECT project_id FROM notes WHERE id=? AND kind='task'").get(id) as { project_id: string | null } | undefined
      this.replaceItemTags(id, cleanTags, project?.project_id ?? null)
      this.syncSearch(id)
    })
    transaction()
    this.changeSequence++
    const updated = this.getNote(id)
    if (!updated) throw new AppError('NOT_FOUND', 'This item no longer exists.')
    return updated
  }

  private syncSearch(id: string) {
    const row = this.db.prepare('SELECT n.id,n.body,coalesce(m.title,\'\') AS title FROM notes n LEFT JOIN legacy_meeting_sessions m ON m.id=n.meeting_id WHERE n.id=?').get(id) as { id: string; body: string; title: string } | undefined
    this.db.prepare('DELETE FROM note_search WHERE note_id=?').run(id)
    if (row) this.db.prepare('INSERT INTO note_search(note_id,body,meeting_title) VALUES(?,?,?)').run(id, row.body, row.title)
  }

  trash(ids: string[]) { this.changeRows(ids, 'UPDATE notes SET deleted_at=?,updated_at=?,revision=revision+1 WHERE id=? AND deleted_at IS NULL', Date.now(), Date.now()) }
  restore(ids: string[]) { this.changeRows(ids, 'UPDATE notes SET deleted_at=NULL,updated_at=?,revision=revision+1 WHERE id=? AND deleted_at IS NOT NULL', Date.now()) }
  permanentlyDelete(ids: string[]) {
    const transaction = this.db.transaction(() => { for (const id of ids) { this.db.prepare('DELETE FROM note_search WHERE note_id=?').run(id); this.db.prepare('DELETE FROM notes WHERE id=? AND deleted_at IS NOT NULL').run(id) } })
    transaction(); this.changeSequence++
  }
  emptyTrash() {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM note_search WHERE note_id IN (SELECT id FROM notes WHERE deleted_at IS NOT NULL)').run()
      this.db.prepare('DELETE FROM notes WHERE deleted_at IS NOT NULL').run()
    })
    transaction(); this.changeSequence++
  }
  private changeRows(ids: string[], sql: string, ...common: number[]) {
    const transaction = this.db.transaction(() => { for (const id of ids) this.db.prepare(sql).run(...common, id) })
    transaction(); this.changeSequence++
  }

  getDraftText(ids: string[]) { return ids.map((id) => this.getNote(id)).filter((n): n is NonNullable<typeof n> => Boolean(n)).map((n) => n.body).join('\n\n') }

  taskExportMetadata(ids: string[]) {
    const metadata = new Map<string, { projectName: string | null; ready: boolean; plannedDate: string | null }>()
    for (let offset = 0; offset < ids.length; offset += 500) {
      const batch = ids.slice(offset, offset + 500)
      if (!batch.length) continue
      const rows = this.db.prepare(`SELECT n.id,c.name AS project_name,n.task_ready,n.planned_date FROM notes n LEFT JOIN categories c ON c.id=n.project_id WHERE n.kind='task' AND n.id IN (${batch.map(() => '?').join(',')})`).all(...batch) as { id: string; project_name: string | null; task_ready: number; planned_date: string | null }[]
      for (const row of rows) metadata.set(row.id, { projectName: row.project_name, ready: Boolean(row.task_ready), plannedDate: row.planned_date })
    }
    return metadata
  }

  recentNotes(scope: 'all' | 'full' = 'all') {
    const deleted = scope === 'full' ? '' : 'WHERE n.deleted_at IS NULL'
    return this.db.prepare(`SELECT ${NOTE_PROJECTION} ${NOTE_FROM} ${deleted} ORDER BY n.created_at DESC,n.id DESC`).all() as NoteRow[]
  }
  legacyMeetingLabels() { return this.db.prepare('SELECT id,title,started_at,ended_at,created_at,updated_at FROM legacy_meeting_sessions ORDER BY started_at DESC').all() as { id: string; title: string; started_at: number; ended_at: number | null; created_at: number; updated_at: number }[] }
  backupTo(path: string) { return this.db.backup(path) }
  checkIntegrity(path?: string) {
    const database = path ? new Database(path, { readonly: true, fileMustExist: true }) : this.db
    try {
      const result = database.pragma('integrity_check') as { integrity_check: string }[]
      if (result.length !== 1 || result[0]?.integrity_check !== 'ok') throw new AppError('DB_CORRUPT', 'The selected backup failed its SQLite integrity check.')
      const version = database.prepare('SELECT max(version) AS version FROM schema_migrations').get() as { version: number | null }
      const required = ['notes', 'drafts', 'app_state', 'schema_migrations', 'note_search', ...(version.version && version.version >= 3 ? ['legacy_meeting_sessions', 'planner_events', 'item_tags', 'note_tags'] : ['meetings']), ...(version.version && version.version >= 4 ? ['item_images', 'capture_draft_images'] : []), ...(version.version && version.version >= 5 ? ['categories'] : [])]
      const tables = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')").all() as { name: string }[]).map((row) => row.name))
      if (required.some((name) => !tables.has(name))) throw new AppError('DB_INVALID_SCHEMA', 'The selected file is not a complete notable backup.')
       if (![2, 3, 4, 5, 6, 7].includes(version.version ?? 0)) throw new AppError(version.version && version.version > 7 ? 'DB_NEWER_VERSION' : 'DB_INVALID_SCHEMA', 'This backup has an unsupported notable schema.')
      if ((database.pragma('foreign_key_check') as unknown[]).length) throw new AppError('DB_CORRUPT', 'The selected backup contains invalid note links.')
    } finally { if (path) database.close() }
  }
  replaceWith(path: string) {
    const stagingPath = `${this.path}.restore-stage-${randomUUID()}`
    const recoveryPath = `${this.path}.recovery-${randomUUID()}`
    fs.copyFileSync(path, stagingPath)
    this.checkIntegrity(stagingPath)
    for (const suffix of ['-wal', '-shm']) if (fs.existsSync(`${stagingPath}${suffix}`)) fs.unlinkSync(`${stagingPath}${suffix}`)
    this.db.pragma('wal_checkpoint(TRUNCATE)')
    this.db.close()
    let movedOriginal = false
    try {
      for (const suffix of ['-wal', '-shm']) if (fs.existsSync(`${this.path}${suffix}`)) fs.unlinkSync(`${this.path}${suffix}`)
      if (fs.existsSync(this.path)) { fs.renameSync(this.path, recoveryPath); movedOriginal = true }
      fs.renameSync(stagingPath, this.path)
      this.db = this.open(this.path)
      this.migrate()
      this.checkIntegrity()
      this.changeSequence++
    } catch (error) {
      try { this.db?.close() } catch { /* database may not have reopened */ }
      if (fs.existsSync(this.path)) fs.unlinkSync(this.path)
      for (const suffix of ['-wal', '-shm']) if (fs.existsSync(`${this.path}${suffix}`)) fs.unlinkSync(`${this.path}${suffix}`)
      if (movedOriginal && fs.existsSync(recoveryPath)) fs.renameSync(recoveryPath, this.path)
      this.db = this.open(this.path)
      this.migrate()
      throw error
    } finally {
      if (fs.existsSync(stagingPath)) fs.unlinkSync(stagingPath)
      for (const suffix of ['-wal', '-shm']) if (fs.existsSync(`${stagingPath}${suffix}`)) fs.unlinkSync(`${stagingPath}${suffix}`)
      if (fs.existsSync(recoveryPath)) fs.unlinkSync(recoveryPath)
    }
  }
  close() { this.db.pragma('wal_checkpoint(TRUNCATE)'); this.db.close() }
}
