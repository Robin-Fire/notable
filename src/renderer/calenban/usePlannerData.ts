import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlannerEvent, PlannerTask } from '../../shared/contracts'

function valueOf<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(result.message)
  return result.value
}

export function usePlannerData(from: string, to: string) {
  const [tasks, setTasks] = useState<PlannerTask[]>([])
  const [events, setEvents] = useState<PlannerEvent[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestNumber = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++requestNumber.current
    setLoading(true)
    try {
      const data = valueOf(await window.notiert.planner.tasks(from, to))
      if (request !== requestNumber.current) return
      setTasks(data.tasks)
      setEvents(data.events)
      setTags(data.tags)
      setError('')
    } catch (reason) {
      if (request === requestNumber.current) setError(reason instanceof Error ? reason.message : 'Calenban could not be loaded.')
    } finally {
      if (request === requestNumber.current) setLoading(false)
    }
  }, [from, to])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => window.notiert.planner.onChanged(() => { void refresh() }), [refresh])
  return { tasks, events, tags, loading, error, refresh }
}
