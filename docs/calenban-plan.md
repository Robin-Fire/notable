# Plan and Backlog

Status: implemented. This document describes the current task workflow and the deferred calendar-provider integration.

## Product decisions

- Every capture enters Inbox first. Each Inbox item is filed as either a reference note or a to-do.
- Categories can be assigned directly to Inbox captures, reference notes, and to-dos. Items without a category remain Unassigned.
- Tags are subareas. A tag belongs to one category at a time, or to no category. Assigning a tag to an item does not change the tag’s category.
- To-dos start in Backlog with a saved priority order per category. Backlog, category pages, and tag pages share that order. Users choose which tasks to promote to Ready in Plan; Plan ordering stays separate.
- Plan has a Ready tray and date columns. Tasks move between Plan slots only through drag and drop.
- Tasks do not have a completion checkbox. Delete finished work to Trash; restoring a deleted task puts it back in Backlog.
- Meetings are entered locally. Outlook sign-in, sync, and permissions are not configured.
- Historical meeting labels remain attached to notes for export and backup compatibility; the old active meeting-session workflow is removed.

## User workflow

1. Capture a thought from the floating capture window or global shortcut. Save puts it in Inbox.
2. Choose a category during capture or in Inbox. File the item as a note or to-do and select category tags with one click.
3. Reference notes and to-dos appear in All items. Category pages include tagged and untagged items; Backlog groups to-dos by category and lets users filter with tag pills.
4. Use Add to Ready on a Backlog task to put it in Plan’s Ready tray.
5. Drag tasks between Ready and date or meeting slots. Use the task menu to delete a task. Open a task to edit its text and tags, return it to Inbox, or move it to Trash.
6. Add meetings manually with a title, date, start/end time, or all-day setting. Edit or remove them from their compact calendar rows.

## Layout and interaction

Plan opens in a three-day view. The Ready tray is visible by default at every supported window size; its toggle shows the Ready count when the tray is hidden. Narrow layouts place Ready above the horizontally scrollable day columns.

Meeting rows remain compact regardless of event duration. They show a time range and truncated title; overlapping meetings keep their own times and receive an overlap label. Tasks show their first line, a short continuation when present, tags, and a drag handle. The vertical ellipsis menu contains task deletion. Task placement before a meeting is an ordering hint only and does not reserve a start time or duration.

The local Kanban composition in `src/renderer/components/reui/kanban.tsx` uses dnd-kit pointer and keyboard sensors, a drag overlay, and fixed event rows. Meeting rows are not sortable.

## Data and migration

The SQLite schema is version 8. Items use one direct category assignment. Active tasks have a category, a Ready flag, an optional planned date, a Plan slot order, a separate category priority rank, and an optional same-day meeting anchor. Tags are globally unique and each tag record has one category assignment; changing an item’s category does not move or recategorize its tags.

The v7 migration moves tasks previously marked complete into Trash and resets their task state. The v8 migration backfills unambiguous categories from legacy tag assignments and initializes category priority from the existing Backlog order. Restoring a task preserves its category and priority when available. A pre-migration SQLite backup is retained automatically. Text and Markdown exports include each task’s category and Backlog, Ready, or planned state. SQLite backups remain the full-fidelity recovery format.

Captures are created as Inbox items and do not attach to an active meeting. Notes and tasks retain their note IDs, revisions, body text, timestamps, and Trash behavior. V3 introduced the task and tag tables; V5 added categories and tag colors; V6 added the category and Ready fields. The old `meetings` table was renamed to `legacy_meeting_sessions`, preserving historical note associations and labels.

## Main implementation points

- `src/main/storage/database.ts`: schema migrations, category assignment, Inbox classification, tags and categories, priority-ordered paginated Backlog, task ordering, event CRUD, and backup compatibility.
- `src/shared/contracts.ts`, `src/preload/index.ts`, and `src/main/index.ts`: validated IPC surface for Inbox, Backlog, Plan, and export operations.
- `src/renderer/inbox/InboxView.tsx`: Inbox triage, text editing entry point, tags, and note/to-do filing.
- `src/renderer/backlog/BacklogView.tsx`: category grouping, tag-pill filters, server-side search, per-category pagination and reordering, and promotion to Ready.
- `src/renderer/calenban/CalenbanView.tsx`: Plan view, mixed meeting/task sequence, manual events, and drag-and-drop task movement.
- `src/renderer/components/reui/kanban.tsx`: Kanban primitives backed by dnd-kit.
- `src/renderer/notes/NotesApp.tsx` and `src/renderer/styles.css`: All items, category and tag pages, filters, priority reordering, and shared layout styling.

## Follow-up: Outlook calendar integration

Before implementation, verify whether the work/school tenant permits a public desktop OAuth client and read-only calendar access without a custom hosted service or unavailable organization approval. If it does, add a provider-neutral calendar service in main, OS-backed credential storage, calendar selection, a bounded read-only range, pagination, recurring-event handling, refresh/backoff, stale/offline status, disconnect behavior, and a manual local-event fallback. Do not request write access to the user’s calendar.

Provider events need stable occurrence IDs because task anchors refer to event occurrences rather than a recurring series. On disconnect, remove credentials and let the user choose whether cached provider events remain. Never include tokens in backups, exports, or diagnostics. Restoring local data must not restore an authenticated session.

## Acceptance checks

- Captured items remain in Inbox until classified, and to-dos appear in Backlog.
- Backlog search matches task text and tags across all pages; loading older tasks does not duplicate or omit rows.
- Category pages show items assigned directly to the category, including items with no tags.
- Backlog filters match any selected tag, avoid duplicate tasks with multiple tags, and include untagged tasks when **No tag** is selected.
- Reordering a to-do in Backlog or a category/tag page updates the same category priority order; Plan movement does not change it.
- Adding tasks to Ready appends them in order; dragging Ready tasks does not reorder Backlog tasks.
- The Ready tray is visible on first opening Plan, and its hidden toggle shows the count.
- Plan cards have a drag handle and a delete menu; moving tasks between Plan slots uses drag and drop.
- Older completed tasks move to Trash during migration and can be restored as Backlog tasks.
- Text/Markdown exports preserve task category and workflow state; SQLite backup and restore preserve all data.
- Removing or moving a meeting keeps anchored tasks on their planned date.
- Outlook is clearly shown as unconfigured while local meetings remain usable.
