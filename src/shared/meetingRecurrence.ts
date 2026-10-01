import { AppError } from './errors'
import { fromLocalISODate, toLocalISODate } from './plannerDates'

export type MeetingRecurrence = { frequency: 'daily' | 'weekly' | 'monthly'; until: string }

// Shift calendar dates while retaining local clock times across daylight saving changes.
export function meetingOccurrences(startAt: number, endAt: number, recurrence?: MeetingRecurrence): { startAt: number; endAt: number }[] {
  if (!recurrence) return [{ startAt, endAt }]
  const start = new Date(startAt), end = new Date(endAt)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || endAt <= startAt) throw new AppError('INVALID_RECURRENCE', 'Choose valid meeting start and end times.')
  const until = fromLocalISODate(recurrence.until)
  if (!Number.isFinite(until.getTime()) || toLocalISODate(until) !== recurrence.until || recurrence.until < toLocalISODate(start)) {
    throw new AppError('INVALID_RECURRENCE', 'Choose a repeat end date on or after the meeting date.')
  }
  if (!['daily', 'weekly', 'monthly'].includes(recurrence.frequency) || until.getFullYear() > start.getFullYear() + 10) {
    throw new AppError('INVALID_RECURRENCE', 'Choose a valid repeat interval and an end date within ten years.')
  }
  const dayOffset = Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86_400_000)
  const occurrences: { startAt: number; endAt: number }[] = []
  for (let index = 0; ; index++) {
    const next = new Date(start)
    if (recurrence.frequency === 'monthly') {
      next.setDate(1)
      next.setMonth(start.getMonth() + index)
      const month = next.getMonth()
      next.setDate(start.getDate())
      // A meeting on the 31st skips months without a 31st.
      if (next.getMonth() !== month) continue
    } else next.setDate(start.getDate() + index * (recurrence.frequency === 'weekly' ? 7 : 1))
    if (toLocalISODate(next) > recurrence.until) break
    const nextEnd = new Date(next)
    nextEnd.setDate(next.getDate() + dayOffset)
    nextEnd.setHours(end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds())
    // Keep a positive duration for meetings in the clock-change gap.
    const nextEndAt = nextEnd.getTime() > next.getTime() ? nextEnd.getTime() : next.getTime() + endAt - startAt
    if (occurrences.length >= 366) throw new AppError('INVALID_RECURRENCE', 'Choose an earlier end date. A repeat can contain up to 366 meetings.')
    occurrences.push(index === 0 ? { startAt, endAt } : { startAt: next.getTime(), endAt: nextEndAt })
  }
  return occurrences
}
