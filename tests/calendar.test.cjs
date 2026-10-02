const legacyTaxonomy = require('./helpers/taxonomy-fixture.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { after, test } = require('node:test')
const { buildSync } = require('esbuild')
const root = path.resolve(__dirname, '..')
const generated = path.join(__dirname, '.generated', 'calendar')
fs.mkdirSync(generated, { recursive: true })
for (const [name, entry] of Object.entries({ database: 'src/main/storage/database.ts', contracts: 'src/shared/contracts.ts', adapter: 'src/renderer/calenban/calendarAdapter.ts', dates: 'src/shared/plannerDates.ts' })) {
  buildSync({ absWorkingDir: root, entryPoints: [entry], outfile: path.join(generated, `${name}.cjs`), bundle: true, platform: 'node', format: 'cjs', packages: 'external' })
}
const { Store } = require(path.join(generated, 'database.cjs'))
const { CalendarHoursSchema, SettingsPatchSchema } = require(path.join(generated, 'contracts.cjs'))
const { taskItem } = require(path.join(generated, 'adapter.cjs'))
const { localDateBounds } = require(path.join(generated, 'dates.cjs'))
after(() => fs.rmSync(generated, { recursive: true, force: true }))
function fixture() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'notiert-calendar-test-'))
  const file = path.join(folder, 'notes.sqlite')
  const store = new Store(file)
  return { store, file, folder, cleanup() { if (store.db.open) store.close(); fs.rmSync(folder, { recursive: true, force: true }) } }
}
const at = (day, time) => new Date(`${day}T${time}`).getTime()
const timed = (day = '2026-10-01', start = '09:00', end = '09:30') => ({ kind: 'timed', startAt: at(day, start), endAt: at(day, end) })

test('timed task creation indexes content and scheduling survives reopening with metadata intact', () => {
  const f = fixture()
  let reopened
  try {
    const category = f.store.createCategory('Calendar work')
    const task = f.store.createPlannerTask({ body: 'Prepare review\nFull details', categoryId: category.id, tags: ['Planning'], placement: timed() })
    assert.equal(task.plannedDate, '2026-10-01')
    assert.equal(task.plannedStartAt, at('2026-10-01', '09:00'))
    assert.equal(task.ready, true)
    assert.ok(f.store.listNotes({ query: 'Prepare', scope: 'notes', sort: 'newest', includeCompleted: false, limit: 50 }).items.some((item) => item.id === task.id))
    const moved = f.store.schedulePlannerTask({ id: task.id, expectedRevision: task.revision, placement: timed('2026-10-02', '10:15', '11:45') })
    f.store.close()
    reopened = new Store(f.file)
    const saved = reopened.listPlanner('2026-10-02', '2026-10-02').tasks.find((item) => item.id === task.id)
    assert.equal(saved.plannedStartAt, moved.plannedStartAt)
    assert.equal(saved.plannedEndAt, moved.plannedEndAt)
    assert.equal(saved.body, task.body)
    assert.equal(saved.categoryId, category.id)
    assert.deepEqual(saved.tags, ['Planning'])
    assert.equal(saved.priorityPosition, task.priorityPosition)
  } finally { reopened?.close(); f.cleanup() }
})

test('scheduling rejects stale, partial, reversed, invalid-date, completed, and missing tasks atomically', () => {
  const f = fixture()
  try {
    const task = f.store.createPlannerTask({ body: 'Review', placement: timed() })
    assert.throws(() => f.store.schedulePlannerTask({ id: task.id, expectedRevision: task.revision - 1, placement: timed() }), /changed/)
    assert.throws(() => f.store.schedulePlannerTask({ id: task.id, expectedRevision: task.revision, placement: { kind: 'timed', startAt: task.plannedStartAt } }))
    assert.throws(() => f.store.schedulePlannerTask({ id: task.id, expectedRevision: task.revision, placement: timed('2026-10-01', '11:00', '10:00') }))
    assert.throws(() => f.store.schedulePlannerTask({ id: task.id, expectedRevision: task.revision, placement: { kind: 'date', date: '2026-02-31' } }), /valid task date/)
    assert.throws(() => f.store.db.prepare('UPDATE notes SET planned_end_at=NULL WHERE id=?').run(task.id), /Invalid task time range/)
    assert.equal(f.store.listPlanner('2026-10-01', '2026-10-01').tasks[0].revision, task.revision)
    f.store.setTaskCompleted(task.id, true)
    assert.throws(() => f.store.schedulePlannerTask({ id: task.id, expectedRevision: task.revision + 1, placement: timed() }), /Reopen/)
    f.store.trash([task.id])
    assert.throws(() => f.store.schedulePlannerTask({ id: task.id, expectedRevision: task.revision + 2, placement: timed() }), /no longer exists/)
  } finally { f.cleanup() }
})

test('date-only, Ready, and Backlog transitions clear timing and legacy anchors', () => {
  const f = fixture()
  try {
    let task = f.store.createPlannerTask({ body: 'Review', placement: timed() })
    task = f.store.schedulePlannerTask({ id: task.id, expectedRevision: task.revision, placement: { kind: 'date', date: '2026-10-02' } })
    assert.equal(task.plannedStartAt, null); assert.equal(task.plannedEndAt, null)
    task = f.store.schedulePlannerTask({ id: task.id, expectedRevision: task.revision, placement: { kind: 'ready' } })
    assert.equal(task.plannedDate, null); assert.equal(task.ready, true)
    task = f.store.schedulePlannerTask({ id: task.id, expectedRevision: task.revision, placement: { kind: 'backlog' } })
    assert.equal(task.ready, false)
    assert.ok(f.store.listBacklog({}).items.some((item) => item.id === task.id))
    const meeting = f.store.savePlannerEvent({ title: 'Review', ...timed(), allDay: false })
    f.store.movePlannerTask(task.id, '2026-10-01', meeting.id, null)
    task = f.store.listPlanner('2026-10-01', '2026-10-01').tasks.find((item) => item.id === task.id)
    task = f.store.schedulePlannerTask({ id: task.id, expectedRevision: task.revision, placement: timed() })
    assert.equal(task.beforeEventId, null)
  } finally { f.cleanup() }
})

test('category task creation and Later round trips preserve Backlog placement and priority', () => {
  const f = fixture()
  try {
    const category = f.store.createCategory('Work')
    const first = f.store.createPlannerTask({ body: 'Existing task', categoryId: category.id, placement: { kind: 'backlog' } })
    let task = f.store.createPlannerTask({ body: 'New at the top', categoryId: category.id, tags: ['Planning'], placement: { kind: 'backlog-top' } })
    assert.equal(task.ready, false)
    assert.deepEqual(f.store.listBacklog({ categoryId: category.id }).items.map((item) => item.id), [task.id, first.id])
    task = f.store.schedulePlannerTask({ id: task.id, expectedRevision: task.revision, placement: { kind: 'later' } })
    assert.equal(task.ready, false)
    assert.equal(task.later, true)
    assert.deepEqual(f.store.listBacklog({ categoryId: category.id }).items.map((item) => item.id), [first.id])
    assert.deepEqual(f.store.listBacklog({ categoryId: category.id, later: true }).items.map((item) => item.id), [task.id])
    assert.equal(f.store.listPlanner('2026-10-01', '2026-10-03').tasks.length, 0)
    task = f.store.schedulePlannerTask({ id: task.id, expectedRevision: task.revision, placement: { kind: 'backlog-top' } })
    assert.equal(task.later, false)
    assert.equal(task.ready, false)
    assert.deepEqual(task.tags, ['Planning'])
    assert.equal(f.store.listBacklog({ categoryId: category.id }).items[0].id, task.id)
    assert.equal(f.store.listBacklog({ categoryId: category.id, later: true }).total, 0)
  } finally { f.cleanup() }
})

test('legacy placement APIs, reopen, and unfile clear task timestamps; completion retains them', () => {
  const f = fixture()
  try {
    let task = f.store.createPlannerTask({ body: 'Review', placement: timed() })
    f.store.setTaskCompleted(task.id, true)
    assert.equal(f.store.listPlanner('2026-10-01', '2026-10-01').tasks[0].plannedStartAt, task.plannedStartAt)
    f.store.setTaskCompleted(task.id, false)
    task = f.store.listBacklog({}).items[0]
    assert.equal(task.plannedStartAt, null)
    task = f.store.schedulePlannerTask({ id: task.id, expectedRevision: task.revision, placement: timed() })
    f.store.setTaskReady(task.id)
    task = f.store.listPlanner('2026-10-01', '2026-10-01').tasks[0]
    assert.equal(task.plannedStartAt, null)
    task = f.store.schedulePlannerTask({ id: task.id, expectedRevision: task.revision, placement: timed() })
    f.store.movePlannerTask(task.id, '2026-10-02', null, null)
    task = f.store.listPlanner('2026-10-02', '2026-10-02').tasks[0]
    assert.equal(task.plannedStartAt, null)
    task = f.store.schedulePlannerTask({ id: task.id, expectedRevision: task.revision, placement: timed() })
    f.store.unfilePlannerTask(task.id)
    assert.equal(f.store.db.prepare('SELECT planned_start_at FROM notes WHERE id=?').get(task.id).planned_start_at, null)
  } finally { f.cleanup() }
})

test('timed interval queries include overnight tasks and respect exclusive ends for completed tasks', () => {
  const f = fixture()
  try {
    const task = f.store.createPlannerTask({ body: 'Overnight', placement: { kind: 'timed', startAt: at('2026-10-01', '23:30'), endAt: at('2026-10-02', '00:30') } })
    f.store.setTaskCompleted(task.id, true)
    assert.equal(f.store.listPlanner('2026-10-02', '2026-10-02').tasks.length, 1)
    assert.equal(f.store.listPlanner('2026-10-03', '2026-10-03').tasks.length, 0)
    const boundary = f.store.createPlannerTask({ body: 'Midnight end', placement: { kind: 'timed', startAt: at('2026-10-01', '23:30'), endAt: at('2026-10-02', '00:00') } })
    f.store.setTaskCompleted(boundary.id, true)
    assert.ok(!f.store.listPlanner('2026-10-02', '2026-10-02').tasks.some((item) => item.id === boundary.id))
  } finally { f.cleanup() }
})

test('meeting timing updates retain title, reject stale intervals, and never recreate a deleted record', () => {
  const f = fixture()
  try {
    const event = f.store.savePlannerEvent({ title: 'Original', ...timed(), allDay: false })
    f.store.updatePlannerEvent({ ...event, title: 'Renamed' })
    const input = { id: event.id, ...timed('2026-10-02'), allDay: false, expectedStartAt: event.startAt, expectedEndAt: event.endAt, expectedAllDay: false }
    const changed = f.store.updatePlannerEventTiming(input)
    assert.equal(changed.title, 'Renamed')
    assert.throws(() => f.store.updatePlannerEventTiming(input), /changed/)
    f.store.deletePlannerEvent(event.id)
    assert.throws(() => f.store.updatePlannerEventTiming({ ...input, expectedStartAt: changed.startAt, expectedEndAt: changed.endAt }), /no longer exists/)
  } finally { f.cleanup() }
})

test('version 9 migrates without inventing task times and backups validate after migration', async () => {
  const f = fixture()
  let migrated
  try {
    const task = f.store.createPlannerTask({ body: 'Legacy dated task', placement: { kind: 'date', date: '2026-10-01' } })
    const event = f.store.savePlannerEvent({ title: 'Review', ...timed(), allDay: false })
    f.store.movePlannerTask(task.id, '2026-10-01', event.id, null)
    legacyTaxonomy(f.store)
    f.store.db.exec('DROP TRIGGER notes_timing_insert; DROP TRIGGER notes_timing_update; DROP INDEX notes_timed_plan; DROP INDEX notes_later; DROP INDEX item_tags_order; ALTER TABLE notes DROP COLUMN planned_start_at; ALTER TABLE notes DROP COLUMN planned_end_at; ALTER TABLE notes DROP COLUMN is_later; ALTER TABLE item_tags DROP COLUMN position; DELETE FROM schema_migrations WHERE version>=10;')
    f.store.close()
    migrated = new Store(f.file)
    const saved = migrated.listPlanner('2026-10-01', '2026-10-01').tasks[0]
    assert.equal(saved.plannedDate, '2026-10-01'); assert.equal(saved.beforeEventId, event.id)
    assert.equal(saved.plannedStartAt, null); assert.equal(saved.plannedEndAt, null)
    assert.equal(migrated.db.prepare('SELECT max(version) AS version FROM schema_migrations').get().version, 12)
    const backup = path.join(f.folder, 'backup.sqlite')
    await migrated.backupTo(backup)
    assert.equal(migrated.checkIntegrity(backup), undefined)
    assert.ok(fs.readdirSync(path.join(f.folder, 'backups')).some((name) => name.startsWith('pre-migration-')))
  } finally { migrated?.close(); f.cleanup() }
})

test('settings accept precise quarter-hour bounds and 24:00, but reject invalid ranges', () => {
  assert.deepEqual(SettingsPatchSchema.parse({ theme: 'dark' }), { theme: 'dark' })
  assert.equal(CalendarHoursSchema.safeParse({ calendarStartMinute: 495, calendarEndMinute: 1440 }).success, true)
  for (const value of [{ calendarStartMinute: 500, calendarEndMinute: 1080 }, { calendarStartMinute: 1080, calendarEndMinute: 480 }, { calendarStartMinute: 480, calendarEndMinute: 480 }]) assert.equal(CalendarHoursSchema.safeParse(value).success, false)
})

test('adapter uses separate IDs and preserves date-only and timed task semantics across DST', () => {
  const f = fixture()
  const original = process.env.TZ
  try {
    process.env.TZ = 'Europe/Berlin'
    const date = f.store.createPlannerTask({ body: 'Date only', placement: { kind: 'date', date: '2026-03-29' } })
    const item = taskItem(date)
    assert.equal(item.id, `task:${date.id}`); assert.equal(item.allDay, true)
    assert.equal(item.end - item.start, localDateBounds('2026-03-29').end - localDateBounds('2026-03-29').start)
    const task = f.store.createPlannerTask({ body: 'Timed', placement: timed('2026-03-29') })
    const mapped = taskItem(task)
    assert.equal(mapped.start.getTime(), task.plannedStartAt); assert.equal(mapped.resizable, true)
    f.store.setTaskCompleted(task.id, true)
    assert.equal(taskItem(f.store.listPlanner('2026-03-29', '2026-03-29').tasks.find((entry) => entry.id === task.id)).readOnly, true)
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; f.cleanup() }
})
