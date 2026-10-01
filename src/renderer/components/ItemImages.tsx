import { useEffect, useState } from 'react'
import type { ImageRef } from '../../shared/contracts'

export function ItemImages({ images }: { images: ImageRef[] }) {
  const [sources, setSources] = useState<Record<string, string>>({})
  useEffect(() => {
    let active = true
    setSources({})
    void Promise.all(images.map(async (image) => {
      try {
        const result = await window.notiert.notes.image(image.id)
        return [image.id, result.ok ? result.value : ''] as const
      } catch { return [image.id, ''] as const }
    })).then((entries) => { if (active) setSources(Object.fromEntries(entries)) })
    return () => { active = false }
  }, [images.map((image) => image.id).join('|')])
  if (!images.length) return null
  return <div className="item-images" aria-label="Attached images">{images.map((image, index) => sources[image.id]
    ? <img key={image.id} src={sources[image.id]} alt={`Attached image ${index + 1}`} />
    : <div key={image.id} className="item-image-placeholder" aria-label={`Image ${index + 1} loading or unavailable`} />)}</div>
}
