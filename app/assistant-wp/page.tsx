'use client'

import { Fragment, useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { API_BASE } from '../lib/config'
import * as yaml from 'js-yaml'
import { StructuredPromptEditor, type PromptItem } from '../components/StructuredPromptEditor'
import { ActionButton, ResultBox, type ActionState } from '../components/ExperimentActions'
import { MediatorSection } from '../components/MediatorSection'
import { SaveSection } from '../components/SaveSection'
import { YamlIOSection } from '../components/YamlIOSection'
import { SimulationBlockPicker } from '../components/SimulationBlockPicker'
import { useSimulationBlocks, describeBlock, type Block } from '../lib/blocks'
import { ARTICLE_PAGES } from './topics'
import { POLICIES, PolicyType, type Policy } from './retrieval'

const idle: ActionState = { status: 'idle', result: null }

function PromptEditorDescription({ description }: { description: string }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2.5 text-sm text-neutral-500 space-y-1.5">
      <p className="font-medium text-neutral-400">Prompt Purpose</p>
      {description}
    </div>
  )
}

function PromptBlockLegend({ simulationBlocks = [], usingDefaultBlocks }: {
  simulationBlocks?: Block[]
  usingDefaultBlocks?: boolean
}) {
  const legend = (bg: string, label: string, dim = false) => (
    <span className={`inline-block rounded px-1.5 py-0.5 font-medium whitespace-nowrap justify-self-start ${dim ? 'bg-neutral-800 text-neutral-500' : `text-neutral-900 ${bg}`}`}>{label}</span>
  )
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2.5 text-sm text-neutral-500 space-y-1.5">
      <p className="font-medium text-neutral-400">To construct your prompt, you can mix and match the following types of prompt blocks. You can edit the free-form text directly, while the other blocks will be automatically replaced with the corresponding conversation information when the assistant runs.<br /><br /></p>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-baseline">
        <span className="font-medium text-neutral-300">Freeform Text</span>
        <span>custom instructions you write directly</span>
        {legend('bg-[#fde8c8]', 'Article Page')}
        <span>the Wikipedia article the talk page discusses</span>
        {legend('bg-[#dce1fd]', 'Conversation Context')}
        <span>the discussion up to this moment</span>
        {legend('bg-[#dce1fd]', 'Participant Info')}
        <span>the assisted participant's profile info</span>
        {legend('bg-[#dce1fd]', 'Participant Chat Input')}
        <span>the participant's current, unsent chat draft</span>
        {simulationBlocks.length === 0 ? (
          <>
            {legend('', 'Simulation Blocks', true)}
            <span className="text-neutral-600">Not available yet — define blocks under Block Customization in the Simulation Toolkit first.</span>
          </>
        ) : (
          simulationBlocks.map(block => (
            <Fragment key={block.name}>
              {legend('bg-[#e6dcfd]', `${block.name} (Simulation Block)`)}
              <span>{describeBlock(block)}</span>
            </Fragment>
          ))
        )}
        {usingDefaultBlocks && (
          <p className="col-span-2 text-xs text-neutral-600">
            More can be defined under Block Customization in the Simulation Toolkit — they'll show up here once saved.
          </p>
        )}
      </div>
    </div>
  )
}

const POLL_INTERVAL_MS = 10000
const MAX_WAIT_TIME_MS = 300000

export default function AssistantPage() {
  const router = useRouter()
  const [authReady, setAuthReady] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [simQuota, setSimQuota] = useState<{ used: number; limit: number; simMaxWaitTimeMs: number } | null>(null)

  const { blocks, blocksLoaded, usingDefaultBlocks, simulations, selectedId, setSelectedId, error: simulationBlocksError } = useSimulationBlocks()

  const [assistantData, setAssistantData] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [selectedArticleIndex, setSelectedArticleIndex] = useState<number | null>(0)
  const [customTitle, setCustomTitle] = useState('')
  const [customArticle, setCustomArticle] = useState<{ title: string; body: string; link: string } | null>(null)
  const [customArticleLoading, setCustomArticleLoading] = useState(false)
  const [customArticleError, setCustomArticleError] = useState<string | null>(null)
  const [useCustomArticle, setUseCustomArticle] = useState(false)
  const [expandedPolicyTypes, setExpandedPolicyTypes] = useState<Set<PolicyType>>(new Set())
  const policiesByType = useMemo(() => {
    const grouped = {} as Record<PolicyType, Policy[]>
    for (const policy of POLICIES) {
      (grouped[policy.type] ??= []).push(policy)
    }
    return grouped
  }, [])
  const [p1HasAssistant, setP1HasAssistant] = useState(true)
  const [p2HasAssistant, setP2HasAssistant] = useState(false)
  const agentAssignment = p1HasAssistant && p2HasAssistant
    ? 'both'
    : p1HasAssistant
      ? 'participant-1'
      : p2HasAssistant
        ? 'participant-2'
        : undefined

  async function fetchQuota() {
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) return
      const res = await fetch(`${API_BASE}/api/quota`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      setSimQuota({ used: data.used, limit: data.limit, simMaxWaitTimeMs: data.simMaxWaitTimeMs ?? MAX_WAIT_TIME_MS })
    } catch (e) {
      console.warn('fetchQuota failed:', e)
    }
  }

  const getDefaultContent = useCallback(async () => {
    // persona.id is left as the file has it: saving sets it to the saved
    // assistant's id.
    const defaultsText = await fetch(`${API_BASE}/templates/wikipedia/assistant.yaml`).then(res => res.text())
    return JSON.stringify(yaml.load(defaultsText), null, 2)
  }, [])

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace('/')
      } else {
        setAuthReady(true)
        setUserEmail(user.email)
        fetchQuota()
      }
    })
  }, [router])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const [experimentId, setExperimentId] = useState<string | null>('')
  const [createState, setCreateState] = useState<ActionState>(idle)
  const [simState, setSimState] = useState<ActionState>(idle)
  const [simStartTime, setSimStartTime] = useState<number | null>(null)
  const [simElapsed, setSimElapsed] = useState(0)
  const [createAction, setCreateAction] = useState<'create' | 'simulate' | null>(null)
  const [simExport, setSimExport] = useState<unknown>(null)
  const simPollRef = useRef<((countPolls: number) => Promise<void>) | null>(null)
  const [convokitLoading, setConvokitLoading] = useState(false)
  const [creating, setCreating] = useState<'human-human' | 'human-agent' | 'agent-agent' | null>(null)
  const [numCohorts, setNumCohorts] = useState('5')
  const [numUtterances, setNumUtterances] = useState('15')
  const [activePromptTab, setActivePromptTab] = useState<'response' | 'should-respond'>('response')

  useEffect(() => {
    if (simState.status !== 'loading' || simStartTime === null) return
    const lastPollCount = { current: 0 }
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - simStartTime) / 1000)
      setSimElapsed(elapsed)
      const pollCount = Math.floor(elapsed / (POLL_INTERVAL_MS / 1000))
      if (pollCount > lastPollCount.current) {
        lastPollCount.current = pollCount
        simPollRef.current?.(pollCount)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [simState.status, simStartTime])

  const busy = creating !== null || simState.status === 'loading'

  const assistantParsed = useMemo(() => {
    try { return JSON.parse(assistantData ?? '') } catch { return null }
  }, [assistantData])

  const selectedPolicyNames = useMemo(() => {
    const retrieval = (assistantParsed?.retrieval ?? []) as { name: string }[]
    return new Set(retrieval.map(r => r.name))
  }, [assistantParsed])

  const toggleRetrievalPolicy = (policy: Policy) => {
    setAssistantData(prev => {
      try {
        const data = JSON.parse(prev ?? '')
        const current: { id: number; name: string; type: PolicyType }[] = data.retrieval ?? []
        const exists = current.some(r => r.name === policy.name)
        const next = exists
          ? current.filter(r => r.name !== policy.name)
          : [...current, { id: current.length, name: policy.name, type: policy.type }]
        data.retrieval = next.map((r, i) => ({ ...r, id: i }))
        return JSON.stringify(data, null, 2)
      } catch { return prev }
    })
  }

  const updateAssistantPrompt = (prompt: PromptItem[]) => {
    const reindexed = prompt.map((item, i) => ({ ...item, id: i }))
    setAssistantData(prev => {
      try {
        const data = JSON.parse(prev ?? '')
        data.prompt = reindexed
        return JSON.stringify(data, null, 2)
      } catch { return prev }
    })
  }

  const updateShouldRespondPrompt = (prompt: PromptItem[]) => {
    const reindexed = prompt.map((item, i) => ({ ...item, id: i }))
    setAssistantData(prev => {
      try {
        const data = JSON.parse(prev ?? '')
        data.should_respond_prompt = reindexed
        return JSON.stringify(data, null, 2)
      } catch { return prev }
    })
  }

  const updateAssistantField = (path: string[], value: string | boolean | number) => {
    setAssistantData(prev => {
      try {
        const data = JSON.parse(prev ?? '')
        let obj = data
        for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]]
        obj[path[path.length - 1]] = value
        return JSON.stringify(data, null, 2)
      } catch { return prev }
    })
  }


  async function downloadConvokit() {
    if (simExport === null) return
    setConvokitLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/convokit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simExport),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`ConvoKit conversion failed: ${err.error ?? res.statusText}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `convokit-${(simExport as { experiment?: { id?: string } })?.experiment?.id ?? 'export'}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`ConvoKit conversion error: ${String(e)}`)
    } finally {
      setConvokitLoading(false)
    }
  }

  async function handleAddCustomArticle() {
    const title = customTitle.trim()
    if (!title) return
    setCustomArticleLoading(true)
    setCustomArticleError(null)
    try {
      const res = await fetch(`${API_BASE}/api/wikipedia-article?title=${encodeURIComponent(title)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch article')
      setCustomArticle(data)
      setUseCustomArticle(true)
      setSelectedArticleIndex(null)
    } catch (e) {
      setCustomArticleError(e instanceof Error ? e.message : String(e))
      setCustomArticle(null)
    } finally {
      setCustomArticleLoading(false)
    }
  }

  async function handleCreate(mode: 'human-human' | 'human-agent' | 'agent-agent', action: 'create' | 'simulate' = 'create') {
    setSimState(idle)
    setCreating(mode)
    setCreateAction(action)
    try {
      let idToken: string | undefined
      if (action === 'simulate') {
        idToken = await auth.currentUser?.getIdToken()
      }
      const selectedArticle = useCustomArticle ? (customArticle ?? undefined) : (selectedArticleIndex !== null ? ARTICLE_PAGES[selectedArticleIndex] : undefined)
      const res = await fetch(`${API_BASE}/api/create-experiment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantTemplate: assistantData, mode, numCohorts, numUtterances, action, idToken,
          postTitle: selectedArticle?.title,
          postDescription: selectedArticle?.body,
          experimentTemplateSet: 'wikipedia',
          agentAssignment,
        }),
      })
      const data = await res.json()
      setCreateState({ status: res.ok ? 'done' : 'error', result: data })
      if (res.ok && action === 'simulate') fetchQuota()
      return res.ok ? data : null
    } catch (e) {
      setCreateState({ status: 'error', result: String(e) })
      return null
    } finally {
      setCreating(null)
      setCreateAction(null)
    }
  }

  async function handleSimPoll(countPolls: number) {
    if (!experimentId) return
    let lastExport = null
    let completedCohorts: string[] = []
    let totalSim = 0
    const maxPolls = Math.floor((simQuota?.simMaxWaitTimeMs ?? MAX_WAIT_TIME_MS) / POLL_INTERVAL_MS)

    try {
      const res = await fetch(`${API_BASE}/api/simulation-status?experimentId=${encodeURIComponent(experimentId)}`)
      const status = await res.json()
      if (!res.ok) { setSimState({ status: 'error', result: status }); return }

      lastExport = status.export

      completedCohorts = Object.entries(status.statuses ?? {})
        .filter(([, ss]) => (ss as string[]).length > 0 && (ss as string[]).every((s) => s === 'SUCCESS'))
        .map(([cid]) => cid)

      totalSim = Object.keys(status.statuses ?? {}).length

      if (status.completed) {
        setSimExport(status.export)
        setSimState({ status: 'done', result: { message: `Simulation complete (experiment_id: ${experimentId})` } })
        return
      }
      setSimState({ status: 'loading', result: { message: `Simulation running: ${completedCohorts.length}/${totalSim} discussions finished` } })
    } catch (e) {
      setSimState({ status: 'error', result: String(e) }); return
    }

    if (countPolls < maxPolls) {
      return
    }

    if (lastExport && completedCohorts.length > 0) {
      const done = new Set(completedCohorts)
      const exp = lastExport as {
        cohortMap?: Record<string, unknown>
        participantMap?: Record<string, { profile?: { currentCohortId?: string; agentConfig?: { agentId?: string } } }>
        agentParticipantMap?: Record<string, unknown>
      }

      const participantMap = Object.fromEntries(
        Object.entries(exp.participantMap ?? {}).filter(([, p]) => done.has(p?.profile?.currentCohortId ?? '')),
      )
      const usedAgentIds = new Set(
        Object.values(participantMap).map((p) => p?.profile?.agentConfig?.agentId).filter(Boolean),
      )

      setSimExport({
        ...exp,
        cohortMap: Object.fromEntries(
          Object.entries(exp.cohortMap ?? {}).filter(([cid]) => done.has(cid)),
        ),
        participantMap,
        agentParticipantMap: Object.fromEntries(
          Object.entries(exp.agentParticipantMap ?? {}).filter(([aid]) => usedAgentIds.has(aid)),
        ),
      })

      setSimState({ status: 'done', result: { message: `Timed out: ${completedCohorts.length}/${totalSim} discussions finished — export contains completed discussions only (experiment_id: ${experimentId})` } })
      return
    }

    setSimState({ status: 'error', result: 'Timed out waiting for the simulation to complete.' })
  }
  simPollRef.current = handleSimPoll

  async function handleCreateSim() {
    const data = await handleCreate('agent-agent', 'simulate')
    const experimentId: string | undefined = data?.experiment_id
    if (!experimentId) return
    setExperimentId(experimentId)

    setSimExport(null)
    setSimState({ status: 'loading', result: { message: 'Simulation running — waiting for agents to finish' } })

    setSimStartTime(Date.now())
    setSimElapsed(0)
  }

  if (!authReady) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-500 text-sm">
      Loading...
    </div>
  )

  return (
    <div className="flex flex-col lg:flex-row bg-neutral-950 text-neutral-100">

      {/* Left column — prompt editor */}
      <div className="lg:flex-3 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:min-h-0 p-8">
        <div className="w-full space-y-5">

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Assistant Toolkit - Wikipedia</h1>
              <p className="text-base text-neutral-500 mt-1">Create and test custom private discussion assistants.</p>
            </div>

            <div className="flex items-center gap-3 mt-1">
              {userEmail && <span className="text-sm text-neutral-400">{userEmail}</span>}
              <button
                onClick={() => {
                  if (dirty && !window.confirm('You have unsaved changes. Sign out anyway?')) return
                  signOut(auth).then(() => router.replace('/'))
                }}
                className="text-sm px-3 py-1.5 rounded-md border border-neutral-600 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </div>

          {/* Save / Load */}
          <SaveSection
            collection="assistants"
            content={assistantData}
            onContentChange={setAssistantData}
            getDefaultContent={getDefaultContent}
            onDirtyChange={setDirty}
            enabled={authReady}
          />

          {/* Prompt editor */}
          <div className="space-y-4">
            <div className="border-b border-neutral-800 pb-3">
              <h2 className="text-lg font-semibold tracking-tight">Prompt Editors</h2>
            </div>
            <p className="text-sm text-neutral-500">Here you can edit the prompts that guide your assistant. The <span className="text-neutral-400">Assistant Prompt</span> controls the guidance it sends the participant; the <span className="text-neutral-400">Should Intervene</span> prompt decides whether now is a good time to send it.</p>

            <SimulationBlockPicker
              simulations={simulations}
              selectedId={selectedId}
              onSelect={setSelectedId}
              error={simulationBlocksError}
            />

            <div className="rounded-lg border border-neutral-800">
              <div className="flex border-b border-neutral-800 bg-neutral-900/60">
                {(['response', 'should-respond'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActivePromptTab(tab)}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors ${activePromptTab === tab ? 'text-neutral-100 border-b-2 border-neutral-400 -mb-px' : 'text-neutral-500 hover:text-neutral-300'}`}
                  >
                    {tab === 'response' ? 'Assistant Prompt' : 'Should Intervene'}
                  </button>
                ))}
              </div>
              <div className="p-4">
                {activePromptTab === 'response' ? (
                  <div className="space-y-4">
                    <PromptEditorDescription description="A prompt that determines how your assistant privately helps a single participant during the discussion. The assistant only responds to that participant — it never posts to the shared conversation. It generates a message every time the Should Intervene Prompt decides the assistant should respond." />
                    <PromptBlockLegend simulationBlocks={blocks} usingDefaultBlocks={usingDefaultBlocks} />
                    <StructuredPromptEditor
                      label="Assistant Prompt Editor"
                      prompt={(assistantParsed?.prompt as PromptItem[]) ?? []}
                      stageId=""
                      onUpdate={updateAssistantPrompt}
                      assistantMode="wp"
                      blocks={blocks}
                      blocksLoaded={blocksLoaded}
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <PromptEditorDescription description="Your assistant uses this prompt after each update to the participant's draft or the conversation to decide whether this is a good time to offer guidance. When the response is true, the assistant uses the Assistant Prompt to generate a message; when false, it waits." />
                    <PromptBlockLegend simulationBlocks={blocks} usingDefaultBlocks={usingDefaultBlocks} />
                    <StructuredPromptEditor
                      label="Should Intervene Prompt Editor"
                      prompt={(assistantParsed?.should_respond_prompt as PromptItem[]) ?? []}
                      stageId=""
                      onUpdate={updateShouldRespondPrompt}
                      assistantMode="wp"
                      blocks={blocks}
                      blocksLoaded={blocksLoaded}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="border-b border-neutral-800 pb-3 mb-3">
              <h2 className="text-lg font-semibold tracking-tight">Retrieval Information</h2>
            </div>
            <div className="space-y-2">
              {(Object.keys(policiesByType) as PolicyType[]).map(type => {
                const policies = policiesByType[type]
                const isOpen = expandedPolicyTypes.has(type)
                return (
                  <div key={type} className="space-y-2">
                    <button
                      onClick={() => setExpandedPolicyTypes(prev => {
                        const next = new Set(prev)
                        if (next.has(type)) next.delete(type); else next.add(type)
                        return next
                      })}
                      className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-neutral-700 bg-neutral-900 text-sm text-neutral-300 hover:bg-neutral-800 hover:border-neutral-600 transition-colors cursor-pointer"
                    >
                      <span>{type.charAt(0) + type.slice(1).toLowerCase()} ({policies.length})</span>
                      <span className="text-neutral-500">{isOpen ? '▾' : '▸'}</span>
                    </button>
                    {isOpen && (
                      <div className="space-y-0.5 pl-3">
                        {policies.map(policy => {
                          const checked = selectedPolicyNames.has(policy.name)
                          return (
                            <label
                              key={policy.name}
                              className={`flex items-center gap-2 py-1 text-sm cursor-pointer transition-colors ${checked
                                  ? 'text-neutral-100'
                                  : 'text-neutral-400 hover:text-neutral-200'
                                }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleRetrievalPolicy(policy)}
                                className="sr-only"
                              />
                              <span
                                aria-hidden
                                className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${checked
                                    ? 'border-neutral-300 bg-neutral-100'
                                    : 'border-neutral-600 bg-transparent'
                                  }`}
                              >
                                {checked && (
                                  <svg viewBox="0 0 16 16" className="w-3 h-3 text-neutral-950" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 8l3.5 3.5L13 5" />
                                  </svg>
                                )}
                              </span>
                              {policy.name}
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="border-b border-neutral-800 pb-3">
            <h2 className="text-lg font-semibold tracking-tight">Assistant Configuration</h2>
          </div>

          <MediatorSection
            title="Assistant Persona"
            mediatorParsed={assistantParsed}
            onUpdate={updateAssistantField}
            fields={[
              { label: 'Name', description: 'Displayed name of the assistant.', path: ['persona', 'name'], type: 'text' },
              { label: 'Min Call Interval (ms)', description: 'The minimum time the assistant must wait between calls to check whether it should respond.', path: ['persona', 'min_call_interval_ms'], type: 'number', min: 0, step: 1000 },
            ]}
          />

        </div>
      </div>

      {/* Right column — testing & simulation */}
      <div className="lg:flex-1 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:min-h-0 p-8 space-y-6 border-t border-neutral-800 lg:border-t-0 lg:border-l">
        <YamlIOSection label="Assistant" filename="assistant.yaml" data={assistantData} setData={setAssistantData} />
        {/* <div className="space-y-3">
          <div className="border-b border-neutral-800 pb-3 mb-3">
            <h2 className="text-lg font-semibold tracking-tight">Assistant Testing</h2>
          </div>
          <div className="space-y-3">
            <ActionButton
              label="Create (human-agent)"
              loadingLabel="Creating…"
              loading={creating === 'human-agent'}
              disabled={busy}
              onClick={() => handleCreate('human-agent')}
            />
            <ActionButton
              label="Create (human-human)"
              loadingLabel="Creating…"
              loading={creating === 'human-human'}
              disabled={busy}
              onClick={() => handleCreate('human-human')}
            />
            <ActionButton
              label="Create (agent-agent)"
              loadingLabel="Creating…"
              loading={creating === 'agent-agent' && createAction === 'create'}
              disabled={busy}
              onClick={() => handleCreate('agent-agent', 'create')}
            />
          </div>

          {createState.result !== null && (
            <ResultBox
              title="Create"
              state={createState}
              links={
                createState.status === 'done' && typeof createState.result === 'object' && createState.result !== null
                  ? createState.result
                  : undefined
              }
            />
          )}
        </div> */}
         {/* <div className="space-y-3">
          <div className="border-b border-neutral-800 pb-3 mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Assistant Simulation</h2>
          </div>
          {simQuota && (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${simQuota.used >= simQuota.limit ? 'bg-red-500' : 'bg-neutral-500'}`}
                  style={{ width: `${Math.min(100, (simQuota.used / simQuota.limit) * 100)}%` }}
                />
              </div>
              <span className={`text-xs tabular-nums ${simQuota.used >= simQuota.limit ? 'text-red-400' : 'text-neutral-500'}`}>
                {simQuota.used}/{simQuota.limit} today
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <input
                type="text"
                min={1}
                max={30}
                value={numCohorts}
                onChange={e => {
                  const v = e.target.value
                  if (v === '') return setNumCohorts('')
                  const n = Math.floor(Number(v))
                  if (Number.isFinite(n)) setNumCohorts(String(Math.min(30, Math.max(1, n))))
                }}
                disabled={busy}
                className="w-16 p-2 rounded-lg border border-neutral-700 bg-neutral-900 text-sm text-neutral-200"
              /> <label className="text-sm text-neutral-400">Discussions (1-30)</label>
            </div>
            <div>
              <input
                type="number"
                min={1}
                max={20}
                value={numUtterances}
                onChange={e => {
                  const v = e.target.value
                  if (v === '') return setNumUtterances('')
                  const n = Math.floor(Number(v))
                  if (Number.isFinite(n)) setNumUtterances(String(Math.min(20, Math.max(1, n))))
                }}
                disabled={busy}
                className="w-16 p-2 rounded-lg border border-neutral-700 bg-neutral-900 text-sm text-neutral-200"
              /> <label className="text-sm text-neutral-400">Messages (1-20)</label>
            </div>
            <div className="flex flex-col">
              <label className="text-sm text-neutral-400">Max wait time: {(() => { const s = Math.round((simQuota?.simMaxWaitTimeMs ?? MAX_WAIT_TIME_MS) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` })()} minutes</label>
              {simStartTime !== null && (
                <label className="text-sm text-neutral-400">
                  {simState.status === 'loading' ? 'Elapsed' : 'Completed in'}: {Math.floor(simElapsed / 60)}:{String(simElapsed % 60).padStart(2, '0')} minutes
                </label>
              )}
            </div>
            <ActionButton
              label="Simulate"
              loadingLabel="Simulating…"
              loading={(creating === 'agent-agent' && createAction === 'simulate') || simState.status === 'loading'}
              disabled={busy || (simQuota !== null && simQuota.used >= simQuota.limit)}
              onClick={handleCreateSim}
            />
          </div>
        </div> */}
        {simState.result !== null && (
          <ResultBox title="Simulation" state={simState} showMessage />
        )}
        {simState.status === 'done' && simExport !== null && (
          <div className="flex flex-wrap gap-3">
            <ActionButton
              label="Download ConvoKit corpus (zip)"
              loadingLabel="Converting…"
              loading={convokitLoading}
              onClick={downloadConvokit}
            />
          </div>
        )}
        {/* <div className="space-y-3">
          <div className="border-b border-neutral-800 pb-3 mb-3">
            <h2 className="text-lg font-semibold tracking-tight">Test Settings</h2>
          </div>

          <p className="text-sm font-medium text-neutral-300">Wikipedia Article:</p>
          <div className="space-y-2">
            {ARTICLE_PAGES.map((article, i) => (
              <div
                key={i}
                onClick={() => { setSelectedArticleIndex(i); setUseCustomArticle(false) }}
                className={`w-full flex flex-col items-start gap-1 px-4 py-2.5 rounded-lg border text-sm transition-colors cursor-pointer ${selectedArticleIndex === i && !useCustomArticle
                    ? 'border-neutral-400 bg-neutral-800 text-neutral-100'
                    : 'border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-600'
                  }`}
              >
                <span>{article.title}</span>
                <a
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="shrink-0 text-xs text-neutral-500 hover:text-neutral-300 underline underline-offset-2"
                >
                  View article ↗
                </a>
              </div>
            ))}
            {customArticle && (
              <div
                onClick={() => setUseCustomArticle(true)}
                className={`w-full flex flex-col items-start gap-1 px-4 py-2.5 rounded-lg border text-sm transition-colors cursor-pointer ${useCustomArticle
                    ? 'border-neutral-400 bg-neutral-800 text-neutral-100'
                    : 'border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-600'
                  }`}
              >
                <span>{customArticle.title}</span>
                <a
                  href={customArticle.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="shrink-0 text-xs text-neutral-500 hover:text-neutral-300 underline underline-offset-2"
                >
                  View article ↗
                </a>
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={customTitle}
                onChange={e => setCustomTitle(e.target.value)}
                disabled={customArticleLoading}
                placeholder="Enter a WP article title…"
                className="flex-1 px-3 py-2 rounded-lg border border-neutral-700 bg-neutral-900 text-sm text-neutral-200 placeholder-neutral-500 disabled:opacity-40"
              />
              <button
                onClick={handleAddCustomArticle}
                disabled={!customTitle.trim() || customArticleLoading}
                className="px-4 py-2 rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm transition-colors cursor-pointer"
              >
                {customArticleLoading ? 'Adding…' : 'Add'}
              </button>
            </div>
            {customArticleError && (
              <p className="text-xs text-red-400">{customArticleError}</p>
            )}
          </div>

          <p className="text-sm font-medium text-neutral-300">Assistant given to:</p>
          <div className="space-y-2">
            {([
              { checked: p1HasAssistant, setChecked: setP1HasAssistant, label: 'Participant 1' },
              { checked: p2HasAssistant, setChecked: setP2HasAssistant, label: 'Participant 2' },
            ] as const).map(option => (
              <label
                key={option.label}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm transition-colors cursor-pointer ${option.checked
                    ? 'border-neutral-400 bg-neutral-800 text-neutral-100'
                    : 'border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-600'
                  }`}
              >
                <input
                  type="checkbox"
                  checked={option.checked}
                  onChange={e => option.setChecked(e.target.checked)}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${option.checked
                      ? 'border-neutral-300 bg-neutral-100'
                      : 'border-neutral-600 bg-transparent'
                    }`}
                >
                  {option.checked && (
                    <svg viewBox="0 0 16 16" className="w-3 h-3 text-neutral-950" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8l3.5 3.5L13 5" />
                    </svg>
                  )}
                </span>
                {option.label}
              </label>
            ))}
          </div>
        </div> */}
        

      </div>
    </div>
  )
}
