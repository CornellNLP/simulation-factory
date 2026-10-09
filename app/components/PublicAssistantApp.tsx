'use client'

import { Fragment, useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { API_BASE } from '../lib/config'
import * as yaml from 'js-yaml'
import { TOPICS } from '../lib/topics'
import { ApiKeyType, API_KEY_TYPE_LABELS, REASONING_LEVEL_OPTIONS } from '../lib/types'
import { StructuredPromptEditor, PromptItemType, type PromptItem, type TextPromptItem } from '../components/StructuredPromptEditor'
import { ConfigSection } from '../components/ConfigSection'
import { Nav } from './Nav'
import { type ActionState } from '../components/ExperimentActions'
import { SaveSection } from './SaveSection'
import { create } from 'domain'
import { StructuredOutputSchema, type StructuredOutputConfig } from '../components/StructuredOutputSchema'
import { startTour } from '../lib/tour'
import { SimulationBlockPicker } from './SimulationBlockPicker'
import { useSimulationBlocks, type Block } from '../lib/blocks'
import { text } from 'stream/consumers'
import { TOPIC_SETS } from '../lib/topicSets'

const idle: ActionState = { status: 'idle', result: null }

const WORKED_EXAMPLES_URL =
  'https://docs.google.com/document/d/1tX9w_9RFuES2jxlGTDY2lXpRenc354hjzYMeH8LzngU/edit?tab=t.uulhszxtacl9'

function WorkedExamplesLink() {
  return (
    <a href={WORKED_EXAMPLES_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-300">
      worked examples
    </a>
  )
}

function PromptEditorDescription({ description }: { description?: string }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2.5 text-sm text-neutral-500 space-y-1.5">
      <p className="font-medium text-neutral-400">Prompt Purpose</p>
      {description}
      <p>
        See <WorkedExamplesLink />.
      </p>
    </div>
  )
}


function PromptBlockLegend({ textOnly, simulationBlocks = [], usingDefaultBlocks, hideDebateItems }: {
  textOnly?: boolean
  simulationBlocks?: Block[]
  usingDefaultBlocks?: boolean
  // Leaves out Debate Topic, Debate Statement, Target Position and Participant
  // Initial Positions, and lists Participant Profiles instead (/public-assistant).
  hideDebateItems?: boolean
}) {
  const legend = (bg: string, label: string, dim = false) => (
    <span className={`inline-block rounded px-1.5 py-0.5 font-medium whitespace-nowrap justify-self-start ${dim ? 'bg-neutral-800 text-neutral-500' : `text-neutral-900 ${bg}`}`}>{label}</span>
  )
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2.5 text-sm text-neutral-500 space-y-1.5">
      <p className="font-medium text-neutral-400">To construct your prompt, you can mix and match the following types of prompt blocks. You can edit the free-form text directly, while the other blocks will be automatically replaced with the corresponding conversation information when the public assistant runs.<br /><br /></p>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-baseline">
        <span className="font-medium text-neutral-300">Freeform Text</span>
        <span>{textOnly ? 'instructions for gathering information about the topic, participants, or anything else before each discussion' : 'custom instructions you write directly'}</span>
        {!hideDebateItems && <>
          {legend('bg-[#fde8c8]', 'Debate Topic')}
          <span>the topic of the debate</span>
          {legend('bg-[#fde8c8]', 'Debate Statement')}
          <span>the statement that the participants take a position on</span>
        </>}
        {hideDebateItems ? <>
          {legend('bg-[#dce1fd]', 'Participant Profiles')}
          <span>the profile information of the participants</span>
        </> : <>
          {legend('bg-[#dce1fd]', 'Participant Initial Positions')}
          <span>the participants responses to the pre-conversation survey about the debate statement</span>
        </>}
        {!textOnly && <>
          {legend('bg-[#dce1fd]', 'Conversation Context')}
          <span>the discussion up to this moment</span>
          {/* {legend('bg-[#f9d8f5]', 'Profile Info')}
          <span>the public assistant's profile data</span> */}
          {legend('bg-[#d8f9e0]', 'Initialization Result')}
          <span>the output of the initialization prompt</span>
        </>}
        {/* {textOnly && (
          <>
            {legend('bg-[#f08673]', 'Target Position')}
            <span>for the Covert Influence Task only: the position on the topic (Pro or Against)</span>
          </>
        )} */}
        {!hideDebateItems && <>
          {legend('bg-[#f08673]', 'Target Position')}
          <span>[Use only for the Covert Influence Task] the direction of the covert influence (either Supporting or Opposing the debate statement)</span>
        </>}
        {simulationBlocks.length === 0 ? (
          <>
            {legend('', 'Simulation Blocks', true)}
            <span className="text-neutral-600">Not available yet — define blocks under Block Customization in the Simulation Toolkit first.</span>
          </>
        ) : (
          simulationBlocks.map(block => (
            <Fragment key={block.name}>
              {legend('bg-[#e6dcfd]', `${block.name} (Custom Block)`)}
              <span>Block defined in the Simulation panel</span>
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

const SUBMISSION_FORMS = {
  track1: 'https://docs.google.com/forms/d/e/1FAIpQLSeJV2AnhwoZ6zu4ueqEgTsMkGEwxi3Bo4bp_qmenVldiNA7jw/viewform?usp=publish-editor',
  track2: 'https://docs.google.com/forms/d/e/1FAIpQLSfEF0TXx77hfN9IYgjWFkPbyRkYJcYOsXqfYmdfhsjH4FdQHA/viewform?usp=publish-editor',
} as const

const POLL_INTERVAL_MS = 10000
const MAX_WAIT_TIME_MS = 300000

export default function PublicAssistantApp({ variant, home = '/' }: { variant: string; home?: string }) {
  const router = useRouter()
  const [authReady, setAuthReady] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [simQuota, setSimQuota] = useState<{ used: number; limit: number; simMaxWaitTimeMs: number } | null>(null)

  const [dirty, setDirty] = useState(false)

  // The main Public Assistant Toolkit is not debate-specific, so it drops the debate
  // items from its editors and legend and starts from a template without them.
  // The in-class variant still runs debate topic sets and keeps them.
  const hideDebateItems = variant === 'default'

  // Blocks are authored in the Simulation Toolkit and live inside the saved
  // simulation, so they are read-only here. The in-class variant has no
  // simulation toolkit behind it, which is why the picker below is hidden there.
  const { blocks, blocksLoaded, usingDefaultBlocks, simulations, selectedId, setSelectedId, error: simulationBlocksError } = useSimulationBlocks()

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

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace(home)
      } else {
        setAuthReady(true)
        setUserEmail(user.email)
        fetchQuota()
      }
    })
  }, [router, home])

  const [publicAssistantData, setPublicAssistantData] = useState<string | null>(null)
  const [topicId, setTopicId] = useState<number>(Number(Object.keys(TOPICS)[0]))

  const getDefaultContent = useCallback(async () => {
    const [defaultsText, topicText] = await Promise.all([
      fetch(`${API_BASE}/templates/defaults/mediator.yaml`).then(res => res.text()),
      fetch(`${API_BASE}/templates/${hideDebateItems ? 'simulation' : 'competition'}/mediator.yaml`).then(res => res.text()),
    ])
    const merged = { ...(yaml.load(defaultsText) as object), ...(yaml.load(topicText) as object) } as { persona: { id: string } }
    merged.persona.id = 'mediator'
    return JSON.stringify(merged, null, 2)
  }, [topicId, hideDebateItems])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const [experimentId, setExperimentId] = useState<string | null>('')
  const [exportState, setExportState] = useState<ActionState>(idle)
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
  const [activePromptTab, setActivePromptTab] = useState<'response' | 'should-respond' | 'initialization'>('response')

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

  const busy = creating !== null || exportState.status === 'loading' || simState.status === 'loading'

  const publicAssistantParsed = useMemo(() => {
    try { return JSON.parse(publicAssistantData ?? '') } catch { return null }
  }, [publicAssistantData])

  const updateShouldRespondPrompt = (prompt: PromptItem[]) => {
    const reindexed = prompt.map((item, i) => ({ ...item, id: i }))
    setPublicAssistantData(prev => {
      try {
        const data = JSON.parse(prev ?? '')
        data.should_respond_prompt = reindexed
        return JSON.stringify(data, null, 2)
      } catch { return prev }
    })
  }

  const updateInitializationContextPrompt = (prompt: PromptItem[]) => {
    const reindexed = prompt.map((item, i) => ({ ...item, id: i }))
    setPublicAssistantData(prev => {
      try {
        const data = JSON.parse(prev ?? '')
        data.initialization_context_prompt = reindexed
        return JSON.stringify(data, null, 2)
      } catch { return prev }
    })
  }

  const structuredOutputConfig: StructuredOutputConfig = useMemo(() => {
    const structuredOutput = publicAssistantParsed?.structured_output
    const properties = Object.entries(structuredOutput?.schema ?? {}).map(([name, field]: [string, any]) => ({
      name,
      schema: { type: field.type, description: field.description },
    }))
    return {
      schema: {
        type: 'OBJECT',
        properties,
      },
      messageField: structuredOutput?.message_field ?? '',
      explanationField: structuredOutput?.explanation_field ?? '',
      descriptionOnly: true,
    }
  }, [publicAssistantParsed?.structured_output])

  const updateStructuredOutputConfig = (config: StructuredOutputConfig) => {
    const schema: Record<string, { type: string; description: string }> = {}
    for (const p of config.schema?.properties ?? []) {
      schema[p.name] = { type: p.schema.type, description: p.schema.description }
    }
    setPublicAssistantData(prev => {
      try {
        const data = JSON.parse(prev ?? '')
        data.structured_output = {
          ...(data.structured_output ?? {}),   // keep enabled, append_to_prompt, should_respond_field, ready_to_end_field
          message_field: config.messageField,
          explanation_field: config.explanationField,
          schema,
        }
        return JSON.stringify(data, null, 2)
      } catch { return prev }
    })
  }

  const updatePublicAssistantPrompt = (prompt: PromptItem[]) => {
    const reindexed = prompt.map((item, i) => ({ ...item, id: i }))
    setPublicAssistantData(prev => {
      try {
        const data = JSON.parse(prev ?? '')
        data.prompt = reindexed
        return JSON.stringify(data, null, 2)
      } catch { return prev }
    })
  }

  const updatePublicAssistantField = (path: string[], value: string | boolean | number) => {
    setPublicAssistantData(prev => {
      try {
        const data = JSON.parse(prev ?? '')
        let obj = data
        for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]]
        obj[path[path.length - 1]] = value
        return JSON.stringify(data, null, 2)
      } catch { return prev }
    })
  }

  function downloadJson(data: unknown, filename: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
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

  async function handleCreate(mode: 'human-human' | 'human-agent' | 'agent-agent', action: 'create' | 'simulate' = 'create') {
    setSimState(idle)
    setCreating(mode)
    setCreateAction(action)
    try {
      let idToken: string | undefined
      if (action === 'simulate') {
        idToken = await auth.currentUser?.getIdToken()
      }
      const res = await fetch(`${API_BASE}/api/create-experiment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicAssistantTemplate: publicAssistantData, mode, variant, numCohorts, numUtterances, action, idToken }),
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


  // handle simulation poll
  async function handleSimPoll(countPolls : number) {
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

    // Return if # of polls isn't up yet. 
    if (countPolls < maxPolls) {
      return 
    }

    // filter the export to only include completed cohorts if we have any
    if (lastExport && completedCohorts.length > 0) {
      const done = new Set(completedCohorts)
      const exp = lastExport as {
        cohortMap?: Record<string, unknown>
        participantMap?: Record<string, { profile?: { currentCohortId?: string; agentConfig?: { agentId?: string } } }>
        agentParticipantMap?: Record<string, unknown>
      }

      // we need to keep participants that are in completed cohorts, and remove others
      const participantMap = Object.fromEntries(
        Object.entries(exp.participantMap ?? {}).filter(([, p]) => done.has(p?.profile?.currentCohortId ?? '')),
      )
      // then get agent ids from these participants
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


  // sent to simulation + polling its status
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
    <div className="flex flex-col lg:flex-row lg:h-screen lg:overflow-hidden bg-neutral-950 text-neutral-100">

      {/* Left column — configuration */}
      <div className="lg:flex-3 lg:overflow-y-auto p-8">
        <div className="w-full space-y-5">

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Public Assistant Toolkit</h1>
              <p className="text-base text-neutral-500 mt-1">Create, audit, and test custom public assistants.</p>
            </div>

            <div className="flex items-center gap-3 mt-1">
              {userEmail && <span className="text-sm text-neutral-400">{userEmail}</span>}
              <button
                onClick={() => {
                  if (dirty && !window.confirm('You have unsaved changes. Sign out anyway?')) return
                  signOut(auth).then(() => router.replace(home))
                }}
                className="text-sm px-3 py-1.5 rounded-md border border-neutral-600 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer"
              >
                Sign out
              </button>
              <button onClick={startTour} className="text-sm px-3 py-1.5 rounded-md border border-neutral-600 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer" id="tour-show">
                Take a tour
              </button>
            </div>
          </div>

          {variant === 'default' && <Nav />}

          {/* Save / Load */}
          <SaveSection
            collection="mediators"
            content={publicAssistantData}
            onContentChange={setPublicAssistantData}
            getDefaultContent={getDefaultContent}
            onDirtyChange={setDirty}
            enabled={authReady}
          />

          {/* <div className="flex items-center justify-end gap-2">
            <select
                id="tour-submit"
                defaultValue=""
                onChange={e => {
                    const formUrl = SUBMISSION_FORMS[e.target.value as keyof typeof SUBMISSION_FORMS]
                    if (formUrl) window.open(formUrl, '_blank', 'noopener,noreferrer')
                    e.target.value = ''
                }}
                className="px-3 py-1.5 rounded-md border border-blue-400/50 bg-blue-500/10 text-sm text-blue-300 hover:border-blue-300 hover:text-blue-200 transition-colors cursor-pointer"
            >
                <option value="" disabled>Submit…</option>
                <option value="track1">Track 1</option>
                <option value="track2">Track 2</option>
            </select>
          </div> */}

          {/* Public Assistant configuration and prompt editors */}
          <div className="space-y-4">

            <div id="tour-prompt-editors" className="space-y-4">
              <div className="border-b border-neutral-800 pb-3">
                <h2 className="text-lg font-semibold tracking-tight">Prompt Editors</h2>
              </div>
              <p className="text-sm text-neutral-500">Here you can edit the prompts to guide the public assistant's interventions. The <span className="text-neutral-400">Intervention Prompt</span> controls what the public assistant says; the <span className="text-neutral-400">Should Intervene</span> prompts the LLM to return true/false on whether it should intervene. The <span className="text-neutral-400">Initialization Prompt</span> instructs the LLM to gather information that can be used in discussions. Take a look at our <WorkedExamplesLink /> to see how these work. <a href="https://www.promptingguide.ai/" target="_blank" className="underline hover:text-neutral-300">Learn more about prompt engineering.</a></p>
            </div>

            {variant === 'default' && (
              <SimulationBlockPicker
                simulations={simulations}
                selectedId={selectedId}
                onSelect={setSelectedId}
                error={simulationBlocksError}
              />
            )}

            <div className="rounded-lg border border-neutral-800">
              <div className="flex border-b border-neutral-800 bg-neutral-900/60">
                {(['response', 'should-respond', 'initialization'] as const).map(tab => (
                  <button
                    key={tab}
                    id={`tour-prompt-tab-${tab}`}
                    onClick={() => setActivePromptTab(tab)}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors ${activePromptTab === tab ? 'text-neutral-100 border-b-2 border-neutral-400 -mb-px' : 'text-neutral-500 hover:text-neutral-300'}`}
                  >
                    {tab === 'response' ? 'Intervention Prompt' : tab === 'should-respond' ? 'Should Intervene' : 'Initialization Prompt'}
                  </button>
                ))}
              </div>
              <div className="p-4">
                {activePromptTab === 'response' ? (
                  <div className="space-y-4">
                    <PromptEditorDescription description="A prompt that determines your public assistant's interventions during the discussion.  The public assistant uses this prompt to generate a message that is sent to participants.  It does so every time the Should Intervene Prompt decides the public assistant should intervene." />
                    <PromptBlockLegend simulationBlocks={blocks} usingDefaultBlocks={usingDefaultBlocks} hideDebateItems={hideDebateItems} />
                    {/* <ConfigSection
                      title="Response Settings"
                      parsed={publicAssistantParsed}
                      onUpdate={updatePublicAssistantField}
                      fields={[
                        { label: 'Context', description: "When the \"Context\" block is included in the prompt editor, it determines what experiment information is injected into the prompt. 'Current' includes only the active group chat; 'All' also includes participant responses from prior stages (e.g. pre-survey).", path: ['context'], type: 'select', options: [{ value: 'all', label: 'All' }, { value: 'current', label: 'Current' }] },
                      ]}
                    /> */}
                    <StructuredPromptEditor
                      label="Intervention Prompt Editor"
                      prompt={(publicAssistantParsed?.prompt as PromptItem[]) ?? []}
                      stageId=""
                      onUpdate={updatePublicAssistantPrompt}
                      blocks={blocks}
                      blocksLoaded={blocksLoaded}
                      hideDebateItems={hideDebateItems}
                      showParticipantProfiles={hideDebateItems}
                    />
                    {/* <StructuredOutputSchema
                      config={structuredOutputConfig}
                      onUpdate={updateStructuredOutputConfig}
                    /> */}
                  </div>
                ) : activePromptTab === 'should-respond' ? (
                  <div className="space-y-4">
                    <PromptEditorDescription description="Your public assistant uses this prompt after each message in the discussion to decide whether this is a good time to intervene.  When the response is true, the public assistant uses the Intervention Prompt to generate a message and sends it to the participants. When the response is false the public assistant waits for the next participant message. Message sent automatically when the conversation begins." />
                    <PromptBlockLegend simulationBlocks={blocks} usingDefaultBlocks={usingDefaultBlocks} hideDebateItems={hideDebateItems} />
                    {/* <ConfigSection
                      title="ShouldRespond Settings"
                      parsed={publicAssistantParsed}
                      onUpdate={updatePublicAssistantField}
                      fields={[
                        { label: 'Context', description: "When the \"Context\" block is included in the prompt editor, it determines what experiment information is injected into the prompt. 'Current' includes only the active group chat; 'All' also includes participant responses from prior stages (e.g. pre-survey).", path: ['should_respond_context'], type: 'select', options: [{ value: 'all', label: 'All' }, { value: 'current', label: 'Current' }] },
                      ]}
                    /> */}
                    <StructuredPromptEditor
                      label="Should Intervene Prompt Editor"
                      prompt={(publicAssistantParsed?.should_respond_prompt as PromptItem[]) ?? []}
                      stageId=""
                      onUpdate={updateShouldRespondPrompt}
                      blocks={blocks}
                      blocksLoaded={blocksLoaded}
                      hideDebateItems={hideDebateItems}
                      showParticipantProfiles={hideDebateItems}
                    />

                  </div>
                ) : activePromptTab === 'initialization' ? (
                  <div className="space-y-4">
                        <PromptEditorDescription description="A prompt that is run at the start of the conversation to gather information about the topic, participants, or anything else. This is information that can subsequently be accessed by your public assistant during the conversation. (via the Initialization Result variable)." />
                    <PromptBlockLegend textOnly simulationBlocks={blocks} usingDefaultBlocks={usingDefaultBlocks} hideDebateItems={hideDebateItems} />
                    <StructuredPromptEditor
                      label="Initialization Prompt Editor"
                      prompt={(publicAssistantParsed?.initialization_context_prompt ?? publicAssistantParsed?.preload_context_prompt) as PromptItem[] ?? []}
                      stageId=""
                      onUpdate={updateInitializationContextPrompt}
                      blocks={blocks}
                      blocksLoaded={blocksLoaded}
                      textOnly={true}
                      hideDebateItems={hideDebateItems}
                      showParticipantProfiles={hideDebateItems}
                    />
                  </div>
                ) : null}
              </div>
            </div>
            
            <div className="border-b border-neutral-800 pb-3">
              <h2 className="text-lg font-semibold tracking-tight">Public Assistant Configuration</h2>
            </div>

            <div id="tour-chat-settings">
              <ConfigSection
                title="Public Assistant Parameters"
                parsed={publicAssistantParsed}
                onUpdate={updatePublicAssistantField}
                fields={[
                  { label: 'Typing Speed (Words Per Minute)', description: "Public Assistant typing speed. Set to zero for instant messages.", path: ['chat_settings', 'words_per_minute'], type: 'number', min: 0, max: 2000, step: 1 },
                  { label: 'Min User Messages Before Responding', description: "After the public assistant has sent its first message, this many participant messages must be sent before the public assistant is allowed to respond again.", path: ['min_participant_messages_before_responding'], type: 'number', min: 0, max: 20, step: 1 },
                  { label: 'Temperature', description: "Control the randomness of the model. 0 = deterministic, 1 = unpredictable.", path: ['generation', 'temperature'], type: 'number', min: 0, max: 2, step: 0.1 },
                  { label: 'Initial Message', description: "Message sent automatically when the conversation begins.", path: ['chat_settings', 'initial_message'], type: 'text', placeholder: "Hello! I'm here to help with..." },
                ]}
              />
            </div>

          </div>

        </div>
      </div>
    </div>
  )
}
