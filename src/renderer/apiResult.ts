import type { ApiResult } from '../shared/contracts'

/** Convert an API failure into the error handled by the caller's UI. */
export function resultValue<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(result.message)
  return result.value
}
