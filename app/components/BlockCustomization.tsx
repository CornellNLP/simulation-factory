'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_BLOCKS, blockDescriptions, describeBlock, type Block } from '../lib/blocks'

// Re-exported so existing importers keep working; both now live in lib/blocks
// so the prompt editors can read them without pulling in this editor.
export { DEFAULT_BLOCKS }
export type { Block }

// `index === null` means the editor is open for a brand-new block.
//
// `descriptions` holds the block's alternatives, one per textbox. Exactly one of
// them is drawn at random when an experiment is created, so an empty one would
// silently blank the block out — they are dropped on save.
type Editing = { index: number | null; name: string; descriptions: string[] }

export function BlockCustomization({ blocks, onUpdate }: {
  blocks: Block[]
  onUpdate: (blocks: Block[]) => void
}) {
  const [editing, setEditing] = useState<Editing | null>(null)

  const openNew = () => setEditing({ index: null, name: '', descriptions: [''] })
  const openExisting = (index: number) =>
    setEditing({ index, name: blocks[index].name, descriptions: blockDescriptions(blocks[index]) })

  const close = () => setEditing(null)

  const setDescription = (i: number, value: string) =>
    setEditing(e => (e ? { ...e, descriptions: e.descriptions.map((d, j) => (j === i ? value : d)) } : e))

  const addOption = () =>
    setEditing(e => (e ? { ...e, descriptions: [...e.descriptions, ''] } : e))

  const removeOption = (i: number) =>
    setEditing(e => (e ? { ...e, descriptions: e.descriptions.filter((_, j) => j !== i) } : e))

  const save = () => {
    if (!editing) return
    // A block with nothing but blank options keeps one empty description, which
    // resolves to just the block's name at run time.
    const kept = editing.descriptions.filter(d => d.trim() !== '')
    const block = { name: editing.name.trim(), descriptions: kept.length > 0 ? kept : [''] }
    if (!block.name) return
    onUpdate(
      editing.index === null
        ? [...blocks, block]
        : blocks.map((b, i) => (i === editing.index ? block : b)),
    )
    close()
  }

  const remove = () => {
    if (!editing || editing.index === null) return
    onUpdate(blocks.filter((_, i) => i !== editing.index))
    close()
  }

  useEffect(() => {
    if (!editing) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editing])

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
        {blocks.map((block, i) => {
          const options = blockDescriptions(block).filter(d => d.trim() !== '')
          return (
            <button
              key={i}
              onClick={() => openExisting(i)}
              title={describeBlock(block)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-neutral-700 bg-neutral-800 text-sm text-neutral-200 hover:bg-neutral-700 hover:border-neutral-600 transition-colors cursor-pointer"
            >
              {block.name}
              {options.length > 1 && (
                <span
                  title={`One of these ${options.length} options is picked at random for each experiment.`}
                  className="rounded-full bg-neutral-700 px-1.5 text-[11px] leading-4 text-neutral-300"
                >
                  {options.length}
                </span>
              )}
            </button>
          )
        })}
        <button
          onClick={openNew}
          aria-label="Add a block"
          className="px-8 py-1.5 rounded-md border border-dashed border-neutral-700 bg-neutral-900 text-sm text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer"
        >
          +
        </button>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={editing.index === null ? 'Add a block' : `Edit ${blocks[editing.index]?.name}`}
            className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 p-5 space-y-4 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <label className="text-lg font-semibold tracking-tight">Block Name</label>
              <button
                onClick={close}
                aria-label="Close"
                className="text-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer leading-none text-lg"
              >
                ✕
              </button>
            </div>
            <input
              autoFocus
              type="text"
              value={editing.name}
              onChange={e => setEditing({ ...editing, name: e.target.value })}
              placeholder="Debate Topic"
              className="w-full px-3 py-2 rounded-md border border-neutral-700 bg-neutral-800 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
            />

            <div className="space-y-1">
              <label className="block text-lg font-semibold tracking-tight">Block Description</label>
              <p className="text-sm text-neutral-500">
                One option will be randomly selected and sent to the LLM.
              </p>
            </div>

            <div className="space-y-3">
              {editing.descriptions.map((description, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-400">Option {i + 1}</span>
                    {/* The last option is the block's only text, so it stays. */}
                    {editing.descriptions.length > 1 && (
                      <button
                        onClick={() => removeOption(i)}
                        aria-label={`Remove option ${i + 1}`}
                        className="text-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer leading-none"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={5}
                    value={description}
                    onChange={e => setDescription(i, e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-neutral-700 bg-neutral-800 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 resize-y"
                  />
                </div>
              ))}
              <button
                onClick={addOption}
                className="w-full px-3 py-2.5 rounded-md border border-neutral-700 bg-neutral-800 text-base text-neutral-200 hover:bg-neutral-700 hover:border-neutral-600 transition-colors cursor-pointer"
              >
                + Add Option
              </button>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={remove}
                disabled={editing.index === null}
                className="px-5 py-2 rounded-md border border-neutral-700 bg-neutral-800 text-sm text-neutral-300 hover:bg-neutral-700 hover:border-neutral-600 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Remove
              </button>
              <button
                onClick={save}
                disabled={!editing.name.trim()}
                title="Applies this block to the simulation being edited — click Save at the top of the page to persist it."
                className="px-5 py-2 rounded-md border border-neutral-700 bg-neutral-800 text-sm text-neutral-100 hover:bg-neutral-700 hover:border-neutral-600 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
