# Subcategories and independent tags: implementation and migration plan

Status: implemented in schema 12. Migration runs when the updated app opens an older profile; this development work does not directly edit the user profile. The sections below record the starting model, implementation rules, and verification requirements. Sidebar ordering supports drag and keyboard-accessible up/down buttons; Backlog adds a compact independent tag selector.

## 1. Target behavior

An Inbox item, note, or task has:

- One optional category.
- One optional subcategory belonging to that category.
- Multiple independent tags, retaining the current maximum of 20 tags.

Example: category `Work`, subcategory `Project Alpha`, tags `waiting` and `follow-up`.

A category can contain items directly, without a subcategory. An unassigned item cannot have a subcategory. Subcategories have one level of nesting; deeper hierarchies are outside this change. Tags never select, infer, or change an item's category or subcategory.

Subcategory names are unique within their category, case-insensitively. `Work / Ideas` and `Personal / Ideas` are allowed. Tag names remain globally unique, case-insensitively. A tag and subcategory may share a name because they are different concepts.

## 2. Current implementation and affected areas

The current schema version is 11. Categories are stored in `categories`; the item's authoritative category is `notes.project_id`. Tags use `item_tags` and the many-to-many `note_tags` table. `item_tags.category_id` currently nests tags beneath categories. `replaceItemTags` creates new tags under the item's category.

The sidebar, Inbox classification controls, Backlog filters, task creation dialogs, and tag settings expose that coupling. Category pages already select by the item's category rather than merely inferring category from tags. Keep that authoritative item category.

Relevant files:

- `src/main/storage/database.ts`: schema migration, taxonomy CRUD, item writes, filtering, counts, ordering, integrity checks, export projection.
- `src/shared/contracts.ts`: item fields, schemas, taxonomy types, query inputs and IPC API.
- `src/main/index.ts` and `src/preload/index.ts`: validated IPC, mutation broadcasts, export and restore.
- `src/renderer/notes/NotesApp.tsx`: sidebar, item details/editor, filters and taxonomy management.
- `src/renderer/inbox/InboxView.tsx`: classification and local classification drafts.
- `src/renderer/backlog/BacklogView.tsx`: subcategory filters, tags and task cards.
- `src/renderer/backlog/BacklogTaskCreateDialog.tsx`, `src/renderer/calenban/CalendarCreateDialog.tsx`, `src/renderer/calenban/TaskDetailDialog.tsx`: item creation/editing.
- `src/renderer/capture/Capture.tsx`, capture preload and draft APIs: optional subcategory capture.
- `src/renderer/browserPreview.ts`: equivalent model, browser-data upgrade and preview behavior.
- Existing storage, renderer and Calendar test suites; README and domain documentation.

## 3. Data model

Introduce schema migration 12:

1. Create `subcategories(id, category_id, name, color, position)`.
2. Require a valid category on every subcategory. Enforce uniqueness on `(category_id, name COLLATE NOCASE)`.
3. Add nullable `notes.subcategory_id` referencing `subcategories`, with `ON DELETE SET NULL`.
4. Add nullable `drafts.subcategory_id` for capture drafts, with equivalent deletion behavior.
5. Rebuild `item_tags` without `category_id`; retain IDs, names, colors and a global position. Preserve `note_tags` foreign keys and associations during the rebuild.
6. Add durable migration-report records for ambiguous/mismatched assignments and a marker for whether the report has been acknowledged.

Use SQLite triggers or an equivalent database constraint design to enforce that a selected subcategory belongs to the item's category, including draft rows. Apply the same validation in the main-process API for friendly errors. This invariant must hold when a subcategory's parent changes, not only when an item is edited.

Suggested shared types:

```ts
type Subcategory = {
  id: string
  categoryId: string
  name: string
  color: string
  count: number
}

type TagRecord = {
  id: string
  name: string
  color: string
  count: number
}
```

Add `subcategoryId: string | null` to `Note`, inherited by `PlannerTask`, and to capture state. Return `{ categories, subcategories, tags }` from taxonomy. Use IDs for subcategory selection and filtering; names alone are ambiguous across categories.

Keep `notes.project_id` for category storage in this change. Renaming that historical column adds migration work without changing the feature's behavior.

## 4. Assignment and lifecycle rules

- Selecting a subcategory selects its parent category as part of the same UI action and atomic save.
- Changing category clears a subcategory that does not belong to the new category. Show the resulting selection immediately before saving.
- Category changes preserve all tags, images, text, completion state and schedule.
- Clearing category also clears subcategory.
- Clearing subcategory leaves category and tags intact.
- Renaming a subcategory changes its label everywhere without changing item associations.
- Deleting a subcategory preserves its items in the parent category with no subcategory.
- Deleting a category clears category/subcategory assignments on affected items and deletes that category's subcategory definitions. Preserve items and independent tags. Explain the affected-item count in the existing deletion UI.
- For the initial release, do not support moving a subcategory between categories. Moving individual items is supported; bulk structural moves can follow later.
- Tag rename/color/deletion operate globally. Tag deletion removes label associations, while preserving items and their category/subcategory assignments.
- Maintain one priority order per category. Subcategory and tag pages display filtered slices of that order; do not introduce competing orders per subcategory.
- Category moves use the existing destination-category priority rule. Subcategory changes within a category do not change task priority.

All item writes use the existing revision checks and transactions. Text, taxonomy and image edits must commit or fail together.

## 5. Migration policy

### Preservation-first recommendation

Create subcategories from category-linked legacy tags, but preserve all existing tags and item-tag associations as independent tags during migration. This is intentional: existing tags may contain meaningful overlapping labels that cannot fit into a single subcategory.

For straightforward items, the migrated subcategory and a retained tag may initially share a name. Do not silently remove that tag. Offer a later, explicit cleanup action for redundant tags on reviewed items; it is outside the automatic migration. The upgrade message must explain this transitional duplication.

### Definition mapping

- Every legacy tag with a valid non-null category becomes a subcategory under that category.
- Preserve its name, color and sibling order; create a distinct subcategory ID and record the old-tag-to-new-subcategory mapping.
- Legacy tags without a category remain independent tags and do not create subcategories.
- All legacy tags retain their original IDs and names in the independent tag table, regardless of whether a subcategory was created.
- Convert category-local tag positions into a deterministic global tag order, using old category order, old tag position, normalized name and ID as tie-breakers.

### Per-item assignment

For every item, including Inbox, completed tasks and Trash, inspect its authoritative category and legacy tag associations:

| Existing situation | Result |
| --- | --- |
| No category, no linked category tags | No category/subcategory; tags preserved |
| Category with exactly one legacy tag from that category | Assign the corresponding subcategory; preserve every tag |
| Category with several legacy tags from that category | Leave subcategory empty; record candidates for review; preserve every tag |
| Category with no matching linked tags | Keep category, leave subcategory empty, preserve tags |
| Category with matching and foreign-category tags | Apply the single/multiple matching rule; record foreign-category labels as a mismatch; preserve tags |
| No category but one or more category-linked tags | Keep category unassigned, leave subcategory empty, record review candidates; preserve tags |

Never pick the first tag, alphabetically smallest tag, or last edited tag to resolve ambiguity. Never infer a new category in migration 12. Earlier migrations may have inferred categories; version 12 respects the resulting stored category.

Migration does not change note text, image BLOBs, IDs, timestamps, revisions, completion flags, schedules, task priority, or existing category order. Existing capture drafts keep their category and receive an empty subcategory because capture currently has no subcategory choice.

### Migration report and review

Persist counts of created subcategories, automatically assigned items, ambiguous items, mismatches, and unassigned items requiring review. Store item IDs and candidate subcategory IDs with a reason code; avoid copying item text into reports or diagnostics.

Show a one-time upgrade notice with a `Review assignments` action. Review remains accessible after dismissing the notice. The review view shows current item content through the normal item API, its current category, preserved tags and candidate subcategories.

Selecting a subcategory during review is a normal revision-checked item update. A user may choose `Keep without subcategory`. Resolve records explicitly; exclude deleted items from the default review view and make them accessible via an include-Trash option. Mark reports for permanently deleted items as no longer applicable. Review never blocks normal use.

## 6. Safe migration execution and recovery

1. Reuse the existing pre-migration SQLite backup mechanism; verify it completes before any migration mutation. Use a consistent SQLite snapshot, not a raw copy of an active WAL database.
2. Start migration 12 in one transaction.
3. Snapshot legacy tag definitions/associations needed by the mapping before rebuilding tables.
4. Create subcategories and mapping, compute assignments and report rows, then rebuild independent tag storage.
5. When rebuilding tag tables, use SQLite's supported rebuild procedure. Do not toggle foreign keys inside an active transaction or accidentally cascade-delete `note_tags` while dropping the old table. Verify preserved association counts explicitly.
6. Check foreign keys, category/subcategory consistency, item counts, tag links and image counts before recording version 12 and committing.
7. On error, roll back the whole migration and show the existing recovery error. Keep the recovery backup available.
8. Opening an already-upgraded database must not create duplicate definitions, assignments or report records.

Update version gates and backup completeness checks to accept version 12 and require the new tables. Restoring supported older backups must migrate through version 12 using the same rules. Restore creates its existing safety backup before replacing current data.

Older app versions will not understand schema 12. Downgrade recovery uses the pre-migration backup with the older executable; it does not reuse the upgraded database. Explain that restoring that older snapshot loses edits made after the upgrade. Do not ship an automatic reverse migration.

## 7. API and query changes

- Add subcategory CRUD and sibling reorder IPC operations, with role checks and Zod schemas.
- Remove category arguments from global tag create/update/reorder operations.
- Stop `replaceItemTags` from creating category-owned tags.
- Extend capture draft/submit, classification, item edit/category assignment and task creation inputs with subcategory selection.
- Define optional patch semantics explicitly: omission preserves selection; explicit `null` clears it. If a category changes while subcategory is omitted, clear an incompatible old selection.
- Return the selected subcategory in all note, Inbox, Backlog, Ready, Calendar and Trash projections.
- Extend list filters with subcategory IDs and an explicit no-subcategory option.
- Backlog uses selected subcategories OR no-subcategory within its category; independent tag filters combine with that result using AND. Several selected tags retain the current OR matching behavior.
- `No subcategory` means an empty subcategory assignment, regardless of tags. `No tags` means zero tag associations, regardless of subcategory.
- Keep pagination based on category priority and item ID. Add appropriate indexes for category/subcategory scope after examining the actual query plan.
- Taxonomy counts include non-deleted items, matching current sidebar behavior. View-specific counts separately apply completion/Backlog/Later filters.
- Search should match text, independent tags and subcategory labels; do not index image contents.
- Update export output to include category, subcategory and tags distinctly, preserving current image export behavior. SQLite backups remain full-fidelity.

## 8. UI changes

### Sidebar and navigation

Keep categories as expandable parents. Replace their nested tag rows with subcategory rows. Parent category pages contain direct items and every subcategory's items. Add a `No subcategory` view/filter for direct items.

Give independent tags their own collapsible section with global tag pages. Use folder-style treatment for category/subcategory paths and `#` for tags so equal names remain distinguishable. Preserve category drag ordering; subcategories reorder only among siblings and tags reorder globally.

### Capture and Inbox

Keep category selection fast. Make subcategory optional and available after selecting category, without requiring it before capture. Changing category clears the old subcategory in both the UI and persisted draft.

Inbox classification shows separate Category, Subcategory and Tags controls. Subcategory is single-select and category-scoped. Tag suggestions are global. Keep draft choices on navigation.

Version the `inbox-tags:<id>` localStorage draft format. Existing `tags` arrays stay tag drafts; do not infer a subcategory from unsaved draft text. Preserve category and introduce nullable subcategory. Validate restored IDs against current taxonomy and gracefully clear removed selections.

### Editing and creation

Use a shared category/subcategory picker in note editing, task details and both task creation dialogs. Add category editing to task details where necessary. Leave the existing tag editor as a multiple-label input with global suggestions.

Create-from-subcategory preselects both category and subcategory. Create-from-tag preselects that tag without inventing a category. Tag creation never creates a subcategory; subcategory creation is an explicit action under a category.

### Compact views

Show subcategory context once, rather than as another tag pill. In category-grouped Backlog, a small subcategory label suffices. Where category context is absent, use a compact `Work / Project Alpha` path in metadata/details. Retain compact image indicators and expandable attachment details.

### Settings and management

Separate category/subcategory management from global tag management. Remove tag category assignment controls. Support subcategory rename, color, deletion and sibling reorder; support independent tag rename, color, deletion and global ordering.

## 9. Implementation sequence

1. **Storage and migration:** implement schema 12, mapping/report, constraints, backups and migration tests.
2. **Domain and IPC:** update contracts, item mutations, filtering, export/restore and all API callers together; typecheck before proceeding.
3. **Shared controls and taxonomy UI:** category/subcategory picker, independent tag management, sidebar and navigation.
4. **Item workflows:** capture, Inbox, notes, task creation/editing, Backlog, Later, Ready and Calendar metadata.
5. **Upgrade review and browser preview:** review view, localStorage upgrade, browser preview data conversion using the same assignment rules.
6. **Validation and documentation:** integration tests, manual Windows smoke checks, README and updated domain semantics.

Keep each phase reviewable, but release the complete set together; old renderer contracts must not run against partially changed storage.

## 10. Verification and acceptance criteria

### Storage/migration tests

- Version 11 fixture covering every assignment row above, including Inbox, completed tasks and Trash.
- Upgrade from supported older versions through migration 12.
- Item IDs, bodies, timestamps, revisions, image bytes, task schedules and category priority remain identical.
- Every old tag association survives; subcategory mappings preserve label, color and sibling order.
- Ambiguous assignments remain empty with accurate persistent review records.
- Repeat opening produces no duplicate subcategories or reports.
- Injected failures leave version 11 fully intact; successful backups can restore.
- Invalid cross-category selections fail without partial text, tag or image edits.
- Same subcategory name in different categories is accepted; sibling duplicates are rejected.
- Category/subcategory/tag deletion follows the preservation rules.
- Filters distinguish no-subcategory from no-tags and paginate without duplicates or omissions.

### Renderer/integration tests

- Category changes clear incompatible subcategories while preserving independent tags and images.
- Single subcategory selection and multiple tags save correctly in every item workflow.
- Tags can be reused in any category and on unassigned items.
- Cancel/discard preserves the saved category, subcategory, tags and attachments.
- Sidebar parent/child/tag scopes return expected items.
- Backlog priority remains consistent through subcategory and tag filters.
- Upgrade review supports assignment, keep-empty, dismissal and reopening.
- Old classification drafts and browser-preview data upgrade without throwing away tags.

### Release checks

Run typecheck, all storage/renderer tests, production build and existing applicable Electron smoke scripts. Manually check capture keyboard flow, dropdown focus, Snipping Tool paste during taxonomy editing, upgrade from a copied profile, restore of an old backup, export metadata, and restart persistence.

The feature is complete when one optional subcategory and multiple independent tags work throughout the app, existing information survives migration, ambiguous items remain reviewable, and image/scheduling behavior remains intact.
