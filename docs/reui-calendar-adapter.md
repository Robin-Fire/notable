# ReUI calendar integration

Installed on 1 October 2026 with `pnpm dlx shadcn@latest add @reui/c-event-calendar-3 --yes`, using the [base-nova registry](https://reui.io/r/base-nova/c-event-calendar-3.json). The CLI invocation copies source; this is not an `@reui` npm dependency. npm and `package-lock.json` remain the project's dependency workflow.

The original Calendar 3 example is retained at `src/renderer/components/examples/c-event-calendar-3.tsx`, while the live app uses `CalendarView.tsx` and the installed primitive under `src/renderer/components/reui/event-calendar/`. CLI-generated registry paths were moved into the renderer alias tree. The MIT copyright/permission notice is included in `resources/licenses/reui-MIT.txt` and packaged by the existing Electron resources configuration.

Content fingerprints of the installed source snapshot (SHA-256):

- Calendar 3 example: `26FC15ECA9AD9AEC5C048B4FA7BB4A8660EDBEE9770DC6C9B9D29169969DDF68`.
- Core `event-calendar.tsx`: `721E9DDC599BE3486C20B4EC0E6B9DF2134FB9E0394358837D2BB34A54540C73`.

Local source adjustments remove unused imports/types for strict TypeScript checking, allow displayed ranges shorter than an hour, and size the final gutter row correctly for quarter-hour end bounds. All application persistence and domain semantics live in the app's adapter, shared contracts, and SQLite store. The core engine does not persist anything itself.

Day and N-day count 3 retain weekend columns. Workweek uses the week engine with a Monday start and weekends hidden. Custom content remains inside ReUI's interactive chip so move gestures, both resize handles, keyboard behavior, and accessible labels remain available.

`useCalendarMutations.ts` accepts committed proposals synchronously, overlays pending records, writes once through IPC, and reconciles against authoritative data. Task revision checks and meeting expected-timing checks reject stale writes. A mutation completing after navigation cannot fetch its obsolete date range over the new view.

`useReadyDrag.ts` bridges external tasks to the grid with pointer gestures, five-pixel activation, touch long-press, Escape cancellation, a moving preview, 15-minute snapping, and scroll-edge auto-scroll. It reads the installed grid's `data-ec-day`/bounds attributes and measured rectangles in `calendarDrop.ts`. It does not introduce a competing dnd-kit context. `ReadyDropBridge` handles calendar-to-Ready releases through the local engine's root/drag internals; keep this small integration in mind when updating upstream source.

Migration 10 adds task timestamps without assigning times to legacy tasks. Dated untimed tasks render in the all-day/date-only strip. Task scheduling clears legacy `beforeEventId` ordering anchors, while preserving content and Backlog priority. Tasks with a date only have no duration and gain resize handles once scheduled as a time block.

Validation: `npm run typecheck`, `npm test`, `npm run build`, `npm run smoke:calendar`, and `npm run smoke:capture`. The calendar smoke test uses a temporary profile and verifies real Electron input gestures, SQLite-backed IPC, settings propagation, Workweek, and renderer reload. It captures static DOM snapshots in an offscreen window for visual inspection under `tests/.visual/`.
