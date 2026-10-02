import { useState } from 'react'
import { Check, ChevronDown, Hash, Search, X } from 'lucide-react'
import type { TagRecord } from '../../shared/contracts'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from './ui/popover'

export function TagFilter({ tags, value, onChange, category }: { tags: TagRecord[]; value: string; onChange: (value: string) => void; category: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const matching = tags.filter(tag => tag.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const choose = (name: string) => { onChange(name); setOpen(false) }
  return <div className="backlog-tag-filter">
    <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery('') }}>
      <PopoverTrigger className={`tag-filter-trigger ${value ? 'is-filtered' : ''}`} aria-label={`Tag filter for ${category}: ${value || 'All tags'}`}>
        <Hash size={13} style={value ? { color: tags.find(tag => tag.name === value)?.color } : undefined} /><span>{value || 'All tags'}</span><ChevronDown size={12} />
      </PopoverTrigger>
      <PopoverContent align="start" className="tag-filter-popover" aria-label={`Tag filter for ${category}`}>
        <PopoverTitle className="tag-filter-title">Filter by tag</PopoverTitle>
        <label className="tag-filter-find"><Search size={13} /><input autoFocus aria-label={`Find tag for ${category}`} placeholder="Find a tag…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="tag-filter-list">
          <button type="button" className="tag-filter-option" aria-pressed={!value} onClick={() => choose('')}><Hash size={13} /><span>All tags</span>{!value && <Check size={13} />}</button>
          {matching.map(tag => <button type="button" className="tag-filter-option" aria-pressed={value === tag.name} key={tag.id} onClick={() => choose(tag.name)}><Hash size={13} style={{ color: tag.color }} /><span>{tag.name}</span>{value === tag.name && <Check size={13} />}</button>)}
          {!matching.length && <p className="tag-filter-empty">{tags.length ? 'No matching tags' : 'No tags yet'}</p>}
        </div>
      </PopoverContent>
    </Popover>
    {value && <button type="button" className="tag-filter-reset" aria-label={`Clear tag filter for ${category}`} onClick={() => onChange('')}><X size={12} /></button>}
  </div>
}
