import type { PlannerTask } from '../../shared/contracts'
import { ItemDetailDialog } from '../components/ItemDetailDialog'

export function TaskDetailDialog(props: { task: PlannerTask; suggestions: string[]; onClose: () => void; onChanged: () => void }) {
  return <ItemDetailDialog {...props} />
}
