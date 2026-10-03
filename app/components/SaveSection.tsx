'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { auth } from '../lib/firebase'
import { API_BASE } from '../lib/config'
import { TemplateNameModal } from './TemplateNameModal'
import { useAutoSave, useSaveOnLeave } from '../lib/saveOnLeave'
import { readDraft, writeDraft } from '../lib/drafts'

// What survives navigating away: which template was open, plus its unsaved
// content when there is any.
type SaveSectionDraft = { activeId: string; content: string | null }

export type SavedTemplateItem = { id: string; name: string; updatedAt: string | null }

export interface SaveSectionProps {
  collection: 'mediators' | 'assistants' | 'assistants-reddit' | 'assistants-simulation' | 'agents' | 'simulations'
  content: string | null
  onContentChange: (content: string) => void
  getDefaultContent: () => Promise<string>
  onDirtyChange?: (dirty: boolean) => void
  enabled: boolean
  // What is being saved, in the labels and messages ("template" by default).
  noun?: string
  // Name of the item created for a user who has none yet.
  defaultName?: string
  // Brings loaded content up to the shape the page edits (older saves).
  normalize?: (content: string) => string
  // Runs after every successful save or create.
  onSaved?: () => void
  // Runs after an item is opened, whether on first load, a switch or a create.
  onLoaded?: () => void
}

export function SaveSection({
  collection,
  content,
  onContentChange,
  getDefaultContent,
  onDirtyChange,
  enabled,
  noun = 'template',
  defaultName = 'My Template',
  normalize = content => content,
  onSaved,
  onLoaded,
}: SaveSectionProps) {
  const [items, setItems] = useState<SavedTemplateItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeName, setActiveName] = useState<string>('')
  const [lastSavedContent, setLastSavedContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showSaveAlert, setShowSaveAlert] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const bootstrapped = useRef(false)
  const draftScope = `template:${collection}`

  const isDirty = content !== null && content !== lastSavedContent
  // The content on screen right now, so a save that finishes after more typing
  // can tell it would overwrite those edits.
  const contentRef = useRef(content)
  useLayoutEffect(() => { contentRef.current = content })

  useEffect(() => { onDirtyChange?.(isDirty) }, [isDirty])

  // Keep the open template and any unsaved edits in the draft, so coming back
  // to this page picks up exactly where it was left.
  useEffect(() => {
    if (!activeId) return
    writeDraft<SaveSectionDraft>(draftScope, { activeId, content: isDirty ? content : null })
  }, [draftScope, activeId, content, isDirty])
  useEffect(() => { if (isDirty) setShowSaveAlert(false) }, [isDirty])

  async function authHeader(): Promise<Record<string, string> | null> {
    const token = await auth.currentUser?.getIdToken()
    if (!token) return null
    return { Authorization: `Bearer ${token}` }
  }

  function applyActive(id: string, name: string, loadedContent: string) {
    const content = normalize(loadedContent)
    setActiveId(id)
    setActiveName(name)
    setLastSavedContent(content)
    onContentChange(content)
    onLoaded?.()
  }

  async function fetchItems(headers: Record<string, string>): Promise<SavedTemplateItem[]> {
    const res = await fetch(`${API_BASE}/api/templates?collection=${collection}`, { headers })
    if (!res.ok) return []
    const data = await res.json()
    return data.templates as SavedTemplateItem[]
  }

  async function loadItem(id: string, headers: Record<string, string>) {
    const res = await fetch(`${API_BASE}/api/templates/load?collection=${collection}&id=${encodeURIComponent(id)}`, { headers })
    if (!res.ok) return null
    return await res.json() as { id: string; name: string; content: string }
  }

  useEffect(() => {
    if (!enabled || bootstrapped.current) return
    bootstrapped.current = true

    async function bootstrap() {
      setLoading(true)
      try {
        const headers = await authHeader()
        if (!headers) return
        const list = await fetchItems(headers)
        if (list.length === 0) {
          const seed = await getDefaultContent()
          const created = await createTemplate(defaultName, seed, headers)
          if (created.ok) {
            setItems([{ id: created.id, name: created.name, updatedAt: null }])
            applyActive(created.id, created.name, created.content)
          }
        } else {
          setItems(list)
          // Reopen the template from the draft if it still exists, otherwise
          // the most recently updated one.
          const draft = readDraft<SaveSectionDraft>(draftScope)
          const target = list.find(it => it.id === draft?.activeId) ?? list[0]
          const loaded = await loadItem(target.id, headers)
          if (loaded) {
            applyActive(loaded.id, loaded.name, loaded.content)
            if (draft?.activeId === loaded.id && draft.content !== null) onContentChange(draft.content)
          }
        }
      } finally {
        setLoading(false)
      }
    }
    bootstrap()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  async function createTemplate(
    name: string,
    seedContent: string,
    headers: Record<string, string>,
  ): Promise<{ ok: true; id: string; name: string; content: string } | { ok: false; error: string }> {
    const res = await fetch(`${API_BASE}/api/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ collection, name, content: seedContent }),
    })
    if (res.ok) {
      const data = await res.json()
      onSaved?.()
      // The server may rewrite the content (agents and assistants get their
      // persona.id set to the new id), so take its copy over ours.
      return { ok: true, id: data.id, name: data.name, content: data.content ?? seedContent }
    }
    const data = await res.json().catch(() => ({}))
    return { ok: false, error: data.message ?? 'Failed to create template.' }
  }

  async function handleSaveContent({ quiet = false } = {}): Promise<boolean> {
    if (!activeId || content === null) return false
    const headers = await authHeader()
    if (!headers) return false
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/templates`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ collection, id: activeId, content }),
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const saved: string = data.content ?? content
        // Take the server's rewrite only if nothing was typed while saving;
        // otherwise the next auto-save sends the newer edits.
        if (saved !== content && contentRef.current === content) onContentChange(saved)
        setLastSavedContent(saved)
        onSaved?.()
        if (!quiet) setShowSaveAlert(true)
        setItems(prev => prev.map(it => it.id === activeId ? { ...it, updatedAt: new Date().toISOString() } : it))
        return true
      }
      return false
    } finally {
      setSaving(false)
    }
  }

  // Saves the open template a moment after the last edit.
  useAutoSave(content, isDirty && !!activeId && !saving, () => handleSaveContent({ quiet: true }))

  // Switching tabs through the Nav saves the open template first.
  useSaveOnLeave(async () => (isDirty && activeId ? handleSaveContent({ quiet: true }) : true))

  async function handleSwitch(id: string) {
    if (id === activeId) return
    if (isDirty) {
      const ok = window.confirm(`You have unsaved changes. Load a different ${noun} and discard them?`)
      if (!ok) return
    }
    const headers = await authHeader()
    if (!headers) return
    const loaded = await loadItem(id, headers)
    if (loaded) applyActive(loaded.id, loaded.name, loaded.content)
  }

  async function handleCreate({ name, sourceId }: { name: string; sourceId?: string }) {
    const headers = await authHeader()
    if (!headers) return { ok: false as const, error: 'Not signed in.' }

    let seedContent: string
    if (sourceId === '__default__' || sourceId === undefined) {
      seedContent = await getDefaultContent()
    } else if (sourceId === activeId && content !== null) {
      seedContent = content
    } else {
      const loaded = await loadItem(sourceId, headers)
      if (!loaded) return { ok: false as const, error: 'Could not load source template.' }
      seedContent = loaded.content
    }

    const result = await createTemplate(name, seedContent, headers)
    if (!result.ok) return result

    setItems(prev => [{ id: result.id, name: result.name, updatedAt: new Date().toISOString() }, ...prev])
    applyActive(result.id, result.name, result.content)
    return { ok: true as const }
  }

  async function handleRename({ name }: { name: string }) {
    if (!activeId) return { ok: false as const, error: 'No active template.' }
    const headers = await authHeader()
    if (!headers) return { ok: false as const, error: 'Not signed in.' }

    const res = await fetch(`${API_BASE}/api/templates`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ collection, id: activeId, name }),
    })
    if (res.ok) {
      setActiveName(name)
      setItems(prev => prev.map(it => it.id === activeId ? { ...it, name } : it))
      return { ok: true as const }
    }
    const data = await res.json().catch(() => ({}))
    return { ok: false as const, error: data.message ?? 'Failed to rename template.' }
  }

  return (
    <div className="space-y-2 rounded-lg border border-neutral-800 p-3">
      <p className="text-xs text-neutral-500">
        You're editing <span className="text-neutral-300 font-medium">{activeName || `a ${noun}`}</span>. Use "+ New" to create another, or switch below.
      </p>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setShowRenameModal(true)}
            disabled={!activeId}
            title={`Rename ${noun}`}
            className="w-6 h-6 shrink-0 flex items-center justify-center rounded text-sm text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ✎
          </button>
          <span
            id="tour-template-name"
            className="truncate text-sm text-neutral-200 font-medium"
            title={activeName}
          >
            {loading ? 'Loading…' : activeName || '—'}
          </span>
        </div>

        <button
          id="tour-new-template"
          type="button"
          onClick={() => setShowCreateModal(true)}
          title={`New ${noun}`}
          className="px-3 py-1.5 rounded-md border border-neutral-700 bg-neutral-900 text-sm text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer"
        >
          + New
        </button>

        <button
          id="tour-save"
          onClick={() => handleSaveContent()}
          disabled={saving || !isDirty || !activeId}
          className={`px-3 py-1.5 rounded-md border text-sm transition-colors cursor-pointer disabled:opacity-50 ${saving
            ? 'border-neutral-700 bg-neutral-900 text-neutral-400'
            : isDirty
              ? 'border-amber-500 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300'
              : 'border-neutral-700 bg-neutral-900 text-neutral-500'
            }`}
        >
          {saving ? 'Saving…' : isDirty ? 'Save *' : 'Saved'}
        </button>

        {items.length > 1 && (
          <select
            defaultValue=""
            onChange={e => {
              if (e.target.value) handleSwitch(e.target.value)
              e.target.value = ''
            }}
            className="px-3 py-1.5 rounded-md border border-neutral-700 bg-neutral-900 text-sm text-neutral-300 hover:border-neutral-500 transition-colors cursor-pointer"
          >
            <option value="" disabled>Switch {noun}…</option>
            {items.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>

      {showSaveAlert && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-emerald-600/40 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300">
          <p>{noun[0].toUpperCase()}{noun.slice(1)} saved!</p>
          <button
            onClick={() => setShowSaveAlert(false)}
            className="text-emerald-400 hover:text-emerald-200 cursor-pointer leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {showCreateModal && (
        <TemplateNameModal
          mode="create"
          existingNames={items.map(i => i.name)}
          sourceOptions={[
            { id: '__default__', label: `Default ${noun[0].toUpperCase()}${noun.slice(1)}` },
            ...items.map(i => ({ id: i.id, label: i.name })),
          ]}
          onSubmit={handleCreate}
          onClose={() => setShowCreateModal(false)}
          noun={noun}
        />
      )}

      {showRenameModal && (
        <TemplateNameModal
          mode="rename"
          initialName={activeName}
          existingNames={items.filter(i => i.id !== activeId).map(i => i.name)}
          onSubmit={handleRename}
          onClose={() => setShowRenameModal(false)}
          noun={noun}
        />
      )}
    </div>
  )
}
