'use client'

import { useEffect, useRef, useState } from 'react'

export interface TemplateNameModalProps {
  mode: 'create' | 'rename'
  initialName?: string
  existingNames: string[]
  sourceOptions?: { id: string; label: string }[]
  onSubmit: (result: { name: string; sourceId?: string }) => Promise<{ ok: true } | { ok: false; error: string }>
  onClose: () => void
  // What is being named, in the headings and messages.
  noun?: string
}

export function TemplateNameModal({
  mode,
  initialName = '',
  existingNames,
  sourceOptions,
  onSubmit,
  onClose,
  noun = 'template',
}: TemplateNameModalProps) {
  const [name, setName] = useState(initialName)
  const [sourceId, setSourceId] = useState(sourceOptions?.[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const trimmed = name.trim()
  const isDuplicate = trimmed.length > 0 && existingNames.some(n => n === trimmed)
  const canSubmit = trimmed.length > 0 && !isDuplicate && !submitting

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    const result = await onSubmit({ name: trimmed, sourceId: sourceOptions ? sourceId : undefined })
    setSubmitting(false)
    if (result.ok) {
      onClose()
    } else {
      setError(result.error)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-xl space-y-4"
      >
        <h2 className="text-sm font-semibold text-neutral-200">
          {mode === 'create' ? `New ${noun}` : `Rename ${noun}`}
        </h2>

        <div className="space-y-1.5">
          <label className="block text-xs text-neutral-500">Name</label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={`${noun[0].toUpperCase()}${noun.slice(1)} name`}
            className="w-full px-3 py-1.5 rounded-md border border-neutral-700 bg-neutral-950 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
          />
          {isDuplicate && (
            <p className="text-xs text-red-400">A {noun} named "{trimmed}" already exists.</p>
          )}
        </div>

        {sourceOptions && (
          <div className="space-y-1.5">
            <label className="block text-xs text-neutral-500">Start from</label>
            <select
              value={sourceId}
              onChange={e => setSourceId(e.target.value)}
              className="w-full px-3 py-1.5 rounded-md border border-neutral-700 bg-neutral-950 text-sm text-neutral-200 focus:outline-none focus:border-neutral-500"
            >
              {sourceOptions.map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-neutral-700 bg-neutral-900 text-sm text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-3 py-1.5 rounded-md border border-neutral-100 bg-neutral-100 text-sm font-semibold text-neutral-950 hover:bg-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (mode === 'create' ? 'Creating…' : 'Renaming…') : mode === 'create' ? 'Create' : 'Rename'}
          </button>
        </div>
      </form>
    </div>
  )
}
