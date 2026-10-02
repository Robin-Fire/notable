# Calenban Kanban adapter

Historical note: the Kanban renderer was replaced by the ReUI time-grid calendar on 1 October 2026. Its local adapter and board components have been removed. See [calendar integration](reui-calendar-adapter.md) for the current implementation.

The upstream reference is [ReUI’s Base Kanban documentation](https://github.com/keenthemes/reui/blob/main/content/docs/%28components%29/base/kanban.mdx), checked on 26 September 2026. ReUI documents a source-first component with `value`, `onValueChange`, `getItemValue`, and `onMove`, using dnd-kit internally.

`src/renderer/components/reui/kanban.tsx` is a Calenban-local adapter, not copied or imported ReUI source. It provides only the compositional pieces this planner needs: one dnd-kit context, sortable task cards, date/event drop lanes, a drag overlay, and pointer/keyboard sensors. Meeting rows are fixed content inside those lanes; only tasks move. The adapter intentionally does not support movable columns or ReUI’s optimistic whole-board value model. Drop semantics live in `src/shared/plannerDrop.ts` so date, event-anchor, and unscheduled ordering rules can be tested without the renderer.

The local file remains under `components/reui` to identify its design reference, not to imply upstream API or source parity. Keep this notice updated if the implementation is replaced with source copied from a pinned ReUI revision.
