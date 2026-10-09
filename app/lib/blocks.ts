'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import { API_BASE } from './config'

// One named chunk of the conversation description, authored in the Simulation
// Toolkit's Block Customization panel. Mirrors `SimulationBlock` in
// api/create-experiment/parsers/simulation.ts.
//
// A block holds one or more alternative descriptions: whenever an experiment is
// created, one of them is drawn at random and used everywhere that block
// appears in that experiment (see `pickBlockDescription` in
// api/create-experiment/utils.ts).
export type Block = { name: string; descriptions: string[] }

// Blocks every new simulation starts with. They behave exactly like custom
// blocks — clicking one opens the same editor, and it can be edited or removed.
export const DEFAULT_BLOCKS: Block[] = [
  { name: 'Debate Topic', descriptions: ['The topic of the debate.'] },
]

/**
 * Reads the options off anything block-shaped.
 *
 * Simulations and prompt items saved before a block could hold several options
 * carry a single `description` string, so that shape is folded into a one-entry
 * list rather than migrated on disk. Always returns at least one entry so the
 * editor has a textbox to render.
 */
export function blockDescriptions(raw: unknown): string[] {
  const b = raw as { descriptions?: unknown; description?: unknown } | null
  const list = Array.isArray(b?.descriptions)
    ? b!.descriptions
    : b?.description != null ? [b.description] : []
  const out = list.map((d: unknown) => String(d ?? ''))
  return out.length > 0 ? out : ['']
}

export function normalizeBlock(raw: unknown): Block {
  return { name: String((raw as Block)?.name ?? '').trim(), descriptions: blockDescriptions(raw) }
}

// One-line-per-option summary, used wherever a block is only hinted at (chip
// tooltips, the "Add item" menu) so the alternatives are visible without
// opening the editor.
export function describeBlock(block: Block): string {
  const options = blockDescriptions(block).filter(d => d.trim() !== '')
  if (options.length <= 1) return options[0] ?? ''
  return options.map((d, i) => `Option ${i + 1}: ${d}`).join('\n\n')
}

export type SimulationSummary = { id: string; name: string }

// Fired by the Simulation Toolkit whenever a save lands, so the other pages
// re-read blocks right then instead of on their next mount or focus — a save
// that finishes just after navigating would otherwise be missed. The window
// event covers this tab; the BroadcastChannel covers other open tabs.
const SIMULATION_SAVED_EVENT = 'simulation-saved'
const SIMULATION_CHANNEL = 'public-assistant-toolkit:simulations'

export function announceSimulationSaved() {
  window.dispatchEvent(new Event(SIMULATION_SAVED_EVENT))
  try {
    const channel = new BroadcastChannel(SIMULATION_CHANNEL)
    channel.postMessage(SIMULATION_SAVED_EVENT)
    channel.close()
  } catch { /* BroadcastChannel unsupported */ }
}

function parseBlocks(content: string): Block[] {
  try {
    const data = JSON.parse(content)
    if (!Array.isArray(data?.blocks)) return []
    return data.blocks
      .map(normalizeBlock)
      .filter((b: Block) => b.name !== '')
  } catch {
    return []
  }
}

/**
 * Reads the blocks of one saved simulation so the public assistant and agent-participant
 * prompt editors can offer them under "Add item".
 *
 * Blocks live inside the simulation document rather than in a library of their
 * own, so this goes through the existing simulation endpoints: list them, then
 * load whichever one is selected (the most recently updated by default). A
 * simulation only becomes visible here once it has been saved, so the list is
 * refreshed whenever the tab regains focus — that is how edits made in another
 * tab show up without a reload.
 */
export function useSimulationBlocks() {
  const [simulations, setSimulations] = useState<SimulationSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rawBlocks, setBlocks] = useState<Block[]>([])
  // The selected simulation as saved, for pages that run against it (the
  // private assistant toolkit takes its topic from here). Null until one has loaded.
  const [content, setContent] = useState<string | null>(null)
  const [signedIn, setSignedIn] = useState(false)
  // Whether the simulation list has come back yet, and which simulation the
  // current `rawBlocks` were read from — together they say whether `blocks`
  // is the real answer or still a placeholder.
  const [listed, setListed] = useState(false)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      // Inside the try: getIdToken throws when the token can't be refreshed
      // (offline, or the auth emulator isn't running), and that should surface
      // as `error` rather than as an unhandled rejection.
      const token = await auth.currentUser?.getIdToken()
      if (!token) return
      const res = await fetch(`${API_BASE}/api/simulations`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(`Failed to list saved simulations: ${res.status} ${body.error ?? res.statusText}`)
        return
      }
      const data = await res.json()
      const list: SimulationSummary[] = data.templates ?? []
      setSimulations(list)
      setListed(true)
      // Fall back to the newest simulation when nothing is selected yet, or when
      // the selected one has since been deleted.
      setSelectedId(prev => (prev && list.some(s => s.id === prev) ? prev : list[0]?.id ?? null))
      setError(null)
    } catch (e) {
      const message = `Failed to list saved simulations: ${e instanceof Error ? e.message : String(e)}`
      setError(message)
      console.warn('useSimulationBlocks: listing simulations failed:', e)
    }
  }, [])

  useEffect(() => onAuthStateChanged(auth, user => {
    setSignedIn(!!user)
    if (user) refresh()
    else { setSimulations([]); setSelectedId(null); setBlocks([]); setContent(null); setListed(false); setLoadedFor(null) }
  }), [refresh])

  useEffect(() => {
    if (!signedIn) return
    const handler = () => refresh()
    window.addEventListener('focus', handler)
    return () => window.removeEventListener('focus', handler)
  }, [signedIn, refresh])

  useEffect(() => {
    if (!signedIn) return
    const handler = () => refresh()
    window.addEventListener(SIMULATION_SAVED_EVENT, handler)
    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel(SIMULATION_CHANNEL)
      channel.onmessage = handler
    } catch { /* BroadcastChannel unsupported */ }
    return () => {
      window.removeEventListener(SIMULATION_SAVED_EVENT, handler)
      channel?.close()
    }
  }, [signedIn, refresh])

  // Next's client router can reuse an already-rendered instance of a page you
  // navigate back to via <Link> rather than remounting it, so the mount-time
  // refresh above only ever fires once per page per session. `usePathname`
  // stays live even when the surrounding component isn't remounted, so this
  // re-fetches every time the URL actually changes — e.g. after saving a
  // block on /simulation and switching to /agent-participant.
  const pathname = usePathname()
  useEffect(() => {
    if (signedIn) refresh()
  }, [pathname, signedIn, refresh])

  useEffect(() => {
    if (!selectedId) { setBlocks([]); setContent(null); return }
    let cancelled = false
    ;(async () => {
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token || cancelled) return
        const res = await fetch(`${API_BASE}/api/simulations/load?id=${encodeURIComponent(selectedId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (cancelled) return
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setError(`Failed to load simulation blocks: ${res.status} ${body.error ?? res.statusText}`)
          return
        }
        const data = await res.json()
        if (!cancelled) { setBlocks(parseBlocks(data.content)); setContent(data.content); setLoadedFor(selectedId); setError(null) }
      } catch (e) {
        if (!cancelled) setError(`Failed to load simulation blocks: ${e instanceof Error ? e.message : String(e)}`)
        console.warn('useSimulationBlocks: loading simulation failed:', e)
      }
    })()
    return () => { cancelled = true }
  }, [selectedId, simulations])

  // Every simulation starts from DEFAULT_BLOCKS (see simulation/page.tsx), so
  // until the user has saved one of their own, that starting set is the
  // truthful answer to "what blocks are available" — not "none". Once a real
  // saved simulation is selected, its own blocks (even an empty list, if the
  // user deliberately cleared it) take over completely.
  const usingDefaultBlocks = simulations.length === 0
  const blocks = rawBlocks.length > 0 ? rawBlocks : (usingDefaultBlocks ? DEFAULT_BLOCKS : [])

  // True once `blocks` reflects the selected simulation, so an editor can tell
  // "this block was deleted" apart from "blocks haven't arrived yet" — even
  // when the simulation now has no blocks at all.
  const blocksLoaded = listed && (simulations.length === 0 || (selectedId !== null && loadedFor === selectedId))

  // Only handed out once it belongs to the selected simulation, so a run never
  // goes out with the previous pick's content while the new one is loading.
  const simulationContent = selectedId !== null && loadedFor === selectedId ? content : null

  return { blocks, blocksLoaded, usingDefaultBlocks, simulations, selectedId, setSelectedId, refresh, error, simulationContent }
}
