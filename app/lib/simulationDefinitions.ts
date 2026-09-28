import * as yaml from 'js-yaml'
import { API_BASE } from './config'
import { MEDIATOR_PREFIX, summarizePairing, type Pairing } from '../components/PairingsEditor'

// A simulation file carries the agents, mediators and assistants its pairings
// pick, so one YAML is enough to rebuild the same experiment on another account.
// Pairings still reference them by library id; `definitions` holds the body of
// each referenced id under that same id.
//
// The user's library stays the source of truth for every id it holds: whenever
// the simulation is opened, focused, saved, downloaded or run, those entries are
// re-read from the library, so an edit made in the Agent tab shows up here
// without the simulation being written to from anywhere else. An id the library
// does not hold — a file from someone else, or an agent deleted since — runs
// from the copy embedded here.

export type DefinitionKind = 'agents' | 'mediators' | 'assistants'

export const DEFINITION_KINDS: DefinitionKind[] = ['agents', 'mediators', 'assistants']

export const KIND_COLLECTION = {
  agents: 'agents',
  mediators: 'mediators',
  assistants: 'assistants-reddit',
} as const satisfies Record<DefinitionKind, string>

const KIND_LABEL: Record<DefinitionKind, string> = {
  agents: 'agent',
  mediators: 'mediator',
  assistants: 'assistant',
}

// `content` is the template body as a YAML tree rather than the string the
// library stores, so the file reads and diffs like any other YAML.
export type Definition = { name: string; content: unknown }
export type Definitions = Record<DefinitionKind, Record<string, Definition>>

// What the library holds for each referenced id; null when it holds nothing
// under that id (or could not be reached, which is treated the same way so the
// embedded copy keeps working).
export type LibrarySnapshot = Record<DefinitionKind, Record<string, { name: string; content: string } | null>>

export type DefinitionRef = { kind: DefinitionKind; id: string }

// A simulation file as the editor holds it; only the keys read here are typed.
export type SimulationData = { pairings?: Pairing[]; definitions?: unknown; [key: string]: unknown }

export function emptyDefinitions(): Definitions {
  return { agents: {}, mediators: {}, assistants: {} }
}

export function readDefinitions(data: { definitions?: unknown }): Definitions {
  const raw = (data?.definitions ?? {}) as Partial<Record<DefinitionKind, unknown>>
  const out = emptyDefinitions()
  for (const kind of DEFINITION_KINDS) {
    const entries = raw[kind]
    if (!entries || typeof entries !== 'object') continue
    for (const [id, def] of Object.entries(entries as Record<string, Partial<Definition>>)) {
      if (def && def.content != null) out[kind][id] = { name: String(def.name ?? id), content: def.content }
    }
  }
  return out
}

// Library bodies are JSON strings, but a hand-written file may hold YAML.
export function parseContent(content: string): unknown {
  try { return JSON.parse(content) } catch { /* not JSON */ }
  try { return yaml.load(content) } catch { return content }
}

// The string create-experiment expects: the agent parser only reads JSON, and
// the mediator and assistant parsers read YAML, which JSON also is.
export function contentString(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content)
}

export function sameContent(a: unknown, b: unknown): boolean {
  return contentString(a) === contentString(b)
}

export function referencedIds(pairings: Pairing[]): Record<DefinitionKind, string[]> {
  const sets = { agents: new Set<string>(), mediators: new Set<string>(), assistants: new Set<string>() }
  for (const p of pairings) {
    const { agentIds, seatAssistantIds, mediatorId } = summarizePairing(p)
    agentIds.forEach(id => sets.agents.add(id))
    seatAssistantIds.forEach(id => { if (id) sets.assistants.add(id) })
    if (mediatorId) sets.mediators.add(mediatorId)
  }
  return {
    agents: [...sets.agents].sort(),
    mediators: [...sets.mediators].sort(),
    assistants: [...sets.assistants].sort(),
  }
}

async function loadFromLibrary(kind: DefinitionKind, id: string, token: string) {
  try {
    const res = await fetch(
      `${API_BASE}/api/templates/load?collection=${KIND_COLLECTION[kind]}&id=${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return null
    const data = await res.json()
    return typeof data.content === 'string' ? { name: String(data.name ?? id), content: data.content as string } : null
  } catch {
    return null
  }
}

export async function fetchLibrary(refs: Record<DefinitionKind, string[]>, token: string): Promise<LibrarySnapshot> {
  const snapshot: LibrarySnapshot = { agents: {}, mediators: {}, assistants: {} }
  await Promise.all(DEFINITION_KINDS.flatMap(kind => refs[kind].map(async id => {
    snapshot[kind][id] = await loadFromLibrary(kind, id, token)
  })))
  return snapshot
}

/**
 * Brings `definitions` in line with the pairings: every referenced id the
 * library holds takes the library's body, every other referenced id keeps the
 * copy already embedded, and ids no pairing references any more are dropped.
 * Only ids present in `library` are refreshed, so a snapshot taken before a new
 * pick never erases what the pick needs.
 */
export function withLibraryDefinitions<T extends { pairings?: Pairing[]; definitions?: unknown }>(
  data: T,
  library: LibrarySnapshot,
): T & { definitions: Definitions } {
  const refs = referencedIds(data.pairings ?? [])
  const current = readDefinitions(data)
  const next = emptyDefinitions()
  for (const kind of DEFINITION_KINDS) {
    for (const id of refs[kind]) {
      const fromLibrary = library[kind][id]
      if (fromLibrary) next[kind][id] = { name: fromLibrary.name, content: parseContent(fromLibrary.content) }
      else if (current[kind][id]) next[kind][id] = current[kind][id]
    }
  }
  return { ...data, definitions: next }
}

// Referenced ids with neither a library entry nor an embedded copy — the run
// would have nothing to build them from.
export function missingDefinitions(data: { pairings?: Pairing[]; definitions?: unknown }): DefinitionRef[] {
  const refs = referencedIds(data.pairings ?? [])
  const defs = readDefinitions(data)
  return DEFINITION_KINDS.flatMap(kind => refs[kind].filter(id => !defs[kind][id]).map(id => ({ kind, id })))
}

export function describeRefs(refs: DefinitionRef[]): string {
  return refs.map(r => `${KIND_LABEL[r.kind]} "${r.id}"`).join(', ')
}

/**
 * The template payload create-experiment expects, built from the embedded
 * definitions only, so a run uses exactly what the file says.
 *
 * `agentTemplates` is positional against the agent slots and
 * `assistantTemplates` against the seats (see `summarizePairing`). A pick with
 * no definition is an error rather than a quiet fall-back to the stock
 * template, which would run a different experiment than the one shared.
 */
export function templatesForPairing(pairing: Pairing, definitions: Definitions) {
  const { agentIds, seatAssistantIds, mediatorId, hasMediator } = summarizePairing(pairing)
  const missing: DefinitionRef[] = []
  const body = (kind: DefinitionKind, id: string) => {
    const def = definitions[kind][id]
    if (!def) { missing.push({ kind, id }); return null }
    return contentString(def.content)
  }
  const agentTemplates = agentIds.map(id => body('agents', id))
  const assistantTemplates = seatAssistantIds.map(id => (id ? body('assistants', id) : null))
  const mediatorTemplate = mediatorId ? body('mediators', mediatorId) : null
  return {
    missing,
    agentTemplates,
    assistantTemplates,
    mediatorTemplate,
    // A legacy mediator placeholder names no template, so it runs the stock one.
    mediator: mediatorTemplate ? 'template' : hasMediator ? 'preset' : 'none',
  }
}

// Replaces ids inside the pairings, for definitions that were saved into the
// library under a different id than the file used.
export function renameInPairings(pairings: Pairing[], kind: DefinitionKind, from: string, to: string): Pairing[] {
  return pairings.map(p => ({
    ...p,
    members: p.members.map(m => {
      if (kind === 'assistants') return m.assistant === from ? { ...m, assistant: to } : m
      if (kind === 'mediators') return m.participant === `${MEDIATOR_PREFIX}${from}` ? { ...m, participant: `${MEDIATOR_PREFIX}${to}` } : m
      return m.participant === from ? { ...m, participant: to } : m
    }),
  }))
}

// Saves an embedded definition into the library as a new entry, numbering the
// name until it is free. Returns the id the library gave it.
export async function addToLibrary(kind: DefinitionKind, def: Definition, token: string): Promise<string | null> {
  for (let n = 1; n <= 20; n++) {
    const name = n === 1 ? def.name : `${def.name} (${n})`
    const res = await fetch(`${API_BASE}/api/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ collection: KIND_COLLECTION[kind], name, content: contentString(def.content) }),
    })
    if (res.status === 409) continue
    if (!res.ok) return null
    return (await res.json()).id ?? null
  }
  return null
}
