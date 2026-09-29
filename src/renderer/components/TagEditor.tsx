import { useId, type KeyboardEvent } from 'react'
import { Tag, X } from 'lucide-react'

export function collectTags(tags: string[], draft = ''): string[] {
  const names = [...tags, ...draft.split(',')]
  return [...new Map(names.map((name) => name.trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean).map((name): [string, string] => [name.toLocaleLowerCase(), name])).values()].slice(0, 20)
}

export function TagEditor({ tags, draft, onTagsChange, onDraftChange, suggestions, disabled = false, hint = 'Enter or comma to add a tag' }: {
  tags: string[]
  draft: string
  onTagsChange: (tags: string[]) => void
  onDraftChange: (draft: string) => void
  suggestions: string[]
  disabled?: boolean
  hint?: string
}) {
  const listId = useId()
  const filtered = suggestions.filter((name) => !tags.some((tag) => tag.toLocaleLowerCase() === name.toLocaleLowerCase()) && (!draft || name.toLocaleLowerCase().includes(draft.toLocaleLowerCase()))).slice(0, 12)

  function addDraft() {
    if (!draft.trim()) return
    onTagsChange(collectTags(tags, draft))
    onDraftChange('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addDraft() }
    if (event.key === 'Backspace' && !draft && tags.length) onTagsChange(tags.slice(0, -1))
  }

  return <div className="tag-editor">
    <div className="tag-editor-field">
      <Tag size={14} aria-hidden="true" />
      {tags.map((tag) => <span className="tag-chip" key={tag}>{tag}<button type="button" disabled={disabled} aria-label={`Remove tag ${tag}`} onClick={() => onTagsChange(tags.filter((name) => name !== tag))}><X size={11} /></button></span>)}
      <input type="text" list={listId} value={draft} disabled={disabled || tags.length >= 20} maxLength={160} aria-label="Add a tag" placeholder={tags.length ? 'Add tag…' : 'Add tags…'} onChange={(event) => {
        const next = event.target.value
        if (next.includes(',')) {
          const parts = next.split(',')
          onTagsChange(collectTags(tags, parts.slice(0, -1).join(',')))
          onDraftChange(parts.at(-1) ?? '')
        } else onDraftChange(next)
      }} onKeyDown={onKeyDown} />
      <datalist id={listId}>{filtered.map((name) => <option key={name} value={name} />)}</datalist>
    </div>
    <small>{tags.length >= 20 ? '20 tags maximum' : hint}</small>
  </div>
}
