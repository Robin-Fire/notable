# Calenban date and time rules

The calendar uses the computer’s current local timezone as its planning timezone. Date-only tasks use local calendar dates (`YYYY-MM-DD`); meeting and timed-task starts and ends are stored as instants and grouped by overlap with the local start and end of each day. Day bounds are computed with local calendar arithmetic, so daylight-saving days can be 23 or 25 hours.

An all-day meeting is stored as an interval from local midnight through the exclusive midnight after its last day. If the Windows timezone changes, timed meetings and timed tasks can move to different day columns because their instants stay fixed. Date-only tasks remain on their saved calendar date. A timed task's saved `plannedDate` is a compatibility field set when scheduling; rendering and timed queries use the timestamps.

Migration 10 leaves existing dated tasks untimed, preserving their date, position, and legacy event anchor. They appear in the date-only strip. Explicit time scheduling clears the legacy anchor; moving a meeting never automatically moves tasks. Saving a meeting that no longer overlaps a legacy anchored task's date still clears that anchor transactionally.

Day and 3 days include weekends; Workweek shows Monday–Friday and advances by seven dates. Visible start/end hours are display preferences, stored as integer local clock minutes. They do not change saved schedules. Hidden/partly clipped items and hidden weekend items are accessible through the calendar's hidden-items list and Show day action. Dragging snaps to 15 minutes; dialog timing retains minute precision.

Completion preserves placement and disables scheduling gestures. Reopening clears placement and returns the task to Backlog. Moving a task to Ready clears its date/times; date-only placement clears only its times. Overlap is allowed, and timed blocks retain their full duration when moved.

Outlook sync is not enabled. When it is added, the provider timezone and all-day date semantics must be made explicit before provider event IDs or timezone conversions are persisted.
