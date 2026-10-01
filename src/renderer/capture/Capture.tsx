import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CompositionEvent, type KeyboardEvent } from 'react'
import { AlertCircle, ArrowUpRight, Copy, CornerDownLeft, Folder, RotateCcw, X } from 'lucide-react'
import type { CaptureState, Category } from '../../shared/contracts'

export function Capture() {
  const [state, setState] = useState<CaptureState>({ body: '', images: [], generation: 0, revision: 0, shortcut: 'Control+N', theme: 'system', available: false, categoryId: null })
  const [categories, setCategories] = useState<Category[]>([])
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [composing, setComposing] = useState(false)
  const [tooLong, setTooLong] = useState(false)
  const [imagePending, setImagePending] = useState(false)
  const savingLock = useRef(false)
  const imagePendingRef = useRef(false)
  const requestIdRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const revision = useRef(0)
  const generation = useRef(0)
  const categoryId = useRef<string | null>(null)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const bodyRef = useRef('')
  const requestedHeight = useRef<number | null>(null)
  bodyRef.current = body

  const resizeCapture = useCallback((height: number) => {
    if (requestedHeight.current === height) return
    requestedHeight.current = height
    window.notable.capture.resize(height)
  }, [])

  useEffect(() => {
    const refreshCategories = async () => {
      try {
        const result = await window.notable.capture.categories()
        if (result.ok) setCategories(result.value)
      } catch { /* Keep capture usable if taxonomy is temporarily unavailable. */ }
    }
    const apply = (next: Partial<CaptureState>) => {
      setState((current) => ({ ...current, ...next }))
      if (typeof next.body === 'string') setBody(next.body)
      if (typeof next.generation === 'number') generation.current = next.generation
      if (typeof next.revision === 'number') revision.current = next.revision
      if (next.categoryId !== undefined) categoryId.current = next.categoryId
      if (next.theme) document.documentElement.dataset.theme = next.theme
      if (next.available !== undefined) void refreshCategories()
    }
    void window.notable.capture.getState().then((result) => { if (result.ok) apply(result.value) })
    const unsubscribe = window.notable.capture.onState(apply)
    const focus = () => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(bodyRef.current.length, bodyRef.current.length) }
    window.addEventListener('focus', focus)
    const initialFocus = setTimeout(focus, 40)
    return () => { clearTimeout(initialFocus); unsubscribe(); window.removeEventListener('focus', focus); clearTimeout(draftTimer.current) }
  }, [])

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    const contentHeight = Math.min(input.scrollHeight, 132)
    input.style.height = `${contentHeight}px`
    resizeCapture(Math.min(220, Math.max(88, contentHeight + (categories.length ? 89 : 62) + (state.images.length ? 67 : 0) + (error || tooLong || !state.available ? 28 : 0))))
  }, [body, categories.length, error, tooLong, state.available, state.images.length, resizeCapture])

  const persistDraft = useCallback(async (draft: string, selectedCategory = categoryId.current) => {
    if (!state.available || saving) return
    revision.current += 1
    const result = await window.notable.capture.updateDraft({ body: draft, generation: generation.current, revision: revision.current, categoryId: selectedCategory })
    if (result.ok) revision.current = Math.max(revision.current, result.value.revision)
  }, [saving, state.available])

  const flushDraft = useCallback(async () => {
    clearTimeout(draftTimer.current)
    await persistDraft(bodyRef.current)
  }, [persistDraft])

  useEffect(() => {
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || !document.querySelector('.capture-card')) return
      event.preventDefault()
      void flushDraft().finally(() => window.notable.capture.dismiss('escape'))
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [flushDraft])

  useEffect(() => {
    const unsubscribe = window.notable.capture.onQuitRequest(() => {
      clearTimeout(draftTimer.current)
      const draft = bodyRef.current
      void window.notable.capture.flushBeforeQuit({ body: draft, generation: generation.current, revision: revision.current + 1, categoryId: categoryId.current }).then((result) => {
        if (result.ok) { revision.current = Math.max(revision.current, result.value.revision); window.notable.capture.respondToQuit(true, draft) }
        else window.notable.capture.respondToQuit(false, draft)
      }).catch(() => window.notable.capture.respondToQuit(false, draft))
    })
    window.notable.capture.ready()
    return unsubscribe
  }, [])

  const onChange = (value: string) => {
    const count = [...value].length
    if (count > 50_000) { setTooLong(true); return }
    setTooLong(false)
    setBody(value)
    setError('')
    requestIdRef.current = null
    clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => void persistDraft(value), 250)
  }

  const submit = async () => {
    if ((!body.trim() && !state.images.length) || savingLock.current || imagePendingRef.current || composing || !state.available) return
    savingLock.current = true
    clearTimeout(draftTimer.current)
    setSaving(true)
    setError('')
    const id = requestIdRef.current ?? crypto.randomUUID()
    requestIdRef.current = id
    try {
      const result = await window.notable.capture.submit({ requestId: id, generation: generation.current, body, categoryId: categoryId.current })
      if (!result.ok) { setError(result.message); return }
      setBody('')
      setState((current) => ({ ...current, images: [] }))
      bodyRef.current = ''
      requestIdRef.current = null
      revision.current = 0
      generation.current += 1
      categoryId.current = null
      setState((current) => ({ ...current, categoryId: null }))
      try { await window.notable.capture.dismiss('saved') } catch { /* The capture is already saved. */ }
      resizeCapture(categories.length ? 115 : 88)
    } catch { setError('The capture could not be saved. Your text and images are still here. Try again.') }
    finally { savingLock.current = false; setSaving(false) }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      if (composing || event.nativeEvent.isComposing || event.keyCode === 229) return
      event.preventDefault()
      void submit()
    }
  }

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...event.clipboardData.items].filter((item) => item.kind === 'file' && item.type.startsWith('image/')).map((item) => item.getAsFile()).filter((file): file is File => file !== null)
    if (files.length) {
      event.preventDefault()
      if (imagePendingRef.current) return
      if (state.images.length + files.length > 5) { setError('A capture can hold up to five images.'); return }
      imagePendingRef.current = true
      setImagePending(true)
      void (async () => {
        try {
          for (const file of files) {
            if (file.size > 5_000_000) throw new Error('Each image must be under 5 MB.')
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The image could not be read.'))
              reader.onerror = () => reject(new Error('The image could not be read.'))
              reader.readAsDataURL(file)
            })
            const result = await window.notable.capture.addImage({ generation: generation.current, dataUrl })
            if (!result.ok) throw new Error(result.message)
            setState((current) => ({ ...current, images: [...current.images, result.value] }))
          }
          setError('')
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'The image could not be pasted.') }
        finally { imagePendingRef.current = false; setImagePending(false) }
      })()
      return
    }
    const pasted = event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n')
    const current = body
    const start = event.currentTarget.selectionStart
    const end = event.currentTarget.selectionEnd
    const value = current.slice(0, start) + pasted + current.slice(end)
    if ([...value].length > 50_000) { event.preventDefault(); setTooLong(true) }
  }

  const removeImage = async (id: string) => {
    if (imagePendingRef.current) return
    imagePendingRef.current = true
    setImagePending(true)
    try {
      const result = await window.notable.capture.removeImage({ generation: generation.current, id })
      if (result.ok) setState((current) => ({ ...current, images: current.images.filter((image) => image.id !== id) }))
      else setError(result.message)
    } catch { setError('The image could not be removed. Try again.') }
    finally { imagePendingRef.current = false; setImagePending(false) }
  }

  const copyText = async () => { await navigator.clipboard.writeText(body); setError('Text copied. It is still here until you close this bar.') }
  return <main className="capture-shell" aria-label="Capture a thought">
    <div className="capture-card">
      <header className="capture-header">
        <span className="wordmark">notable</span>
        <button className="icon-button capture-open" title="Open notes" aria-label="Open notes" onClick={() => window.notable.windows.openNotes()}><ArrowUpRight size={15} /></button>
        <button className="icon-button capture-close" title="Close capture" aria-label="Close capture" onClick={() => void flushDraft().finally(() => window.notable.capture.dismiss('escape'))}><X size={15} /></button>
      </header>
      <textarea
        ref={inputRef} className="capture-input" rows={1} value={body} maxLength={100000}
        placeholder={state.available ? 'Capture a thought…' : 'Storage is unavailable. Keep this text on screen.'}
        aria-label="Note text" aria-describedby="capture-status" readOnly={saving}
        onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} onPaste={onPaste}
        onCompositionStart={() => setComposing(true)} onCompositionEnd={(_event: CompositionEvent<HTMLTextAreaElement>) => setComposing(false)}
        onBlur={(event) => {
          void flushDraft()
          const next = event.relatedTarget
          if (!(next instanceof Node && event.currentTarget.closest('.capture-card')?.contains(next))) void window.notable.capture.dismiss('blur')
        }}
      />
      {categories.length > 0 && <label className="capture-category-control"><Folder size={13} /><span>Category</span><select aria-label="Capture category" disabled={saving} value={state.categoryId ?? ''} onChange={(event) => {
        const selected = event.target.value || null
        categoryId.current = selected
        setState((current) => ({ ...current, categoryId: selected }))
        void persistDraft(bodyRef.current, selected)
      }}><option value="">Unassigned</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}
      {state.images.length > 0 && <div className="capture-images" aria-label="Pasted images">{state.images.map((image, index) => <div className="capture-image" key={image.id}><img src={image.dataUrl} alt={`Pasted image ${index + 1}`} /><button type="button" aria-label={`Remove pasted image ${index + 1}`} onClick={() => void removeImage(image.id)} disabled={saving || imagePending}><X size={12} /></button></div>)}</div>}
      {(error || tooLong || !state.available) && <div className={`capture-alert ${!state.available || error ? 'is-error' : ''}`} id="capture-status" role="status">
        <AlertCircle size={14} /> <span>{!state.available ? 'Couldn’t reach local storage. This draft may not be persisted.' : tooLong ? 'A note can contain up to 50,000 characters. Existing text was kept.' : error}</span>
        {(error || !state.available) && <div className="capture-alert-actions">{error && <button onClick={() => void submit()} disabled={saving}><RotateCcw size={13} /> Retry</button>}<button onClick={() => void copyText()}><Copy size={13} /> Copy</button></div>}
      </div>}
      {state.available && !error && <footer className="capture-footer">
        {[...body].length > 47_500 && <span className="capture-count near-limit">{[...body].length.toLocaleString()} / 50,000</span>}
        <button className="capture-submit" onClick={() => void submit()} disabled={(!body.trim() && !state.images.length) || saving || imagePending || !state.available} aria-label="Save to Inbox"><CornerDownLeft size={15} /></button>
      </footer>}
    </div>
  </main>
}
