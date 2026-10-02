# Replace Calenban's board with a time-grid calendar

Prepared 1 October 2026. Implemented on the same date; see [calendar integration](reui-calendar-adapter.md) for the installed source, local adaptations, and validation commands. The sections below record the implementation plan and its proposed defaults.

## Objective

Replace the current planner Kanban board with a full calendar based on `@reui/c-event-calendar-3`. Support Day, 3 days, and Workweek views, configurable visible start/end times, and persistent movement and resizing of both meetings and tasks. Preserve existing capture, Inbox, Backlog, categories, tags, task details, completion, and meeting recurrence behavior.

Use the app's existing quiet visual style, bundled typography, and light/dark/system themes. The calendar should fill the available planner area with a sticky day header, time gutter, all-day/date-only strip, current-time indicator, and a collapsible Ready pane.

## Findings from the current app

- `src/renderer/calenban/CalenbanView.tsx` owns planner navigation, meeting actions, Ready tasks, and Past plan tasks. Current modes are Day, 3 days, and a seven-day Week; default is 3 days.
- `PlannerEvent` already stores `startAt`, `endAt`, and `allDay`. Meetings can be created/edited, but cannot currently be dragged or resized.
- `PlannerTask` stores `plannedDate`, `position`, and `beforeEventId`, without start/end timestamps. Current dragging changes dates or ordering around meetings.
- `src/main/storage/database.ts` persists tasks in `notes` and meetings in `planner_events`. Current schema version is 9. Backup validation also explicitly enumerates supported versions.
- `usePlannerData.ts` fetches the date range and listens for planner changes. Its request counter already protects against stale fetch completion.
- Recurring meetings are materialized as separate persisted meeting records. Individual occurrences are independently editable; there is no persisted series model.
- Settings are validated by Zod, stored in `settings.json`, and broadcast to renderers. New calendar fields must flow through the shared API types, main process, preview implementation, and settings UI.
- The project uses React, Electron, Tailwind 4, TypeScript, and npm's `package-lock.json`. Renderer aliases already support `@/`; there is no root `components.json` in the current checkout.
- The current Kanban component is a local adapter inspired by ReUI, not upstream ReUI source. The calendar integration should use the requested upstream source and document its provenance.

## Product behavior and defaults

These are proposed implementation defaults where the request leaves a choice open.

| Area | Behavior |
| --- | --- |
| Day | One local calendar date, including weekends. Previous/next advances one day. |
| 3 days | Three consecutive local dates, including weekends. Previous/next advances three dates. |
| Workweek | Monday–Friday of the anchor week. Previous/next advances seven dates. |
| Today | Day/3 days starts today; Workweek selects the current Monday–Friday range. On weekends, show a small notice with an action to open today in Day view. |
| Switching views | Keep the focused/anchor date; align Workweek to its Monday. Returning from Workweek should retain the focused date rather than always jumping to Monday. |
| Visible hours | Default 08:00–18:00, configurable in Settings → Calendar. Controls the displayed grid, without changing saved schedules. |
| Time controls | 24-hour inputs; 15-minute increments. End may be 24:00, represented as minute 1440. Same-day ranges only, with end strictly after start. |
| Scheduling | 15-minute snapping; 30-minute default duration for newly timed tasks and clicked meeting slots. Typed edits can retain minute precision. |
| Overlap | Allow overlapping meetings and tasks and render them side by side. No automatic movement or conflict rejection. |
| Untimed tasks | Dated tasks without timestamps appear in a date-only strip. Ready tasks without a date remain in the Ready pane. |
| Hidden items | Show an accessible summary for items outside visible hours; opening one allows editing or temporarily showing 00:00–24:00. Workweek provides a weekend-items notice and a Day-view action when relevant. |
| Completed tasks | Keep their scheduled placement visible with subdued styling. Disable scheduling gestures; reopening returns them to Backlog, matching current behavior. |

Do not infer task durations or automatically convert existing “before meeting” tasks into timed appointments. Scheduling a task explicitly gives it a time range and clears its legacy ordering anchor. Moving a meeting does not move tasks automatically.

## 1. Install and inspect the requested ReUI source

1. Create a minimal `components.json` aligned with the renderer aliases, existing Tailwind entry point, and the chosen ReUI UI variant.
2. Run the requested command during implementation:

   ```sh
   pnpm dlx shadcn@latest add @reui/c-event-calendar-3
   ```

3. Inspect the generated example, primitive modules, UI dependencies, CSS changes, and package changes before wiring them into the app. Record the installed source revision/version and attribution in a calendar integration note and `THIRD-PARTY-NOTICES.md` as applicable.
4. Keep npm as the repository's package manager and preserve one canonical lockfile. Using pnpm to invoke the CLI does not require migrating the whole project; reconcile dependency changes into `package-lock.json` and avoid retaining a second lockfile.
5. Replace example data and its local-only CRUD state with the app adapter. Keep useful dialog/calendar composition, while retaining the app's recurrence and task-detail features.
6. Map required shadcn theme tokens to the app's existing CSS variables. Scope calendar styling so global resets, colors, or radius changes do not alter capture and other screens.

The requested example is a create/edit dialog composition that initially demonstrates a month calendar. The app must configure its time-grid views explicitly. The documented primitive provides Day, Week, N-day, drag/resize, and hour-bound controls; verify the actual installed source before relying on its precise APIs.

**Integration checks before building interactions:** confirm fractional-hour bounds for settings such as 08:15, custom event content retains resize handles, controlled updates do not duplicate writes, all-day/date-only conversions work, and a supported path exists for external Ready-task dragging. If fractional bounds require a patch, localize it to the time-grid adapter and test coordinate calculations. Do not silently round settings to whole hours.

## 2. Add persisted task scheduling

Add nullable `planned_start_at` and `planned_end_at` integer columns to `notes` in migration 10. Expose them as `plannedStartAt` and `plannedEndAt` on `PlannerTask`.

Scheduling invariants:

- Untimed: both timestamps are null; `plannedDate` may be null or a valid date.
- Timed: both timestamps are valid supported instants, end is strictly after start, and `plannedDate` corresponds to the start date in the current planning timezone when saved.
- Explicit timing clears `beforeEventId`; content, tags, images, category, and Backlog priority are retained.
- Unscheduling clears date, timestamps, and anchor and puts the task in Ready. An explicit return-to-Backlog action also clears `ready`.
- Moving a timed task to the date-only strip clears its timestamps and preserves the chosen date. Moving it into the time grid assigns the default duration.
- A legacy date/order move must clear existing timestamps unless it is explicitly implemented as a timed move; prevent stale timing from surviving old API paths.
- Completed/trashed/non-task items cannot be scheduled through the task scheduling endpoint.

Use a dedicated `PlannerTaskScheduleSchema` and `planner.scheduleTask` mutation with a discriminated target: timed, date-only, Ready, or Backlog. Include `expectedRevision` and return the updated task. Keep any legacy `planner.move` endpoint only for remaining date-only/Ready ordering callers.

Implement validation, scheduling updates, readiness changes, revision increments, and legacy slot compaction in one SQLite transaction. Enforce paired timestamps and a positive range in the shared schema and storage boundary; add database constraints/triggers where feasible within the additive migration.

Audit every operation that removes or changes task placement: classify/unfile, setReady, completion/reopen, date-only moves, trash/restore, and category assignment. Completion retains timing; reopen/unfile clears timing. Trash/restore should preserve scheduling consistently with existing date preservation.

Update task row types, SQL projection, `taskFrom`, and range queries. Timed tasks use interval overlap (`start < rangeEnd && end > rangeStart`), including tasks starting before the visible range. Date-only tasks use saved dates. Preserve Ready and Past plan coverage; use the end instant for determining whether a timed task has elapsed, so an ongoing overnight task is not classified as overdue.

For timed tasks, derive rendered local dates from timestamps, as with meetings. For date-only tasks, retain date semantics. Do not use `plannedDate` as the sole query or display source for timed tasks after a Windows timezone change.

Update schema-version guards and backup integrity checks to accept version 10 while continuing to restore supported older backups through migration. Existing tasks receive null timestamps; existing dates, anchors, ordering, and meeting data remain intact.

## 3. Add calendar settings end to end

Add `calendarStartMinute` and `calendarEndMinute` to `Settings`, initially 480 and 1080. Store integer minutes to support precise boundaries without locale-dependent string parsing.

- Validate start in 0–1425 and end in 15–1440, both in 15-minute increments, with `start < end`.
- Add a Calendar section to `SettingsPanel` with labeled Start and End controls and an explicit Save action for the pair. This avoids persisting invalid intermediate combinations while editing.
- Validate the merged settings object in the main process, including partial updates. Use a dedicated patch schema if cross-field refinement makes `SettingsSchema.partial()` unsuitable.
- Add defaults when loading older settings. Normalize invalid new calendar fields independently so one malformed calendar preference does not reset unrelated existing settings.
- Update the shared settings update type, `saveSettings` signatures, preview defaults/persistence, and change broadcasts.
- Pass loaded settings from `NotesApp` to the planner, or use a focused hook sharing the existing settings event subscription.
- Apply changes immediately and retain the active date, view, and dialog state. Convert minutes into the exact installed component's supported bound representation.

Visible hours are display preferences. Meetings/tasks entered through dialogs may be outside them. Items crossing a boundary render a clipped segment with a continuation cue; the full saved interval remains available in the details UI. Dragging preserves full duration, and resizing adjusts the true endpoint rather than truncating to the displayed fragment.

## 4. Introduce a calendar adapter and view

Keep ReUI types and gesture details out of database code. Introduce:

- `src/shared/calendarSchedule.ts`: pure range, validation, and task scheduling helpers.
- `src/renderer/calenban/calendarAdapter.ts`: conversion between persisted records and ReUI calendar items.
- `src/renderer/calenban/CalendarView.tsx`: layout, toolbar, visible range, dialogs, and Ready/Past plan composition.
- `src/renderer/calenban/useCalendarMutations.ts`: pending changes, persistence, reconciliation, and errors.
- `src/renderer/calenban/CalendarItemContent.tsx`: meeting/task content within the primitive's interactive wrapper.

Namespace item IDs (`meeting:<id>` and `task:<id>`) and carry a typed domain payload. Meetings map their timestamps and all-day flag directly. Timed tasks map their new timestamps. Date-only tasks map to date-granular items marked as tasks, independently of all-day meetings. Ready tasks are not fake calendar events.

Use controlled calendar items and navigation. Configure Day, N-day with count 3, and Week starting Monday with weekends hidden only in Workweek. Ensure weekend hiding does not leak into Day/3 days. Fetch from the calendar's effective visible range, converting its exclusive end to the app's existing inclusive date API deliberately.

Render distinguishable meeting and task blocks: title, time range, type cue, and task completion action. Retain category/tag access in task details. Small blocks must still expose details through keyboard focus and accessible labels. Prevent checkbox/button interaction from starting a drag or opening an unrelated dialog.

Initially retain the internal `calenban` route to avoid breaking Electron window navigation. The visible navigation label can become Calendar. Remove board columns and dead Kanban-only rendering after the calendar is complete; do not remove drag libraries still used by Backlog or Ready ordering.

## 5. Create, drag, resize, and unschedule

**Meetings:** click an empty slot or drag-select a time range to open the meeting dialog with exact start/end prefilled. Add meeting from the toolbar defaults to the selected date and a 30-minute interval within visible bounds. Dragging preserves duration and can change date/time. Resize either endpoint. Existing recurrence creation continues materializing independent records; a drag/resize edits only the selected record and never resubmits recurrence.

Extend `EventDialog` to accept an initial interval and support multi-day all-day dates with an exclusive end. Its current all-day save logic forces a single-day interval; that would overwrite a multi-day range after resizing. Preserve existing delete/undo behavior and keyboard/focus handling.

**Tasks:** drag Ready or Past plan tasks onto a grid slot to schedule them; drag dated/timed tasks across dates and times; resize start/end once timed. Drag into the date-only strip to retain only the date, or back into Ready to remove placement. Add start/end and Schedule/Unschedule controls to task details as an accessible equivalent.

Support direct task creation from an empty slot through a Meeting/Task choice. Add a dedicated transactional `planner.createTask` mutation accepting content/category/tags plus placement; return a real persisted task. Reuse shared item-creation primitives and validation rather than driving the capture API with a fake request/generation, and do not create orphan meetings to represent tasks.

External Ready-task drag is a separate integration from dragging existing calendar items. Inspect the installed primitive's extension points first. If there is no supported external-drop API, build a narrow bridge that resolves day/slot from the grid's current geometry and scroll offset, handles snapping and auto-scroll, and invokes the same task mutation. Keep that bridge isolated and test it at different zoom/scroll positions. Do not nest competing drag contexts on the same gesture. Provide Schedule in task details regardless, while retaining external dragging as a required delivery item.

All-day/date-only bars move and resize by calendar dates. Timed items use minute snapping. Invalid/nonexistent local times must be handled consistently between renderer and main process; test both DST transitions and explain normalization in form errors when applicable. Keep exclusive-end and overnight/multi-day behavior consistent across display, drag, resize, and dialogs.

## 6. Persist gestures safely

Use one update path for drag, resize, keyboard timing edits, and dialog scheduling. ReUI's proposal callback is synchronous; do not assume it awaits an IPC Promise.

1. Validate a proposal synchronously; reject invalid ranges or locked tasks.
2. Apply an optimistic override for the affected item and start one IPC write when the gesture commits. Do not write on every pointer movement or from both proposal and list-change callbacks.
3. Keep fetched server state underneath pending overrides. Planner change broadcasts must not revert a gesture while its write is in flight.
4. On success, reconcile the returned record and refresh; clear only that operation's override.
5. On failure, remove that override, refresh authoritative data, and show an actionable error. Do not restore a stale whole-calendar snapshot.
6. Serialize mutations per item or prevent further gestures while saving. Use operation IDs so late responses cannot overwrite later edits or a newer visible range.

Task scheduling uses revision checks. Meeting gesture updates should use a narrow timing endpoint with expected previous start/end/all-day values, rejecting changes if the source record has changed or disappeared; update timing without overwriting a title edited in another dialog. Add this endpoint to contracts, main IPC, preload, and preview. A full meeting revision model can be introduced later if broader concurrency protection is needed.

Retain meeting deletion undo. A lightweight timing undo can reuse the same checked mutation and should not overwrite subsequent changes.

## 7. Verify and switch over

Add targeted tests to the existing Node/SQLite suite and renderer test setup:

- Migration from schema 9 preserves existing dates, anchors, text, tags, images, and meeting intervals; reopen of a migrated DB is idempotent.
- Backup validation/restore supports schema 10 and older supported backups.
- Schedule, reschedule, resize, date-only conversion, Ready/Backlog transitions, completion/reopen, and unfile clear or retain timing correctly.
- Invalid half-ranges, reversed ranges, malformed dates, stale revisions, deleted items, and unauthorized item kinds are rejected atomically.
- Range queries include overnight/multi-day intervals and exclude exact end-boundary items.
- Day/3 days/Workweek navigation across weekends, months, years, and DST is correct; Workweek advances seven days, never five.
- Settings migration, paired validation, 24:00, 08:15 bounds, and immediate propagation work.
- Adapter preserves real IDs, full timestamps, date-only meaning, and recurrence independence.
- Deferred IPC success/failure and broadcast races do not duplicate writes or overwrite newer state.

Manually verify real pointer movement and both resize handles in Electron, plus external Ready drops, clipped items, scroll/zoom behavior, overlapping blocks, 15-minute tasks, dark/light/system themes, keyboard editing, dialog focus, narrow windows, and offline restart persistence. Preview fixtures should cover each of these states, but browser preview is not sufficient evidence for SQLite persistence.

Run `npm run typecheck`, `npm test`, and `npm run build`. Run the existing capture smoke check after shared dependency/style integration, because capture uses the same renderer build. Investigate native-module test environment issues using the repository's existing workflow rather than changing the app's runtime to make tests pass.

## Implementation order and completion gates

| Milestone | Deliverable | Gate |
| --- | --- | --- |
| 1 | ReUI installation, provenance, themed static calendar | All three requested views render; installed APIs and external-drop approach verified. |
| 2 | Task migration, scheduling contracts/storage/IPC, settings | Real task timing survives restart; old data and backups remain usable. |
| 3 | Controlled calendar, range loading, dialogs | Real meetings, timed/date-only tasks, Ready, and Past plan are accessible. |
| 4 | Drag/resize for meetings and tasks, external Ready drag | Every required gesture persists and handles rejected writes correctly. |
| 5 | Task creation, accessibility, edge cases, cleanup | Acceptance checks pass; calendar replaces the Kanban planner. |

The work is complete when a user can create a meeting or task at a chosen time, move it to another day/time, resize its duration, restart the app and see the saved result, switch among Day/3 days/Monday–Friday Workweek, and change visible start/end times in Settings without losing access to existing items.

## References

- [Requested ReUI Calendar 3 example](https://reui.io/components/event-calendar/c-event-calendar-3): source installation and create/edit composition.
- [ReUI Event Calendar documentation](https://reui.io/docs/components/base/event-calendar): time-grid views, controlled state, proposal callbacks, hour bounds, and interactions. Specific installed APIs must be checked during milestone 1.
- [ReUI registry setup](https://reui.io/docs/registry).
- Existing project notes: `docs/calenban-domain-semantics.md` and `docs/reui-kanban-adapter.md`.
