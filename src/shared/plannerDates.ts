export function toLocalISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function fromLocalISODate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year!, month! - 1, day!)
}

export function localDateBounds(isoDate: string): { start: number; end: number } {
  const [year, month, day] = isoDate.split('-').map(Number)
  const start = new Date(year!, month! - 1, day!)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.getTime(), end: end.getTime() }
}

export function eventOverlapsLocalDay(startAt: number, endAt: number, isoDate: string): boolean {
  const day = localDateBounds(isoDate)
  return startAt < day.end && endAt > day.start
}

export function addLocalDays(isoDate: string, amount: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(year!, month! - 1, day!)
  date.setDate(date.getDate() + amount)
  return toLocalISODate(date)
}

export function mondayISO(date: Date): string {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return toLocalISODate(monday)
}
