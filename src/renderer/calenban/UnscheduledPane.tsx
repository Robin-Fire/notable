import type { PlannerTask } from '../../shared/contracts'
import { KanbanColumnContent } from '../components/reui/kanban'
import { PlannerTaskCard } from './PlannerCards'

export function UnscheduledPane({ tasks, days, onDeleteTask, onOpen }: {
  tasks: PlannerTask[]
  days: string[]
  onDeleteTask: (id: string) => void
  onOpen: (task: PlannerTask) => void
}) {
  return <aside className="unscheduled-pane">
    <header><span>READY</span><b>{tasks.length}</b></header>
    <KanbanColumnContent id="lane:unscheduled" items={tasks.map((task) => task.id)}>
      {tasks.length ? tasks.map((task) => <PlannerTaskCard key={task.id} task={task} days={days} onDelete={onDeleteTask} onOpen={onOpen} />) : <div className="drop-hint">Choose tasks from Backlog, or drop a dated task here.</div>}
    </KanbanColumnContent>
    <div className="unscheduled-note">Add tasks from Backlog when you want to plan them.</div>
  </aside>
}
