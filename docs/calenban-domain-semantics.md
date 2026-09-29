# Calenban date and time rules

Calenban uses the computer’s current local timezone as its planning timezone. Day columns and task dates are local calendar dates (`YYYY-MM-DD`); meeting starts and ends are stored as instants and grouped by overlap with the local start and end of each day. Day bounds are computed with local calendar arithmetic, so daylight-saving days can be 23 or 25 hours.

An all-day meeting is stored as the instant interval from local midnight to the next local midnight. If the Windows timezone changes, timed meeting rows can move to different day columns because their instants stay fixed. Task dates remain on their saved calendar date. If an event anchor no longer overlaps that date in the current timezone, the task appears in that day’s end slot and can be moved again. Saving an event that no longer overlaps its anchored task date clears the anchor in the same transaction.

Outlook sync is not enabled. When it is added, the provider timezone and all-day date semantics must be made explicit before provider event IDs or timezone conversions are persisted.
