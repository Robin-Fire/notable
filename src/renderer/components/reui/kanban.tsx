import { createContext, useContext, useState, type CSSProperties, type ReactNode } from 'react'
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, pointerWithin, PointerSensor, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DraggableAttributes, type DraggableSyntheticListeners } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Calenban-local adapter following ReUI's documented composition pattern. This is not upstream ReUI source: its contract is intentionally limited to fixed date slots and item moves, while dnd-kit provides the drag sensors and sorting primitives.
type Placement = 'before' | 'after'
const BoardContext = createContext<{ activeId: string | null; overId: string | null; placement: Placement }>({ activeId: null, overId: null, placement: 'before' })
const ItemContext = createContext<{ attributes: DraggableAttributes; listeners: DraggableSyntheticListeners | undefined }>({ attributes: {} as DraggableAttributes, listeners: undefined })
const collisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args).filter((collision) => collision.id !== args.active.id)
  if (underPointer.length) {
    const cards = underPointer.filter((collision) => !String(collision.id).startsWith('lane:'))
    return cards.length ? cards : underPointer
  }
  return closestCenter(args).filter((collision) => collision.id !== args.active.id)
}
function placementFor(event: DragOverEvent | DragEndEvent): Placement {
  if (!event.over) return 'before'
  const dragged = event.active.rect.current.translated ?? event.active.rect.current.initial
  const center = dragged ? dragged.top + dragged.height / 2 : event.over.rect.top + event.delta.y
  return center >= event.over.rect.top + event.over.rect.height / 2 ? 'after' : 'before'
}

export function Kanban({ children, onMove, overlay }: { children: ReactNode; onMove: (event: DragEndEvent, placement: Placement) => void; overlay?: (id: string) => ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [placement, setPlacement] = useState<Placement>('before')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  return <BoardContext.Provider value={{ activeId, overId, placement }}><DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={({ active }) => setActiveId(String(active.id))} onDragOver={(event) => { setOverId(event.over ? String(event.over.id) : null); setPlacement(placementFor(event)) }} onDragCancel={() => { setActiveId(null); setOverId(null) }} onDragEnd={(event) => { setActiveId(null); setOverId(null); onMove(event, placementFor(event)) }}><div className="reui-kanban">{children}</div><DragOverlay dropAnimation={null}>{activeId ? overlay?.(activeId) : null}</DragOverlay></DndContext></BoardContext.Provider>
}

export function KanbanBoard({ children }: { children: ReactNode }) { return <div className="reui-kanban-board">{children}</div> }

export function KanbanColumn({ children, day }: { children: ReactNode; day: string }) { return <section className="reui-kanban-column" data-day={day}>{children}</section> }

export function KanbanColumnContent({ children, id, items }: { children: ReactNode; id: string; items: string[] }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return <SortableContext id={id} items={items} strategy={verticalListSortingStrategy}><div ref={setNodeRef} className={`reui-kanban-column-content ${isOver ? 'is-over' : ''}`} data-drop-lane={id}>{children}</div></SortableContext>
}

export function KanbanItem({ children, id }: { children: ReactNode; id: string }) {
  const { activeId, overId, placement } = useContext(BoardContext)
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id })
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition }
  return <ItemContext.Provider value={{ attributes, listeners }}><article ref={setNodeRef} style={style} className={`reui-kanban-item ${isDragging ? 'is-dragging' : ''} ${activeId === id ? 'is-active' : ''} ${activeId && overId === id && activeId !== id ? `drop-${placement}` : ''}`} data-task-id={id}>{children}</article></ItemContext.Provider>
}

export function KanbanItemHandle({ children, label }: { children: ReactNode; label: string }) {
  const { attributes, listeners } = useContext(ItemContext)
  return <button type="button" className="reui-kanban-item-handle" aria-label={label} {...attributes} {...listeners}>{children}</button>
}
