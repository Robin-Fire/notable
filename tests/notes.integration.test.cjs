const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { after, test } = require('node:test')
const { JSDOM } = require('jsdom')
const { buildSync } = require('esbuild')

const root = path.resolve(__dirname, '..')
const generated = path.join(__dirname, '.generated', 'notes')
fs.mkdirSync(generated, { recursive: true })
buildSync({ absWorkingDir: root, entryPoints: ['src/renderer/notes/NotesApp.tsx'], outfile: path.join(generated, 'NotesApp.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', loader: { '.css': 'empty' } })
buildSync({ absWorkingDir: root, entryPoints: ['src/renderer/browserPreview.ts'], outfile: path.join(generated, 'browserPreview.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external' })

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
global.window = dom.window
global.document = dom.window.document
global.HTMLElement = dom.window.HTMLElement
global.Event = dom.window.Event
global.KeyboardEvent = dom.window.KeyboardEvent
global.MouseEvent = dom.window.MouseEvent
global.localStorage = dom.window.localStorage
global.IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(global, 'navigator', { configurable: true, value: dom.window.navigator })
const { render, screen, within, fireEvent, waitFor, act } = require('@testing-library/react')
const React = require('react')
const { NotesApp } = require(path.join(generated, 'NotesApp.cjs'))

const noteId = '11111111-1111-4111-8111-111111111111'
const captureId = '22222222-2222-4222-8222-222222222222'
const makeNote = (id, body, kind, categoryId = null) => ({ id, body, meetingId: null, createdAt: 1_800_000_000_000, updatedAt: 1_800_000_000_000, deletedAt: null, revision: 1, meetingTitle: null, kind, processedAt: null, categoryId, tags: [], images: [] })

function setup({ taxonomy } = {}) {
  localStorage.clear()
  let viewListener = () => {}
  const get = async (id) => ({ ok: true, value: id === captureId ? makeNote(captureId, 'Captured thought', 'inbox') : makeNote(noteId, 'Existing note', 'note') })
  const api = {
    updates: { getStatus: async () => ({ ok: true, value: { status: 'idle' } }), check: async () => ({ ok: true, value: undefined }), install: async () => ({ ok: true, value: undefined }), onChanged: () => () => {} },
    notes: {
      list: async () => ({ ok: true, value: { items: [makeNote(noteId, 'Existing note', 'note')], nextCursor: null, total: 1 } }),
      tags: async () => ({ ok: true, value: ['Work', 'Personal'] }), taxonomy: taxonomy ?? (async () => ({ ok: true, value: { categories: [], tags: [{ id: '33333333-3333-4333-8333-333333333333', name: 'Work', categoryId: null, color: '#85858e', count: 1 }, { id: '44444444-4444-4444-8444-444444444444', name: 'Personal', categoryId: null, color: '#85858e', count: 1 }] } })), image: async () => ({ ok: false, message: 'Missing image' }),
      get, update: async (input) => ({ ok: true, value: { ...makeNote(noteId, input.body, 'note'), revision: 2 } }),
      updateItem: async () => ({ ok: true, value: makeNote(noteId, 'Existing note', 'note') }), setCategory: async () => ({ ok: true, value: undefined }), setTags: async () => ({ ok: true, value: undefined }),
      trash: async () => ({ ok: true, value: undefined }), restore: async () => ({ ok: true, value: undefined }),
      deletePermanently: async () => ({ ok: true, value: undefined }), emptyTrash: async () => ({ ok: true, value: undefined }),
      copy: async () => ({ ok: true, value: 'copied' }), onChanged: () => () => {},
    },
    planner: {
      inbox: async () => ({ ok: true, value: { items: [makeNote(captureId, 'Captured thought', 'inbox')], nextCursor: null, total: 1 } }),
      inboxCount: async () => ({ ok: true, value: 1 }), unfile: async () => ({ ok: true, value: undefined }),
      classify: async () => ({ ok: true, value: undefined }), backlog: async () => ({ ok: true, value: { items: [], nextCursor: null, total: 0 } }), reorderBacklog: async () => ({ ok: true, value: undefined }), setReady: async () => ({ ok: true, value: undefined }), tasks: async () => ({ ok: true, value: { tasks: [], events: [], tags: [] } }),
      move: async () => ({ ok: true, value: undefined }),
      createEvent: async () => ({ ok: true, value: undefined }), updateEvent: async () => ({ ok: true, value: undefined }), deleteEvent: async () => ({ ok: true, value: undefined }), undoDeleteEvent: async () => ({ ok: true, value: undefined }), onChanged: () => () => {},
    },
    settings: {
      get: async () => ({ ok: true, value: { shortcut: 'Control+N', shortcutEnabled: true, shortcutRegistered: true, launchAtLogin: false, theme: 'light', monitor: 'active', captureProtection: false, protectionTestApp: '', protectionTestDate: '', protectionTestOS: '', lastBackupAt: null, backupWarning: false, firstRunComplete: true, closeToTray: true } }),
      displays: async () => ({ ok: true, value: [] }), update: async () => ({ ok: true, value: {} }), onChanged: () => () => {}, openFolder: async () => ({ ok: true, value: undefined }),
    },
    data: { export: async () => ({ ok: true, value: undefined }), backup: async () => ({ ok: true, value: undefined }), restore: async () => ({ ok: true, value: undefined }), diagnostics: async () => ({ ok: true, value: undefined }) },
    windows: { openCapture() {}, openNotes() {}, openSettings() {}, quit() {}, ready() {}, onView(callback) { viewListener = callback; return () => {} } },
  }
  window.notiert = api
  const view = render(React.createElement(NotesApp))
  return { ...view, api, changeView: (next) => act(() => viewListener(next)) }
}

after(() => {
  dom.window.close()
  fs.rmSync(generated, { recursive: true, force: true })
})

test('browser preview capture enters Inbox and a filed task moves through Backlog and Ready', async () => {
  localStorage.clear()
  require(path.join(generated, 'browserPreview.cjs'))
  let opened = false
  const onOpen = () => { opened = true }
  window.addEventListener('notiert:browser-capture', onOpen)
  window.notiert.windows.openCapture()
  assert.equal(opened, true)
  window.removeEventListener('notiert:browser-capture', onOpen)
  const id = '66666666-6666-4666-8666-666666666666'
  await window.notiert.capture.submit({ requestId: id, generation: 0, body: 'New browser task' })
  const inbox = await window.notiert.planner.inbox()
  const created = inbox.value.items.find((item) => item.body === 'New browser task')
  assert.ok(created)
  await window.notiert.planner.classify({ id: created.id, kind: 'task', tags: ['Planning'] })
  const backlog = await window.notiert.planner.backlog({})
  assert.ok(backlog.value.items.some((task) => task.id === created.id))
  const tasks = await window.notiert.planner.tasks('2026-09-26', '2026-09-28')
  assert.ok(!tasks.value.tasks.some((task) => task.id === created.id))
  await window.notiert.planner.setReady({ id: created.id })
  const ready = await window.notiert.planner.tasks('2026-09-26', '2026-09-28')
  assert.ok(ready.value.tasks.some((task) => task.id === created.id && task.plannedDate === null))
  const app = render(React.createElement(NotesApp))
  try {
    fireEvent.click(await screen.findByRole('button', { name: 'Plan' }))
    await screen.findByRole('heading', { name: 'Plan' })
    await act(async () => { await window.notiert.planner.move({ id: created.id, plannedDate: '2026-09-27', beforeEventId: null, beforeId: null }) })
    assert.ok(screen.getByRole('heading', { name: 'Plan' }))
  } finally { app.unmount() }
})

test('sidebar Capture opens the browser preview editor and saves to Inbox', async () => {
  const app = setup()
  let submitted
  app.api.capture = { submit: async (input) => { submitted = input; return { ok: true, value: { id: captureId } } } }
  app.api.windows.openCapture = () => window.dispatchEvent(new window.Event('notiert:browser-capture'))
  try {
    fireEvent.click(within(document.querySelector('.sidebar')).getByRole('button', { name: /Capture/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Capture text' }), { target: { value: 'New thought' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save to Inbox' }))
    await waitFor(() => assert.equal(submitted.body, 'New thought'))
    await screen.findByRole('heading', { name: /Inbox/ })
  } finally { app.unmount() }
})

test('Backlog groups tasks by category and sends a task to Ready', async () => {
  const app = setup()
  const projectId = '77777777-7777-4777-8777-777777777777'
  const backlogTask = { ...makeNote(noteId, 'Prepare review', 'task', projectId), plannedDate: null, beforeEventId: null, position: 0, priorityPosition: 0, ready: false }
  let readyInput
  app.api.planner.backlog = async () => ({ ok: true, value: { items: [backlogTask], nextCursor: null, total: 1, tagNames: ['Planning', 'Other category tag'] } })
  app.api.planner.setReady = async (input) => { readyInput = input; return { ok: true, value: undefined } }
  app.api.notes.taxonomy = async () => ({ ok: true, value: { categories: [{ id: projectId, name: 'Client A' }, { id: '99999999-9999-4999-8999-999999999999', name: 'Client B' }], tags: [{ id: '88888888-8888-4888-8888-888888888888', name: 'Planning', categoryId: projectId, color: '#85858e', count: 1 }] } })
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Backlog' }))
    await screen.findByRole('button', { name: /Client A/ })
    const categoryGroup = within(screen.getByRole('region', { name: 'Client A backlog' }))
    assert.equal((await categoryGroup.findByRole('button', { name: 'Planning', pressed: true })).getAttribute('aria-pressed'), 'true')
    assert.equal(categoryGroup.getByRole('button', { name: 'No tag', pressed: true }).getAttribute('aria-pressed'), 'true')
    assert.equal(categoryGroup.getByRole('button', { name: 'Other category tag', pressed: true }).getAttribute('aria-pressed'), 'true')
    fireEvent.click(categoryGroup.getByRole('button', { name: 'Planning', pressed: true }))
    fireEvent.click(await categoryGroup.findByRole('button', { name: 'Select all' }))
    assert.equal(categoryGroup.getByRole('button', { name: 'Planning', pressed: true }).getAttribute('aria-pressed'), 'true')
    fireEvent.click(await categoryGroup.findByRole('button', { name: 'Add to Ready' }))
    await waitFor(() => assert.deepEqual(readyInput, { id: noteId }))
  } finally { app.unmount() }
})

test('browser capture saves the chosen category to Inbox', async () => {
  localStorage.clear()
  delete require.cache[require.resolve(path.join(generated, 'browserPreview.cjs'))]
  require(path.join(generated, 'browserPreview.cjs'))
  const app = render(React.createElement(NotesApp))
  try {
    act(() => window.notiert.windows.openCapture())
    const category = await screen.findByRole('combobox', { name: 'Capture category' })
    fireEvent.change(category, { target: { value: '11111111-1111-4111-8111-111111111111' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Capture text' }), { target: { value: 'Categorized browser capture' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save to Inbox' }))
    await screen.findByRole('heading', { name: /Inbox/ })
    const inbox = await window.notiert.planner.inbox()
    assert.equal(inbox.value.items.find((item) => item.body === 'Categorized browser capture').categoryId, '11111111-1111-4111-8111-111111111111')
  } finally { app.unmount() }
})

test('Inbox offers category tags as one-click choices and files the selected category', async () => {
  const categoryId = '77777777-7777-4777-8777-777777777777'
  const app = setup({ taxonomy: async () => ({ ok: true, value: { categories: [{ id: categoryId, name: 'Client A' }], tags: [{ id: '88888888-8888-4888-8888-888888888888', name: 'Planning', categoryId, color: '#85858e', count: 1 }] } }) })
  let classified
  app.api.planner.classify = async (input) => { classified = input; return { ok: true, value: undefined } }
  try {
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name: /^Inbox/ }))
    const categorySelect = await screen.findByRole('combobox', { name: 'Category for item' })
    fireEvent.change(categorySelect, { target: { value: categoryId } })
    assert.equal(screen.getByRole('button', { name: 'Edit tags' }).getAttribute('aria-expanded'), 'true')
    fireEvent.click(await screen.findByRole('button', { name: 'Planning', pressed: false }))
    fireEvent.click(screen.getByRole('button', { name: 'To-do' }))
    await waitFor(() => assert.deepEqual(classified, { id: captureId, kind: 'task', tags: ['Planning'], categoryId }))
  } finally { app.unmount() }
})

test('category view includes an untagged item under No tag', async () => {
  const categoryId = '77777777-7777-4777-8777-777777777777'
  const app = setup({ taxonomy: async () => ({ ok: true, value: { categories: [{ id: categoryId, name: 'Client A' }], tags: [] } }) })
  app.api.notes.list = async (filter) => ({ ok: true, value: { items: filter.categoryId === categoryId ? [makeNote(noteId, 'Untagged reference', 'note', categoryId)] : [], nextCursor: null, total: filter.categoryId === categoryId ? 1 : 0 } })
  try {
    fireEvent.click(await screen.findByRole('button', { name: 'Client A' }))
    await screen.findByRole('button', { name: 'Open note Untagged reference' })
    assert.ok(screen.getByText('No tag'))
    assert.ok(screen.getByRole('heading', { name: /Client A/ }))
  } finally { app.unmount() }
})

test('opening an Inbox capture keeps its detail editor selected while the note list changes', async () => {
  const app = setup()
  try {
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name: /^Inbox/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open and edit this captured item' }))
    await waitFor(() => assert.ok(screen.getByRole('region', { name: 'Note details' })))
    assert.match(screen.getByRole('region', { name: 'Note details' }).textContent, /Captured thought/)
  } finally { app.unmount() }
})

test('dirty edits offer Stay, Discard, and Save before sidebar navigation', async () => {
  const app = setup()
  try {
    fireEvent.click(await screen.findByRole('button', { name: /Open note Existing note/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit item' }))
    const editor = screen.getByRole('textbox', { name: 'Edit item' })
    fireEvent.change(editor, { target: { value: 'Unsaved wording' } })
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name: /^Inbox/ }))
    const prompt = await screen.findByRole('dialog', { name: 'Unsaved changes' })
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
    assert.ok(screen.getByRole('textbox', { name: 'Edit item' }))
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name: /^Inbox/ }))
    await screen.findByRole('dialog', { name: 'Unsaved changes' })
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => assert.ok(screen.getByRole('heading', { name: /Inbox/ })))
    assert.equal(prompt.isConnected, false)
  } finally { app.unmount() }
})

test('global note shortcuts do not intercept Enter in Inbox or Calenban controls', async () => {
  const app = setup()
  const getCalls = []
  const originalGet = app.api.notes.get
  app.api.notes.get = async (id) => { getCalls.push(id); return originalGet(id) }
  try {
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name: /^Inbox/ }))
    const fileButton = await screen.findByRole('button', { name: 'To-do' })
    fireEvent.keyDown(fileButton, { key: 'Enter' })
    assert.deepEqual(getCalls, [])

    app.changeView('calenban')
    const addMeeting = await screen.findByRole('button', { name: 'Add meeting' })
    fireEvent.keyDown(addMeeting, { key: 'Enter' })
    assert.deepEqual(getCalls, [])
  } finally { app.unmount() }
})

test('Calenban switches between day, three-day, and full-week columns', async () => {
  const app = setup()
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))
    await screen.findByRole('button', { name: 'Week' })
    assert.equal(document.querySelectorAll('.reui-kanban-column').length, 3)
    fireEvent.click(screen.getByRole('button', { name: 'Week' }))
    await waitFor(() => assert.equal(document.querySelectorAll('.reui-kanban-column').length, 7))
    fireEvent.click(screen.getByRole('button', { name: 'Day', exact: true }))
    await waitFor(() => assert.equal(document.querySelectorAll('.reui-kanban-column').length, 1))
  } finally { app.unmount() }
})

test('Inbox keeps a tag draft when leaving and returning', async () => {
  const app = setup()
  try {
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name: /^Inbox/ }))
    const trigger = await screen.findByRole('button', { name: 'Edit tags' })
    assert.equal(screen.queryByRole('combobox', { name: 'Add a tag' }), null)
    fireEvent.click(trigger)
    const input = await screen.findByRole('combobox', { name: 'Add a tag' })
    fireEvent.change(input, { target: { value: 'Needs review' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    assert.equal(screen.queryByRole('combobox', { name: 'Add a tag' }), null)
    assert.equal(document.activeElement, trigger)
    fireEvent.click(screen.getByRole('button', { name: /All items/ }))
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name: /^Inbox/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit tags' }))
    assert.equal((await screen.findByRole('combobox', { name: 'Add a tag' })).value, 'Needs review')
  } finally { app.unmount() }
})

test('note editing saves tags and pill filters combine selected types and tags', async () => {
  const app = setup()
  let saved
  const filters = []
  app.api.notes.updateItem = async (input) => { saved = input; return { ok: true, value: { ...makeNote(noteId, input.body, 'note'), tags: input.tags, revision: 2 } } }
  app.api.notes.list = async (filter) => { filters.push(filter); return { ok: true, value: { items: [makeNote(noteId, 'Existing note', 'note')], nextCursor: null, total: 1 } } }
  try {
    fireEvent.click(await screen.findByRole('button', { name: 'Filters' }))
    const work = await screen.findByRole('button', { name: 'Work', pressed: false })
    fireEvent.click(work)
    fireEvent.click(screen.getByRole('button', { name: 'Personal', pressed: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Notes', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'To-dos', exact: true }))
    await waitFor(() => assert.ok(filters.some((filter) => filter.tags?.includes('Work') && filter.tags?.includes('Personal') && filter.kinds?.includes('note') && filter.kinds?.includes('task'))))
    assert.equal(work.getAttribute('aria-pressed'), 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    await waitFor(() => assert.ok(filters.some((filter) => !filter.tags && !filter.kinds)))
    assert.equal(work.getAttribute('aria-pressed'), 'false')
    fireEvent.click(await screen.findByRole('button', { name: /Open note Existing note/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit item' }))
    const tagInput = screen.getByRole('combobox', { name: 'Add a tag' })
    fireEvent.change(tagInput, { target: { value: 'Work' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => assert.deepEqual(saved.tags, ['Work']))
  } finally { app.unmount() }
})

test('deleting a meeting offers Undo and restores the saved snapshot', async () => {
  const app = setup()
  const start = new Date(); start.setHours(10, 0, 0, 0)
  const event = { id: '33333333-3333-4333-8333-333333333333', title: 'Review', startAt: start.getTime(), endAt: start.getTime() + 30 * 60_000, allDay: false }
  const snapshot = { event, anchors: [] }
  let restored
  app.api.planner.tasks = async () => ({ ok: true, value: { tasks: [], events: [event], tags: [] } })
  app.api.planner.deleteEvent = async () => ({ ok: true, value: snapshot })
  app.api.planner.undoDeleteEvent = async (value) => { restored = value; return { ok: true, value: undefined } }
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove meeting' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => assert.deepEqual(restored, snapshot))
  } finally { app.unmount() }
})


test('meeting editor submits weekly recurrence and removed sidebar and calendar copy stays absent', async () => {
  const app = setup()
  let saved
  app.api.planner.createEvent = async (input) => { saved = input; return { ok: true, value: { id: noteId, ...input } } }
  try {
    assert.equal(screen.queryByText('Local by design'), null)
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))
    await screen.findByRole('heading', { name: 'Plan' })
    assert.equal(screen.queryByText(/Your calendar is clear/), null)
    assert.equal(screen.queryByText(/Outlook connection is not configured/), null)
    fireEvent.click(screen.getByRole('button', { name: 'Add meeting', exact: true }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Weekly review' } })
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-10-05T09:00' } })
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-10-05T10:00' } })
    fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'weekly' } })
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '2026-10-19' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save meeting' }))
    await waitFor(() => assert.deepEqual(saved.recurrence, { frequency: 'weekly', until: '2026-10-19' }))
    assert.equal(saved.title, 'Weekly review')
    await waitFor(() => assert.equal(screen.queryByRole('dialog', { name: 'Add a meeting' }), null))
  } finally { app.unmount() }
})
