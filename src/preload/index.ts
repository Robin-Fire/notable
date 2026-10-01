import { contextBridge, ipcRenderer } from 'electron'
import type { NotableApi } from '../shared/contracts'

const api: Omit<NotableApi, 'capture'> = {
  updates: {
    getStatus: () => ipcRenderer.invoke('updates:status'),
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.invoke('updates:install'),
    onChanged: (callback) => { const listener = (_event: Electron.IpcRendererEvent, status: Parameters<typeof callback>[0]) => callback(status); ipcRenderer.on('updates:changed', listener); return () => ipcRenderer.removeListener('updates:changed', listener) },
  },
  notes: {
    list: (filter) => ipcRenderer.invoke('notes:list', filter), tags: () => ipcRenderer.invoke('notes:tags'), taxonomy: () => ipcRenderer.invoke('notes:taxonomy'), createCategory: (name) => ipcRenderer.invoke('notes:category:create', name), createTag: (input) => ipcRenderer.invoke('notes:tag:create', input), updateTag: (input) => ipcRenderer.invoke('notes:tag:update', input), get: (id) => ipcRenderer.invoke('notes:get', id), image: (id) => ipcRenderer.invoke('notes:image', id),
    update: (input) => ipcRenderer.invoke('notes:update', input), updateItem: (input) => ipcRenderer.invoke('notes:update-item', input), setCategory: (input) => ipcRenderer.invoke('notes:set-category', input), trash: (ids) => ipcRenderer.invoke('notes:trash', ids),
    setTags: (input) => ipcRenderer.invoke('notes:set-tags', input),
    restore: (ids) => ipcRenderer.invoke('notes:restore', ids), deletePermanently: (ids) => ipcRenderer.invoke('notes:delete-permanently', ids),
    copy: (ids) => ipcRenderer.invoke('notes:copy', ids),
    emptyTrash: () => ipcRenderer.invoke('notes:empty-trash'),
    onChanged: (callback) => { const listener = (_event: Electron.IpcRendererEvent, seq: number) => callback(seq); ipcRenderer.on('notes:changed', listener); return () => ipcRenderer.removeListener('notes:changed', listener) },
  },
  planner: {
    inbox: (input) => ipcRenderer.invoke('planner:inbox', input ?? {}), inboxCount: () => ipcRenderer.invoke('planner:inbox-count'), unfile: (id) => ipcRenderer.invoke('planner:unfile', id), classify: (input) => ipcRenderer.invoke('planner:classify', input),
    tasks: (from, to) => ipcRenderer.invoke('planner:tasks', { from, to }), move: (input) => ipcRenderer.invoke('planner:move', input),
    backlog: (input) => ipcRenderer.invoke('planner:backlog', input ?? {}), setReady: (input) => ipcRenderer.invoke('planner:ready', input), reorderBacklog: (input) => ipcRenderer.invoke('planner:backlog-reorder', input),
    createEvent: (input) => ipcRenderer.invoke('planner:event:create', input), updateEvent: (input) => ipcRenderer.invoke('planner:event:update', input),
    deleteEvent: (id) => ipcRenderer.invoke('planner:event:delete', id), undoDeleteEvent: (snapshot) => ipcRenderer.invoke('planner:event:undo-delete', snapshot),
    onChanged: (callback) => { const listener = (_event: Electron.IpcRendererEvent, seq: number) => callback(seq); ipcRenderer.on('planner:changed', listener); return () => ipcRenderer.removeListener('planner:changed', listener) },
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'), update: (input) => ipcRenderer.invoke('settings:update', input),
    onChanged: (callback) => { const listener = () => callback(); ipcRenderer.on('settings:changed', listener); return () => ipcRenderer.removeListener('settings:changed', listener) },
    openFolder: () => ipcRenderer.invoke('settings:open-folder'),
    displays: () => ipcRenderer.invoke('settings:displays'),
  },
  data: {
    export: (input) => ipcRenderer.invoke('data:export', input), backup: () => ipcRenderer.invoke('data:backup'), restore: () => ipcRenderer.invoke('data:restore'), diagnostics: () => ipcRenderer.invoke('data:diagnostics'),
  },
  windows: {
    openCapture: () => ipcRenderer.send('windows:open-capture'), openNotes: () => ipcRenderer.send('windows:open-notes'),
    openSettings: () => ipcRenderer.send('windows:open-settings'), quit: () => ipcRenderer.send('app:quit'),
    ready: () => ipcRenderer.send('notes:ready'),
    onView: (callback) => { const listener = (_event: Electron.IpcRendererEvent, view: 'all' | 'inbox' | 'calenban' | 'trash' | 'settings') => callback(view); ipcRenderer.on('notes:view', listener); return () => ipcRenderer.removeListener('notes:view', listener) },
  },
}

contextBridge.exposeInMainWorld('notable', api)
