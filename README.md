# notable

notable is a Windows desktop app for capturing a thought quickly and keeping it on the same device. It works offline and has no account, analytics, AI provider, or backend.

## Requirements

- Windows 11 x64 for supported builds
- Node.js 22 or newer and npm
- Visual Studio Build Tools are not required for the standard install; `better-sqlite3` installs its Electron compatible native binary through electron-builder

## Development

```powershell
npm install
npm run dev
```

Useful configured commands:

```powershell
npm run typecheck
npm run build
npm run dist:win
```

`npm run dist:win` creates a per-user NSIS installer in `release/`. The installer preserves the app data folder on upgrade and uninstall. Code signing is not configured; unsigned builds can show Windows trust warnings.

## Architecture

- Electron main process owns windows, tray, global shortcut, settings, clipboard actions, backup/export dialogs, and SQLite.
- Separate capture and notes preload scripts expose typed, narrow IPC APIs. Renderers have no Node integration or direct filesystem or SQL access.
- React and TypeScript render the two local windows. Geist fonts, CSS, icons, and app code are bundled with the app; production does not load remote code.
- SQLite is authoritative. `better-sqlite3` uses WAL mode, foreign keys, full synchronous writes, migrations, and an FTS5 index for body and legacy meeting-title search.

## Data and recovery

The database and settings live under Electron's per-user `userData` directory. On Windows this is normally `%APPDATA%\notable\`. Use **Settings → Data → Open folder** to see the actual location.

notable creates local SQLite backups after the first successful write each day, before migrations, and before restore. It keeps seven daily automatic backups and the pre-operation recovery backups. Automatic backups are on the same disk and do not protect against disk loss. Create a backup somewhere else or export notes for an independent copy.

V1 exports notes as plain text or Markdown. Restore accepts a notable SQLite backup and replaces current data after an integrity check and a fresh safety backup. JSON export and JSON restore are outside V1. Text and Markdown exports are portable but are not full-fidelity restore files.

Every capture first enters Inbox. Choose a category while capturing or while sorting in Inbox, then file the item as a reference note or a to-do. In Inbox, category tags are available as one-click choices. To-dos enter Backlog, grouped by category; drag them to set priority. The same priority appears in that category’s page and its tag pages. Choose tasks for Plan with Add to Ready, then drag them onto a day. Plan ordering is separate from Backlog priority. Use the task menu to delete a task; completed work can be moved to Trash. Each tag belongs to at most one category and has its own color. Scheduled meetings are entered locally in notable. Use Repeat in the meeting editor for daily, weekly, or monthly meetings through an inclusive end date, up to 366 occurrences. Each occurrence is edited or removed independently; monthly repeats skip months without the chosen day. Outlook sync is not configured. Existing note content and historical meeting labels are preserved, but the old start/end meeting-session workflow has been removed.

Paste screenshots or other PNG, JPEG, WebP, or GIF images into the capture bar. A capture can contain text, images, or both (up to five images, 5 MB each, 20 MB total). Pasted images remain in the local draft until saved or removed, and stay attached when the Inbox item is filed as a note or to-do. SQLite backups include the images; text and Markdown exports embed them as data URLs, which can make exports large.

**All items** includes Inbox captures, reference notes, and to-dos. Its type and tag pills allow multiple selections; selected values within a group match any, and the type and tag groups combine. Category pages include every directly assigned item, including items under **No tag**. Backlog tag pills start selected, including **No tag**; deselect pills to narrow the category’s to-dos.

Notes are ordinary local files and are not encrypted by notable. Offline operation and capture exclusion do not mean encryption at rest. Protect the Windows account and disk. Do not sync the live SQLite database through a shared folder.

## Privacy and screen sharing

notable requests Windows capture exclusion for its windows before showing them. Capture exclusion is best effort: Windows, meeting apps, browser sharing modes, and recording tools can behave differently. It does not guarantee that notes are invisible. Test from another participant or device after changing the app, capture mode, or Windows build. File pickers are native Windows windows and may be visible.

The application stores note text and pasted images in SQLite and the active capture renderer. It does not put note contents in logs, notifications, or tray menus. Redacted diagnostics include app and OS versions, shortcut status, and database availability.

## Keyboard behavior

- `Ctrl+N` opens capture by default; `Ctrl+Alt+N` is offered on first run. The shortcut can be changed or disabled in Settings.
- `Enter` saves in capture; `Shift+Enter` inserts a newline; `Esc` saves the draft and closes capture.
- `Ctrl+F` focuses note search; `Ctrl+S` saves edits; arrow keys navigate note rows; `Delete` moves selected notes to Trash outside text inputs.

The global shortcut can be unavailable if another application owns it. notable reports that state and retains tray capture. It does not silently select a different shortcut.

## Release checks still requiring a real Windows session

Before distributing a release, record the Windows build and test shortcut registration, focus return, mixed DPI and monitor removal, elevated/full-screen foreground apps, IME and German keyboard layouts, the packaged installer and upgrade, and capture exclusion in Teams desktop, Teams browser where relevant, Zoom, and a recording path. Confirm screen-share output using a second participant/device. A successful build alone does not verify those Windows behaviors.

See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and [resources/licenses](resources/licenses/) for font and dependency license references.

