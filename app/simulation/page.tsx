'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { API_BASE } from '../lib/config'
import * as yaml from 'js-yaml'
import { Nav } from '../components/Nav'
import { PairingsEditor, newPairingId, normalizeMembers, summarizePairing, mediatorMember, type Pairing } from '../components/PairingsEditor'
import { BlockCustomization, DEFAULT_BLOCKS, type Block } from '../components/BlockCustomization'
import { normalizeBlock, announceSimulationSaved } from '../lib/blocks'
import { readDraft, writeDraft } from '../lib/drafts'
import { ActionButton, ResultBox, type ActionState } from '../components/ExperimentActions'
import { useSavedAgents } from '../lib/agents'
import { useSavedMediators } from '../lib/mediators'
import { useSavedAssistants } from '../lib/assistants'
import { useAutoSave, useSaveOnLeave } from '../lib/saveOnLeave'
import {
  DEFINITION_KINDS, addToLibrary, describeRefs, fetchLibrary, missingDefinitions, parseContent, readDefinitions,
  referencedIds, renameInPairings, sameContent, templatesForPairing, withLibraryDefinitions,
  type DefinitionKind, type DefinitionRef, type Definitions, type SimulationData,
} from '../lib/simulationDefinitions'

const DEFAULT_SIMULATION = {
  description: '',
  blocks: DEFAULT_BLOCKS,
  max_utterance: 15,
  max_time: 30,
  pairings: [] as Pairing[],
}

// One row of the Simulate Conversation panel: which experiment to run, how many
// times. `experiment` holds a pairing id, so removing a pairing removes exactly
// the rows that referenced it rather than shifting them onto a neighbour.
type SimRun = { experiment: string; repeats: string }

const EMPTY_RUN: SimRun = { experiment: '', repeats: '1' }

// What survives navigating away from this page: which saved simulation was
// open (null for one never saved), plus the unsaved edits on top of it.
type SimulationDraft = {
  lastSavedName: string | null
  simulationData: string | null
  templateName: string
  runs: SimRun[]
}
const DRAFT_SCOPE = 'simulation'

// How many times a single experiment may be run.
const MAX_RUNS = 5

const POLL_INTERVAL_MS = 10000
const MAX_WAIT_TIME_MS = 300000
// The chat time limit the backend falls back to for an all-agent run when the
// simulation sets no max_time (see `isSim` in the generator).
const DEFAULT_CHAT_MINUTES = 9
// Time before the chat starts (profile stage, agents joining — up to 130s) plus
// a little for the last messages to land, on top of the chat's own limit.
const PRE_CHAT_BUFFER_MS = 180000

// One Simulate Conversation result: the experiment it created and, once its
// discussions finish, the export that holds them.
type SimResult = { label: string; state: ActionState; experimentId?: string; export?: unknown }

type SimExport = {
  experiment?: { id?: string }
  cohortMap?: Record<string, { cohort?: { stageUnlockMap?: Record<string, boolean> } }>
  participantMap?: Record<string, { profile?: {
    currentCohortId?: string
    currentStageId?: string
    agentConfig?: { agentId?: string }
    timestamps?: { readyStages?: Record<string, unknown> }
  } }>
  agentParticipantMap?: Record<string, unknown>
}

// How long every participant of a cohort may sit ready in a stage the cohort
// never unlocked before the discussion is reported as stuck. The backend gives
// up on unlocking within seconds, so a minute is well past any honest delay.
const STUCK_AFTER_MS = 60000

// The stage each cohort is stuck in: everyone in it is ready in the same stage,
// yet the cohort never unlocked it, so nothing will ever happen there.
function lockedCohortStages(exp: SimExport): Map<string, string> {
  const byCohort = new Map<string, { stage?: string; ready: boolean }[]>()
  for (const p of Object.values(exp.participantMap ?? {})) {
    const cid = p?.profile?.currentCohortId
    if (!cid) continue
    const stage = p.profile?.currentStageId
    const list = byCohort.get(cid) ?? []
    list.push({ stage, ready: !!(stage && p.profile?.timestamps?.readyStages?.[stage]) })
    byCohort.set(cid, list)
  }
  const locked = new Map<string, string>()
  for (const [cid, list] of byCohort) {
    const stage = list[0]?.stage
    const unlocked = exp.cohortMap?.[cid]?.cohort?.stageUnlockMap?.[stage ?? '']
    if (stage && !unlocked && list.every(p => p.stage === stage && p.ready)) locked.set(cid, stage)
  }
  return locked
}

// Trims an export down to the cohorts that finished, so a run that timed out
// still hands back the discussions it did complete.
function keepFinishedCohorts(exp: SimExport, finished: Set<string>): SimExport {
  const participantMap = Object.fromEntries(
    Object.entries(exp.participantMap ?? {}).filter(([, p]) => finished.has(p?.profile?.currentCohortId ?? '')),
  )
  const usedAgentIds = new Set(
    Object.values(participantMap).map(p => p?.profile?.agentConfig?.agentId).filter(Boolean),
  )
  return {
    ...exp,
    cohortMap: Object.fromEntries(Object.entries(exp.cohortMap ?? {}).filter(([cid]) => finished.has(cid))),
    participantMap,
    agentParticipantMap: Object.fromEntries(
      Object.entries(exp.agentParticipantMap ?? {}).filter(([aid]) => usedAgentIds.has(aid)),
    ),
  }
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Brings a saved simulation up to the shape the editor works in: pairings need
// an id to be referenceable, members need to be participant/assistant pairs
// rather than the bare participant strings older saves hold, and a block holds a
// list of alternative descriptions where it used to hold a single string.
function migrateSimulation(content: string): string {
  try {
    const data = JSON.parse(content)
    if (Array.isArray(data.pairings)) {
      data.pairings = data.pairings.map((p: Pairing) => ({
        ...p,
        id: p?.id ?? newPairingId(),
        members: normalizeMembers(p?.members),
      }))
    }
    if (Array.isArray(data.blocks)) {
      data.blocks = data.blocks.map(normalizeBlock)
    }
    return JSON.stringify(data, null, 2)
  } catch {
    return content
  }
}

// Picker options: the library, plus anything embedded in the simulation that the
// library does not hold, labelled so it is clear the pick lives only in the file.
function pickerOptions(
  library: { id: string; name: string }[],
  definitions: Definitions,
  kind: DefinitionKind,
  value: (id: string) => string,
) {
  const known = new Set(library.map(t => t.id))
  return [
    ...library.map(t => ({ value: value(t.id), label: t.name })),
    ...Object.entries(definitions[kind])
      .filter(([id]) => !known.has(id))
      .map(([id, def]) => ({ value: value(id), label: `${def.name} (this simulation only)` })),
  ]
}

// The backend lays a run out from its seats, but still labels the experiment by
// mode, so a pairing is reported as whichever of the three it most resembles.
function modeForSeats(seats: ('human' | 'agent')[]) {
  if (seats.every(s => s === 'agent')) return 'agent-agent'
  if (seats.every(s => s === 'human')) return 'human-human'
  return 'human-agent'
}

// Reusable label + hint for the conversation parameter fields.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm text-neutral-300">{label}</label>
      {children}
    </div>
  )
}

export default function SimulationPage() {
  const router = useRouter()
  const [authReady, setAuthReady] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  // Agents come from the Agent Participants toolkit, so saving one there makes
  // it selectable in the Pairings below.
  const { agents } = useSavedAgents()

  // Mediators come from the Mediator Toolkit the same way, so a mediator saved
  // there is selectable here without anything else being wired up.
  const { mediators } = useSavedMediators()

  // Assistants come from the Agent Assistant toolkit, and attach to an agent
  // rather than standing in the conversation on their own.
  const { assistants } = useSavedAssistants()

  // saving
  const [savedTemplates, setSavedTemplates] = useState<{ id: string; name: string }[]>([])
  const [templateName, setTemplateName] = useState('Simulation Export 1')
  const [lastSavedContent, setLastSavedContent] = useState<string | null>(null)
  const [lastSavedName, setLastSavedName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showSaveAlert, setShowSaveAlert] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [simulationData, setSimulationData] = useState<string | null>(null)
  const [syncTick, setSyncTick] = useState(0)
  const [showAsYaml, setShowAsYaml] = useState(false)
  const [runs, setRuns] = useState<SimRun[]>([{ experiment: '', repeats: '1' }])
  const [notice, setNotice] = useState<string | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [creating, setCreating] = useState(false)
  // One entry per pairing that was built, in pairing order.
  const [createResults, setCreateResults] = useState<{ label: string; prefix: string; state: ActionState }[]>([])
  // One entry per run row that was submitted, in the order they were listed.
  const [simResults, setSimResults] = useState<SimResult[]>([])
  const [convokitLoading, setConvokitLoading] = useState<number | null>(null)
  // Bumped on every Simulate (and on unmount) so the watchers from an earlier
  // batch stop writing into results that no longer belong to them.
  const simBatchRef = useRef(0)
  useEffect(() => () => { simBatchRef.current++ }, [])
  const simWatching = simResults.some(r => r.state.status === 'loading')

  const isDirty = simulationData !== null && (simulationData !== lastSavedContent || templateName !== lastSavedName)

  const simulationParsed = useMemo(() => {
    try { return JSON.parse(simulationData ?? '') } catch { return null }
  }, [simulationData])

  const pairings: Pairing[] = useMemo(() => simulationParsed?.pairings ?? [], [simulationParsed])
  // A pairing that seats a human cannot be batch-simulated: the conversation
  // waits for somebody to open their link, so it has to be created instead.
  const simulatableCount = useMemo(
    () => pairings.filter(p => summarizePairing(p).humanCount === 0).length,
    [pairings],
  )
  const blocks: Block[] = useMemo(() => simulationParsed?.blocks ?? [], [simulationParsed])

  // Embedded picks the library lacks (a file from someone else, or an entry
  // deleted since) stay selectable, see pickerOptions.
  const definitions = useMemo(() => readDefinitions(simulationParsed ?? {}), [simulationParsed])
  const agentOptions = useMemo(() => pickerOptions(agents, definitions, 'agents', id => id), [agents, definitions])
  const mediatorOptions = useMemo(() => pickerOptions(mediators, definitions, 'mediators', mediatorMember), [mediators, definitions])
  const assistantOptions = useMemo(() => pickerOptions(assistants, definitions, 'assistants', id => id), [assistants, definitions])

  // Re-reads every referenced agent, mediator and assistant from the library
  // and embeds their current bodies, so an edit made in another tab reaches
  // this simulation (and, through autosave, its saved copy). Applied to the
  // latest state rather than the one this call started from, so an edit made
  // while the library was loading is not lost. Resolves to the synced data.
  const simulationRef = useRef(simulationData)
  useEffect(() => { simulationRef.current = simulationData }, [simulationData])
  async function syncDefinitions(): Promise<SimulationData | null> {
    const token = await auth.currentUser?.getIdToken()
    let data: SimulationData
    try { data = JSON.parse(simulationRef.current ?? '') } catch { return null }
    if (!token) return data
    const library = await fetchLibrary(referencedIds(data.pairings ?? []), token)
    setSimulationData(prev => {
      try {
        const next = JSON.stringify(withLibraryDefinitions(JSON.parse(prev ?? ''), library), null, 2)
        return next === prev ? prev : next
      } catch { return prev }
    })
    return withLibraryDefinitions(data, library)
  }

  // Sync whenever the set of picks changes, after a simulation is loaded or
  // imported (`syncTick`), and when the window regains focus (the Agent,
  // Mediator or Assistant tab may have saved in the meantime).
  const refsKey = useMemo(() => JSON.stringify(referencedIds(pairings)), [pairings])
  useEffect(() => {
    if (authReady) void syncDefinitions()
  }, [refsKey, authReady, syncTick])
  useEffect(() => {
    const handler = () => { void syncDefinitions() }
    window.addEventListener('focus', handler)
    return () => window.removeEventListener('focus', handler)
  }, [])

  // Set once the page has been restored from the draft; until then the draft
  // must not be overwritten by the placeholder state the page starts with.
  const draftRestored = useRef(false)

  // `restoreDraft` is only passed on first load: it reopens whatever was being
  // edited before navigating away, instead of the most recently saved one.
  async function fetchSavedTemplates(restoreDraft = false) {
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) { setLoadError('Not signed in — could not load saved simulations.'); return }
      const res = await fetch(`${API_BASE}/api/simulations`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setLoadError(`Failed to list saved simulations: ${res.status} ${body.error ?? res.statusText}`)
        return
      }
      const data = await res.json()
      setSavedTemplates(data.templates)
      const draft = restoreDraft ? readDraft<SimulationDraft>(DRAFT_SCOPE) : null
      const draftBase = draft?.lastSavedName != null
        ? (data.templates as { id: string; name: string }[]).find(t => t.name === draft.lastSavedName)
        : undefined
      // The draft is of a simulation that was never saved, or whose saved copy
      // has since been deleted: bring it back as unsaved.
      if (draft && !draftBase && (draft.lastSavedName === null || draft.simulationData !== null)) {
        if (draft.simulationData !== null) setSimulationData(draft.simulationData)
        setTemplateName(draft.templateName)
        setLastSavedContent(null)
        setLastSavedName(null)
        setRuns(draft.runs?.length ? draft.runs : [EMPTY_RUN])
        setLoadError(null)
        setSyncTick(t => t + 1)
        return
      }
      if (data.count > 0) {
        const first = draftBase ?? data.templates[0]
        const loadRes = await fetch(`${API_BASE}/api/simulations/load?id=${encodeURIComponent(first.id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (loadRes.ok) {
          const loaded = await loadRes.json()
          const content = migrateSimulation(loaded.content)
          setSimulationData(content)
          setTemplateName(loaded.name)
          setLastSavedContent(content)
          setLastSavedName(loaded.name)
          setRuns([EMPTY_RUN])
          setLoadError(null)
          if (draftBase) {
            if (draft!.simulationData !== null) setSimulationData(draft!.simulationData)
            setTemplateName(draft!.templateName)
            if (draft!.runs?.length) setRuns(draft!.runs)
          }
          setSyncTick(t => t + 1)
        } else {
          const body = await loadRes.json().catch(() => ({}))
          setLoadError(`Failed to load "${first.name}": ${loadRes.status} ${body.error ?? loadRes.statusText}`)
        }
      } else {
        setTemplateName('Simulation Export 1')
        setLoadError(null)
      }
    } catch (e) {
      setLoadError(`Failed to load saved simulations: ${e instanceof Error ? e.message : String(e)}`)
      console.warn('fetchSavedTemplates failed:', e)
    } finally {
      if (restoreDraft) draftRestored.current = true
    }
  }

  async function handleSave({ quiet = false } = {}): Promise<boolean> {
    if (!templateName.trim()) return false
    setSaveError(null)
    const token = await auth.currentUser?.getIdToken()
    if (!token) { setSaveError('Not signed in — could not save.'); return false }

    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/simulations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: templateName.trim(), content: simulationData }),
      })
      if (res.ok) {
        setLastSavedContent(simulationData)
        setLastSavedName(templateName.trim())
        announceSimulationSaved()
        if (quiet) return true
        await fetchSavedTemplates()
        setShowSaveAlert(true)
        return true
      }
      const body = await res.json().catch(() => ({}))
      setSaveError(`Save failed: ${res.status} ${body.error ?? res.statusText}`)
      return false
    } catch (e) {
      setSaveError(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
      return false
    } finally {
      setSaving(false)
    }
  }

  // Saves a moment after the last edit. Simulations are stored by name, so
  // this only runs for one already saved under the name in the box — saving
  // mid-rename would leave a template behind for every half-typed name.
  const nameUnchanged = lastSavedName !== null && templateName.trim() === lastSavedName
  useAutoSave(
    simulationData,
    isDirty && nameUnchanged && !saving,
    () => handleSave({ quiet: true }),
  )

  // Switching tabs through the Nav saves the simulation — prompt blocks,
  // pairings and all — before leaving.
  useSaveOnLeave(async () => (isDirty ? handleSave({ quiet: true }) : true))

  async function handleLoad(id: string) {
    if (isDirty) {
      const ok = window.confirm('You have unsaved changes. Load a different simulation and discard them?')
      if (!ok) return
    }
    const token = await auth.currentUser?.getIdToken()
    if (!token) return
    const res = await fetch(`${API_BASE}/api/simulations/load?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const data = await res.json()
    const content = migrateSimulation(data.content)
    setSimulationData(content)
    setTemplateName(data.name)
    setLastSavedContent(content)
    setLastSavedName(data.name)
    setRuns([EMPTY_RUN])
    setSyncTick(t => t + 1)
  }

  function newSimulation() {
    setSimulationData(JSON.stringify(DEFAULT_SIMULATION, null, 2))
    setTemplateName('Simulation Export 1')
    setLastSavedContent(null)
    setLastSavedName(null)
    setRuns([EMPTY_RUN])
  }

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace('/')
      } else {
        setAuthReady(true)
        setUserEmail(user.email)
        setSimulationData(JSON.stringify(DEFAULT_SIMULATION, null, 2))
        fetchSavedTemplates(true)
      }
    })
  }, [router])

  useEffect(() => {
    if (!draftRestored.current || simulationData === null) return
    writeDraft<SimulationDraft>(DRAFT_SCOPE, {
      lastSavedName,
      simulationData: isDirty ? simulationData : null,
      templateName,
      runs,
    })
  }, [simulationData, isDirty, lastSavedName, templateName, runs])

  // Blocks are what the mediator / agent-participant / assistant editors read
  // from the saved simulation, so they are written back even when the full
  // autosave is holding off (see nameUnchanged). Only the blocks go out: they
  // are merged into the last-saved copy, so any other unsaved edits here stay
  // unsaved. A simulation that has never been saved is saved whole under its
  // current name — unless that name already belongs to another saved
  // simulation, which autosave must not silently overwrite.
  const blocksJson = useMemo(() => JSON.stringify(blocks), [blocks])
  const pendingBlockSave = useRef<(() => void) | null>(null)
  useEffect(() => {
    pendingBlockSave.current = null
    if (!authReady || simulationData === null) return
    // The full autosave above already covers a simulation saved under the name
    // in the box; this only fills the gaps it leaves (never saved, or renamed).
    if (lastSavedName !== null && templateName.trim() === lastSavedName) return
    // A fresh simulation nobody has touched the blocks of isn't worth saving.
    if (lastSavedContent === null && blocksJson === JSON.stringify(DEFAULT_BLOCKS)) return
    let base: Record<string, unknown>
    try { base = JSON.parse(lastSavedContent ?? simulationData) } catch { return }
    if (lastSavedContent !== null && JSON.stringify(base.blocks ?? []) === blocksJson) return

    const name = (lastSavedName ?? templateName).trim()
    if (!name) return
    if (lastSavedName === null && savedTemplates.some(t => t.name === name)) return

    base.blocks = JSON.parse(blocksJson)
    const content = lastSavedContent === null ? simulationData : JSON.stringify(base, null, 2)

    const save = async () => {
      pendingBlockSave.current = null
      const token = await auth.currentUser?.getIdToken()
      if (!token) return
      try {
        const res = await fetch(`${API_BASE}/api/simulations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name, content }),
          keepalive: true,
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setSaveError(`Autosaving blocks failed: ${res.status} ${body.error ?? res.statusText}`)
          return
        }
        const { id } = await res.json()
        announceSimulationSaved()
        setLastSavedContent(content)
        setLastSavedName(name)
        setSavedTemplates(prev => (prev.some(t => t.id === id) ? prev : [{ id, name }, ...prev]))
      } catch (e) {
        setSaveError(`Autosaving blocks failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    pendingBlockSave.current = save
    const timer = setTimeout(save, 800)
    return () => clearTimeout(timer)
  }, [blocksJson, authReady, simulationData, lastSavedContent, lastSavedName, templateName, savedTemplates])

  // Leaving the page inside the debounce window still gets the edit saved.
  useEffect(() => () => { pendingBlockSave.current?.() }, [])

  useEffect(() => {
    if (isDirty) setShowSaveAlert(false)
  }, [isDirty])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const updateRun = (index: number, patch: Partial<SimRun>) =>
    setRuns(runs.map((run, i) => (i === index ? { ...run, ...patch } : run)))

  // Deleting an experiment also deletes the Simulate Conversation rows that ran it.
  const updatePairings = (next: Pairing[]) => {
    updateSimulationField('pairings', next)
    const ids = new Set(next.map(p => p.id))
    setRuns(prev => prev.filter(run => run.experiment === '' || ids.has(run.experiment)))
  }

  const updateSimulationField = (key: string, value: string | number | Pairing[] | Block[]) => {
    setSimulationData(prev => {
      try {
        const data = JSON.parse(prev ?? '')
        data[key] = value
        return JSON.stringify(data, null, 2)
      } catch { return prev }
    })
  }

  // What create-experiment reads as the simulation template. The definitions
  // travel separately as per-slot templates, so they are left out here.
  function simulationYaml(data: SimulationData): string {
    const rest = { ...data }
    delete rest.definitions
    return yaml.dump(rest)
  }

  // Syncs with the library and checks that every pick has a body to run from.
  // Returns null (with the reason shown) when the run cannot go ahead.
  async function syncedForRun(): Promise<SimulationData | null> {
    const data = await syncDefinitions()
    if (!data) return null
    const missing = missingDefinitions(data)
    if (missing.length > 0) {
      setNotice(`Not in your library and not embedded in this simulation: ${describeRefs(missing)}. Pick a replacement in Pairings, or import a simulation file that includes it.`)
      return null
    }
    return data
  }

  // Each selected row becomes its own experiment: the pairing decides how many
  // agents talk and whether a mediator joins, and "Runs" becomes the cohort
  // count, so one row repeated N times is N cohorts of the same setup.
  async function handleSimulate() {
    const queued = runs
      .map(run => ({ run, pairingIndex: pairings.findIndex(p => p.id === run.experiment) }))
      .filter(({ pairingIndex }) => pairingIndex >= 0)

    if (queued.length === 0) {
      setNotice('Pick an experiment to run first.')
      return
    }

    // Nobody is around to open a human's link during a batch run, so the cohort
    // would sit empty until it timed out.
    const withHuman = queued.find(({ pairingIndex }) => summarizePairing(pairings[pairingIndex]).humanCount > 0)
    if (withHuman) {
      setNotice(`Experiment ${withHuman.pairingIndex + 1} seats a human, so it cannot be simulated in batch — use Create to get its join link.`)
      return
    }

    // A conversation needs at least two agents; the backend has no one to pair
    // the lone agent with otherwise.
    const short = queued.find(({ pairingIndex }) => summarizePairing(pairings[pairingIndex]).agentCount < 2)
    if (short) {
      setNotice(`Experiment ${short.pairingIndex + 1} needs at least 2 agents to simulate.`)
      return
    }

    const idToken = await auth.currentUser?.getIdToken()
    if (!idToken) return

    const data = await syncedForRun()
    if (!data) return
    const runDefinitions = readDefinitions(data)
    const simulationTemplate = simulationYaml(data)
    const batch = ++simBatchRef.current
    // Wait at least as long as the chat is allowed to run, or a healthy
    // conversation longer than the shared wait limit gets reported as timed out.
    const maxTime = Number(simulationParsed?.max_time)
    const chatMinutes = Number.isFinite(maxTime) && maxTime >= 1 ? maxTime : DEFAULT_CHAT_MINUTES
    const maxWaitMs = Math.max(await fetchSimMaxWaitMs(idToken), chatMinutes * 60000 + PRE_CHAT_BUFFER_MS)
    setNotice(null)
    setSimResults([])
    setSimulating(true)
    let appended = 0
    try {
      for (const { run, pairingIndex } of queued) {
        const { agentCount, seats } = summarizePairing(pairings[pairingIndex])
        const { agentTemplates, assistantTemplates, mediatorTemplate, mediator } =
          templatesForPairing(pairings[pairingIndex], runDefinitions)
        const label = `Experiment ${pairingIndex + 1}`
        let entry: SimResult
        try {
          const res = await fetch(`${API_BASE}/api/create-experiment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              simulationTemplate,
              mediator,
              mediatorTemplate,
              agentTemplates,
              assistantTemplates,
              // Laid out from the same seats Create uses, so Simulate runs the
              // very setup Create would build, only batched into cohorts.
              seats,
              numAgents: agentCount,
              mode: 'agent-agent',
              action: 'simulate',
              numCohorts: run.repeats || '1',
              idToken,
            }),
          })
          const data = await res.json()
          const experimentId: string | undefined = res.ok ? data?.experiment_id : undefined
          entry = experimentId
            ? { label, experimentId, state: { status: 'loading', result: { message: 'Simulation running — waiting for agents to finish', experiment_id: experimentId } } }
            : { label, state: { status: 'error', result: data } }
        } catch (e) {
          entry = { label, state: { status: 'error', result: String(e) } }
        }
        if (simBatchRef.current !== batch) return
        // Results were cleared above and are only ever appended here, so the
        // count so far is this entry's position.
        const index = appended++
        setSimResults(prev => [...prev, entry])
        if (entry.experimentId) void watchSimulation(batch, index, entry.experimentId, maxWaitMs)
      }
    } finally {
      setSimulating(false)
    }
  }

  async function fetchSimMaxWaitMs(idToken: string): Promise<number> {
    try {
      const res = await fetch(`${API_BASE}/api/quota`, { headers: { Authorization: `Bearer ${idToken}` } })
      if (!res.ok) return MAX_WAIT_TIME_MS
      return (await res.json()).simMaxWaitTimeMs ?? MAX_WAIT_TIME_MS
    } catch {
      return MAX_WAIT_TIME_MS
    }
  }

  // Polls one created experiment until every discussion in it ends, then keeps
  // its export for download. On timeout the export keeps only the discussions
  // that did finish.
  async function watchSimulation(batch: number, index: number, experimentId: string, maxWaitMs: number) {
    const update = (patch: Partial<SimResult>) => {
      if (simBatchRef.current !== batch) return
      setSimResults(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    }
    const deadline = Date.now() + maxWaitMs
    let lastExport: SimExport | null = null
    let finished = new Set<string>()
    let total = 0
    // When each cohort was first seen waiting in a stage it never unlocked.
    const lockedSince = new Map<string, number>()

    while (Date.now() < deadline) {
      await wait(POLL_INTERVAL_MS)
      if (simBatchRef.current !== batch) return
      try {
        const res = await fetch(`${API_BASE}/api/simulation-status?experimentId=${encodeURIComponent(experimentId)}`)
        const status = await res.json()
        if (!res.ok) { update({ state: { status: 'error', result: status } }); return }

        lastExport = status.export
        const statuses = Object.entries((status.statuses ?? {}) as Record<string, string[]>)
        total = statuses.length
        finished = new Set(statuses.filter(([, ss]) => ss.length > 0 && ss.every(s => s === 'SUCCESS')).map(([cid]) => cid))

        if (status.completed) {
          update({
            export: status.export,
            state: { status: 'done', result: { message: `Simulation complete — ${total} discussion${total === 1 ? '' : 's'}`, experiment_id: experimentId } },
          })
          return
        }

        // A cohort whose stage never unlocked will never finish, so waiting out
        // the full timeout only hides what went wrong. Once every cohort has
        // either finished or been stuck for a while, stop and say so.
        const locked = lockedCohortStages(status.export ?? {})
        for (const cid of lockedSince.keys()) if (!locked.has(cid)) lockedSince.delete(cid)
        for (const cid of locked.keys()) if (!lockedSince.has(cid)) lockedSince.set(cid, Date.now())
        const stuck = [...locked.keys()].filter(cid => Date.now() - lockedSince.get(cid)! >= STUCK_AFTER_MS)
        if (stuck.length > 0 && finished.size + stuck.length >= total) {
          const stages = [...new Set(stuck.map(cid => locked.get(cid)))].join(', ')
          const reason = `the backend never unlocked stage "${stages}" although every participant was waiting in it`
          if (finished.size > 0 && lastExport) {
            update({
              export: keepFinishedCohorts(lastExport, finished),
              state: { status: 'done', result: { message: `${finished.size}/${total} discussions finished; ${stuck.length} never started because ${reason}. The download holds the finished ones only.`, experiment_id: experimentId } },
            })
          } else {
            update({ state: { status: 'error', result: { message: `The discussion never started: ${reason}. Try simulating again.`, experiment_id: experimentId } } })
          }
          return
        }

        update({ state: { status: 'loading', result: { message: `Simulation running: ${finished.size}/${total} discussions finished`, experiment_id: experimentId } } })
      } catch (e) {
        update({ state: { status: 'error', result: String(e) } })
        return
      }
    }

    if (lastExport && finished.size > 0) {
      update({
        export: keepFinishedCohorts(lastExport, finished),
        state: { status: 'done', result: { message: `Timed out: ${finished.size}/${total} discussions finished — the download holds the finished ones only`, experiment_id: experimentId } },
      })
      return
    }
    update({ state: { status: 'error', result: { message: 'Timed out waiting for the simulation to finish.', experiment_id: experimentId } } })
  }

  function downloadSimExport(result: SimResult) {
    const id = (result.export as SimExport)?.experiment?.id ?? result.experimentId ?? 'export'
    downloadBlob(new Blob([JSON.stringify(result.export, null, 2)], { type: 'application/json' }), `simulation-${id}.json`)
  }

  async function downloadSimConvokit(index: number, result: SimResult) {
    setConvokitLoading(index)
    try {
      const res = await fetch(`${API_BASE}/api/convokit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.export),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`ConvoKit conversion failed: ${err.error ?? res.statusText}`)
        return
      }
      const id = (result.export as SimExport)?.experiment?.id ?? result.experimentId ?? 'export'
      downloadBlob(await res.blob(), `convokit-${id}.zip`)
    } catch (e) {
      alert(`ConvoKit conversion error: ${String(e)}`)
    } finally {
      setConvokitLoading(null)
    }
  }

  // Builds one cohort per pairing and hands back one link per seat, rather than
  // running a batch: an agent's link watches it play its part, a human's link is
  // the one you send to whoever is sitting in that seat. Unlike Simulate it
  // spends no quota, so it is the cheap way to eyeball every setup at once, and
  // it is the only way to run a pairing that seats a human. It still needs the
  // signed-in user's token to read the agents and mediators they picked.
  async function handleCreate() {
    const eligible = pairings
      .map((pairing, index) => ({ index, ...summarizePairing(pairing) }))
      .filter(p => p.seats.length >= 2)

    if (eligible.length === 0) {
      setNotice(
        pairings.length === 0
          ? 'Add an experiment under Pairings first.'
          : 'Create needs an experiment with at least 2 participants.',
      )
      return
    }

    // Pairings too small to hold a conversation are skipped rather than
    // blocking the ones that can run.
    const skipped = pairings.length - eligible.length
    setNotice(skipped > 0
      ? `Skipping ${skipped} experiment${skipped === 1 ? '' : 's'} with fewer than 2 participants.`
      : null)

    const idToken = await auth.currentUser?.getIdToken()
    if (!idToken) return

    const data = await syncedForRun()
    if (!data) return
    const runDefinitions = readDefinitions(data)
    const simulationTemplate = simulationYaml(data)
    setCreateResults([])
    setCreating(true)
    try {
      for (const { index, seats } of eligible) {
        const { agentTemplates, assistantTemplates, mediatorTemplate, mediator } =
          templatesForPairing(pairings[index], runDefinitions)
        const label = `Create · Experiment ${index + 1}`
        const prefix = `Exp ${index + 1}`
        try {
          const res = await fetch(`${API_BASE}/api/create-experiment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              simulationTemplate,
              mediator,
              mediatorTemplate,
              agentTemplates,
              assistantTemplates,
              // `seats` is what actually lays the run out; `mode` only labels it.
              seats,
              mode: modeForSeats(seats),
              action: 'create',
            }),
          })
          const data = await res.json()
          setCreateResults(prev => [...prev, { label, prefix, state: { status: res.ok ? 'done' : 'error', result: data } }])
        } catch (e) {
          setCreateResults(prev => [...prev, { label, prefix, state: { status: 'error', result: String(e) } }])
        }
      }
    } finally {
      setCreating(false)
    }
  }

  // The file carries every pick's current body, so it rebuilds the same
  // experiment on any account.
  async function downloadSimulation() {
    const data = await syncDefinitions()
    const missing = data ? missingDefinitions(data) : []
    if (missing.length > 0) {
      setNotice(`Downloaded without ${describeRefs(missing)}: not in your library and not embedded, so whoever imports this file cannot run those experiments.`)
    }
    const text = data ? yaml.dump(data) : simulationData ?? ''
    const url = URL.createObjectURL(new Blob([text], { type: 'text/yaml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'simulation.yaml'
    a.click()
    URL.revokeObjectURL(url)
  }

  function loadSimulationFile(file: File) {
    const reader = new FileReader()
    reader.onload = async () => {
      let data: SimulationData
      try {
        data = JSON.parse(migrateSimulation(JSON.stringify(yaml.load(String(reader.result)), null, 2)))
      } catch { return /* ignore invalid yaml */ }
      if (!data || typeof data !== 'object') return
      const token = await auth.currentUser?.getIdToken()
      if (token) data = await reconcileImport(data, token)
      setSimulationData(JSON.stringify(data, null, 2))
      setRuns([EMPTY_RUN])
      setSyncTick(t => t + 1)
    }
    reader.readAsText(file)
  }

  /**
   * Decides, for each definition the imported file embeds, whether the library
   * or the file wins — the library normally does (see syncDefinitions), which
   * would quietly replace what the file was shared with.
   *
   * - The library holds the same id with a different body (an older copy of
   *   your own file, or someone else's agent that slugged to the same id):
   *   ask. Keeping the file's version saves it to the library as a new entry
   *   and points the pairings at that, so the library entry is left alone.
   * - The library does not hold the id: offer to add it, so it can be edited
   *   in its own tab. Declined, it stays embedded and runs from the file.
   */
  async function reconcileImport(data: SimulationData, token: string): Promise<SimulationData> {
    const embedded = readDefinitions(data)
    const library = await fetchLibrary(referencedIds(data.pairings ?? []), token)
    const differs: DefinitionRef[] = []
    const unknown: DefinitionRef[] = []
    for (const kind of DEFINITION_KINDS) {
      for (const [id, def] of Object.entries(embedded[kind])) {
        const lib = library[kind][id]
        if (lib === undefined) continue // no pairing references it
        if (lib === null) unknown.push({ kind, id })
        else if (!sameContent(parseContent(lib.content), def.content)) differs.push({ kind, id })
      }
    }

    const toAdd: DefinitionRef[] = []
    if (differs.length > 0 && window.confirm(
      `This file's version of ${describeRefs(differs)} differs from the one in your library.\n\n`
      + 'OK: run the file\'s version (it is saved to your library as a new copy).\n'
      + 'Cancel: use your library\'s current version.',
    )) toAdd.push(...differs)
    if (unknown.length > 0 && window.confirm(
      `This file includes ${describeRefs(unknown)}, which your library does not have.\n\n`
      + 'OK: add them to your library so you can edit them in their own tabs.\n'
      + 'Cancel: keep them only inside this simulation.',
    )) toAdd.push(...unknown)

    const failed: DefinitionRef[] = []
    let pairings: Pairing[] = data.pairings ?? []
    const definitions = embedded
    for (const ref of toAdd) {
      const def = embedded[ref.kind][ref.id]
      const newId = await addToLibrary(ref.kind, def, token)
      if (!newId) { failed.push(ref); continue }
      if (newId !== ref.id) {
        pairings = renameInPairings(pairings, ref.kind, ref.id, newId)
        delete definitions[ref.kind][ref.id]
      }
      definitions[ref.kind][newId] = def
    }

    const missing = missingDefinitions({ ...data, definitions })
    const problems = [
      failed.length > 0 ? `Could not add ${describeRefs(failed)} to your library; they still run from this file.` : '',
      missing.length > 0 ? `This file references ${describeRefs(missing)} without including them, so experiments that use them cannot run.` : '',
    ].filter(Boolean)
    setNotice(problems.length > 0 ? problems.join(' ') : null)
    return { ...data, pairings, definitions }
  }

  if (!authReady) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-500 text-sm">
      Loading...
    </div>
  )

  return (
    <div className="flex flex-col lg:flex-row lg:h-screen lg:overflow-hidden bg-neutral-950 text-neutral-100">

      {/* Left column — configuration */}
      <div className="lg:flex-3 lg:overflow-y-auto p-8">
        <div className="w-full space-y-5">

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Simulation Toolkit</h1>
              <p className="text-base text-neutral-500 mt-1">Run Simulations</p>
            </div>

            <div className="flex items-center gap-3 mt-1">
              {userEmail && <span className="text-sm text-neutral-400">{userEmail}</span>}
              <button
                onClick={() => {
                  if (isDirty && !window.confirm('You have unsaved changes. Sign out anyway?')) return
                  signOut(auth).then(() => router.replace('/'))
                }}
                className="text-sm px-3 py-1.5 rounded-md border border-neutral-600 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </div>

          <Nav />

          {/* Save / Load */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder="Simulation name"
              className="flex-1 px-3 py-1.5 rounded-md border border-neutral-700 bg-neutral-900 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
            />
            <button
              onClick={() => handleSave()}
              disabled={saving}
              className={`px-3 py-1.5 rounded-md border text-sm transition-colors cursor-pointer disabled:opacity-50 ${saving
                  ? 'border-neutral-700 bg-neutral-900 text-neutral-400'
                  : isDirty
                    ? 'border-amber-500 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300'
                    : 'border-neutral-700 bg-neutral-900 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300'
                }`}
            >
              {saving ? 'Saving…' : isDirty ? 'Save *' : 'Saved'}
            </button>
            <button
              onClick={() => {
                if (window.confirm('Start a new simulation? Any unsaved changes will be lost.')) {
                  newSimulation()
                }
              }}
              className="px-3 py-1.5 rounded-md border border-neutral-700 bg-neutral-900 text-sm text-neutral-500 hover:border-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              New Simulation
            </button>
            {savedTemplates.length > 0 && (
              <select
                defaultValue=""
                onChange={e => {
                  const t = savedTemplates.find(t => t.id === e.target.value)
                  if (t) handleLoad(t.id)
                  e.target.value = ''
                }}
                className="px-3 py-1.5 rounded-md border border-neutral-700 bg-neutral-900 text-sm text-neutral-300 hover:border-neutral-500 transition-colors cursor-pointer"
              >
                <option value="" disabled>Load saved…</option>
                {savedTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          {showSaveAlert && (
            <div className="flex items-start justify-between gap-3 rounded-md border border-emerald-600/40 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300">
              <p>Simulation saved!</p>
              <button
                onClick={() => setShowSaveAlert(false)}
                className="text-emerald-400 hover:text-emerald-200 cursor-pointer leading-none"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          {saveError && (
            <div className="flex items-start justify-between gap-3 rounded-md border border-red-600/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
              <p>{saveError}</p>
              <button
                onClick={() => setSaveError(null)}
                className="text-red-400 hover:text-red-200 cursor-pointer leading-none"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          {loadError && (
            <div className="flex items-start justify-between gap-3 rounded-md border border-red-600/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
              <p>{loadError}</p>
              <button
                onClick={() => setLoadError(null)}
                className="text-red-400 hover:text-red-200 cursor-pointer leading-none"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          {/* Conversation parameters */}
          <div className="space-y-4">
            <div className="border-b border-neutral-800 pb-3">
              <h2 className="text-lg font-semibold tracking-tight">Conversation Parameters</h2>
            </div>

            <Field label="Description of Conversation">
              <textarea
                rows={4}
                value={simulationParsed?.description ?? ''}
                onChange={e => updateSimulationField('description', e.target.value)}
                placeholder="Describe the conversation the agents should have…"
                className="w-full px-3 py-2 rounded-md border border-neutral-700 bg-neutral-900 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 resize-y"
              />
            </Field>

            <Field label="Block Customization">
              <BlockCustomization
                blocks={blocks}
                onUpdate={next => updateSimulationField('blocks', next)}
              />
              <p className="text-xs text-neutral-600">
                Blocks save automatically, so they show up under “Add item” in the other toolkits right away. Other changes still need <span className="text-neutral-400">Save</span>.
              </p>
            </Field>

            <Field label="Max Utterance">
              <input
                type="number"
                min={1}
                value={simulationParsed?.max_utterance ?? ''}
                onChange={e => updateSimulationField('max_utterance', e.target.value === '' ? '' : Number(e.target.value))}
                className="w-40 px-3 py-2 rounded-md border border-neutral-700 bg-neutral-900 text-sm text-neutral-200 focus:outline-none focus:border-neutral-500"
              />
            </Field>

            <Field label="Max Time">
              <input
                type="number"
                min={1}
                value={simulationParsed?.max_time ?? ''}
                onChange={e => updateSimulationField('max_time', e.target.value === '' ? '' : Number(e.target.value))}
                className="w-40 px-3 py-2 rounded-md border border-neutral-700 bg-neutral-900 text-sm text-neutral-200 focus:outline-none focus:border-neutral-500"
              />
            </Field>

            <Field label="Pairings (combination of agents and mediators)">
              <PairingsEditor
                pairings={pairings}
                onUpdate={updatePairings}
                agentOptions={agentOptions}
                mediatorOptions={mediatorOptions}
                assistantOptions={assistantOptions}
              />
            </Field>
          </div>

        </div>
      </div>

      {/* Right column — export & actions */}
      <div className="lg:flex-1 lg:overflow-y-auto p-8 space-y-6 border-t border-neutral-800 lg:border-t-0 lg:border-l">
        {/* YAML preview */}
        <div className="space-y-1">
          <div className="border-b border-neutral-800 pb-3 mb-3">
            <h2 className="text-lg font-semibold tracking-tight">Export Simulation</h2>
          </div>
          <div className="space-y-2 gap-2">
            <button
              onClick={downloadSimulation}
              className="w-full flex items-center justify-center gap-2 text-md px-4 py-2 rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-600 transition-all duration-150 cursor-pointer"
            >
              Download Simulation .yaml File
            </button>
            <label className="w-full flex items-center justify-center gap-2 text-md px-4 py-2 rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-600 transition-all duration-150 cursor-pointer">
              Upload Simulation .yaml File
              <input
                type="file"
                accept=".yaml,.yml"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) loadSimulationFile(f); e.target.value = '' }}
              />
            </label>
          </div>
          <button
            onClick={() => setShowAsYaml(v => !v)}
            className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            {showAsYaml ? '▾ Hide YAML' : '▸ Show YAML'}
          </button>
          {showAsYaml && (
            <textarea
              disabled
              value={(() => { try { return yaml.dump(JSON.parse(simulationData ?? '')) } catch { return simulationData ?? '' } })()}
              className="w-full h-96 p-2 rounded-lg border border-neutral-700 bg-neutral-900 text-sm text-neutral-200 resize-y font-mono"
            />
          )}
        </div>

        {/* Simulation testing */}
        <div className="space-y-3">
          <div className="border-b border-neutral-800 pb-3 mb-3">
            <h2 className="text-lg font-semibold tracking-tight">Simulation Testing</h2>
          </div>
          <div className="space-y-3">
            <p className="text-sm text-neutral-500">
             Test the experiments you have created in the Pairings tab.
            </p>
            <ActionButton
              label="Create"
              loadingLabel="Creating…"
              loading={creating}
              onClick={handleCreate}
            />
            {createResults.map(({ label, prefix, state }, i) => (
              <ResultBox
                key={i}
                title={label}
                state={state}
                linkPrefix={prefix}
                links={state.status === 'done'
                  ? (state.result as { cohorts?: { participant_urls?: { url: string; type: string }[] }[] })
                  : undefined}
              />
            ))}
          </div>
        </div>

        {/* Simulate conversation */}
        <div className="space-y-3">
          <div className="border-b border-neutral-800 pb-3 mb-3">
            <h2 className="text-lg font-semibold tracking-tight">Simulate Conversation</h2>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <span className="flex-1">Experiment</span>
              <span className="w-20">Runs</span>
              <span className="w-4" />
            </div>
            {runs.map((run, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={run.experiment}
                  onChange={e => updateRun(i, { experiment: e.target.value })}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-neutral-700 bg-neutral-900 text-sm text-neutral-300 hover:border-neutral-500 transition-colors cursor-pointer"
                >
                  <option value="" disabled>Experiment #</option>
                  {pairings.map((pairing, p) => {
                    // Listed but unselectable, so it is clear why a human
                    // experiment is missing rather than it simply being absent.
                    const hasHuman = summarizePairing(pairing).humanCount > 0
                    return (
                      <option key={pairing.id} value={pairing.id} disabled={hasHuman}>
                        Experiment {p + 1}{hasHuman ? ' (has a human seat — use Create)' : ''}
                      </option>
                    )
                  })}
                </select>
                <input
                  type="number"
                  min={1}
                  max={MAX_RUNS}
                  value={run.repeats}
                  onChange={e => {
                    const v = e.target.value
                    if (v === '') return updateRun(i, { repeats: '' })
                    const n = Math.floor(Number(v))
                    if (Number.isFinite(n)) updateRun(i, { repeats: String(Math.min(MAX_RUNS, Math.max(1, n))) })
                  }}
                  className="w-20 px-3 py-2 rounded-lg border border-neutral-700 bg-neutral-900 text-sm text-neutral-200 focus:outline-none focus:border-neutral-500"
                />
                <button
                  onClick={() => setRuns(runs.filter((_, j) => j !== i))}
                  aria-label="Remove this run"
                  className="w-4 text-neutral-600 hover:text-neutral-300 transition-colors cursor-pointer leading-none"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={() => setRuns([...runs, EMPTY_RUN])}
              disabled={runs.length >= simulatableCount}
              aria-label="Add an experiment to run"
              title={pairings.length === 0
                ? 'Add an experiment under Pairings first'
                : simulatableCount === 0
                  ? 'Every experiment seats a human — use Create to get their join links'
                  : runs.length >= simulatableCount
                    ? `You can add at most ${simulatableCount} row${simulatableCount === 1 ? '' : 's'} — one per experiment without a human seat`
                    : undefined}
              className="w-full py-2 rounded-lg border border-dashed border-neutral-700 bg-neutral-900 text-sm text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-neutral-700 disabled:hover:text-neutral-400"
            >
              +
            </button>
          </div>
          <ActionButton
            label="Simulate"
            loadingLabel="Simulating…"
            loading={simulating || simWatching}
            onClick={handleSimulate}
          />
          {simResults.map((result, i) => (
            <div key={i} className="space-y-2">
              <ResultBox title={result.label} state={result.state} showMessage />
              {result.export != null && (
                <div className="flex gap-2">
                  <ActionButton
                    label="Download results (JSON)"
                    loadingLabel="Downloading…"
                    loading={false}
                    onClick={() => downloadSimExport(result)}
                  />
                  <ActionButton
                    label="Download ConvoKit (zip)"
                    loadingLabel="Converting…"
                    loading={convokitLoading === i}
                    onClick={() => downloadSimConvokit(i, result)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {notice && (
          <div className="flex items-start justify-between gap-3 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-400">
            <p>{notice}</p>
            <button
              onClick={() => setNotice(null)}
              className="text-neutral-500 hover:text-neutral-300 cursor-pointer leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
