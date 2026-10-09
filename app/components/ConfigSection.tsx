'use client'

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react'

// ── Field types ──────────────────────────────────────────────────────────────

export type FieldDef =
  | { label: string; description: string; path: string[]; type: 'text'; placeholder?: string }
  | { label: string; description: string; path: string[]; type: 'number'; min?: number; max?: number; step?: number }
  | { label: string; description: string; path: string[]; type: 'emoji' }
  | { label: string; description: string; path: string[]; type: 'checkbox' }
  | { label: string; description: string; path: string[]; type: 'select'; options: { value: string; label: string }[] }

// ── ConfigSection ──────────────────────────────────────────────────────────

export function ConfigSection({ title, fields, parsed, onUpdate }: {
  id?: string
  title: string
  fields: FieldDef[]
  parsed: Record<string, unknown> | null
  onUpdate: (path: string[], value: string | boolean | number) => void
}) {
  const [openEmoji, setOpenEmoji] = useState<string | null>(null)
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 })
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  function getRawAt(path: string[]): unknown {
    let obj: unknown = parsed
    for (const key of path) {
      if (obj == null || typeof obj !== 'object') return undefined
      obj = (obj as Record<string, unknown>)[key]
    }
    return obj
  }
  const str = (path: string[]) => { const v = getRawAt(path); return typeof v === 'string' ? v : String(v ?? '') }
  const bool = (path: string[]) => getRawAt(path) === true

  return (
    <div className="rounded-lg border border-neutral-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-900/60">
        <h3 className="text-sm font-semibold text-neutral-300">{title}</h3>
      </div>
      <div className="p-4 space-y-3 gap-3 bg-neutral-900/20">
        {fields.map(field => {
          const key = field.path.join('.')
          return (
            <div key={key} className={field.type === 'checkbox' ? 'flex items-center gap-2' : 'space-y-1.5'}>
              {field.type !== 'checkbox' && <label className="text-sm font-medium text-neutral-400">{field.label}</label>}
              <p className="text-sm text-neutral-500">{field.description}</p>
              {field.type === 'text' && (
                <input
                  type="text"
                  value={str(field.path)}
                  onChange={e => onUpdate(field.path, e.target.value)}
                  placeholder={field.placeholder ? (field?.placeholder) : ""}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-neutral-500"
                />
              )}
              {field.type === 'number' && (
                <input
                  type="number"
                  value={getRawAt(field.path) as number ?? ''}
                  min={field.min}
                  max={field.max}
                  step={field.step ?? 'any'}
                  onChange={e => {
                    const v = parseFloat(e.target.value)
                    if (!isNaN(v)) onUpdate(field.path, v)
                  }}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-neutral-500"
                />
              )}
              {field.type === 'select' && (
                <select
                  value={str(field.path)}
                  onChange={e => onUpdate(field.path, e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-neutral-500 cursor-pointer"
                >
                  {field.options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
              {field.type === 'checkbox' && (
                <>
                  <input
                    type="checkbox"
                    id={key}
                    checked={bool(field.path)}
                    onChange={e => onUpdate(field.path, e.target.checked)}
                    className="accent-neutral-400 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor={key} className="text-sm font-medium text-neutral-400 cursor-pointer">{field.label}</label>
                </>
              )}
              {field.type === 'emoji' && (
                <div>
                  <button
                    type="button"
                    ref={el => { buttonRefs.current[key] = el }}
                    onClick={() => {
                      const rect = buttonRefs.current[key]?.getBoundingClientRect()
                      if (rect) setPickerPos({ top: rect.bottom + 4, left: rect.left })
                      setOpenEmoji(openEmoji === key ? null : key)
                    }}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-xl leading-none focus:outline-none focus:border-neutral-500 cursor-pointer"
                  >
                    {str(field.path) || '🤖'}
                  </button>
                  {openEmoji === key && createPortal(
                    <div
                      className="fixed z-50"
                      style={{ top: pickerPos.top, left: pickerPos.left }}
                      onMouseLeave={() => setOpenEmoji(null)}
                    >
                      <EmojiPicker
                        onEmojiClick={(data: EmojiClickData) => {
                          onUpdate(field.path, data.emoji)
                          setOpenEmoji(null)
                        }}
                        skinTonesDisabled
                        height={380}
                        width={280}
                      />
                    </div>,
                    document.body,
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

