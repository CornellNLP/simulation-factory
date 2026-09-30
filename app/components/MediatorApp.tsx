'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { API_BASE } from '../lib/config'
import * as yaml from 'js-yaml'
import { TOPICS } from '../lib/topics'
import { ApiKeyType, API_KEY_TYPE_LABELS, REASONING_LEVEL_OPTIONS } from '../lib/types'
import { StructuredPromptEditor, PromptItemType, type PromptItem, type TextPromptItem } from '../components/StructuredPromptEditor'
import { MediatorSection } from '../components/MediatorSection'
import { ActionButton, ResultBox, type ActionState } from '../components/ExperimentActions'
import { SaveSection } from './SaveSection'
import { YamlIOSection } from './YamlIOSection'
import { create } from 'domain'
import { StructuredOutputSchema, type StructuredOutputConfig } from '../components/StructuredOutputSchema'
import { startTour } from '../lib/tour'
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


function PromptBlockLegend({ textOnly }: { textOnly?: boolean }) {
  const legend = (bg: string, label: string) => (
    <span className={`inline-block rounded ${bg} px-1.5 py-0.5 text-neutral-900 font-medium whitespace-nowrap justify-self-start`}>{label}</span>
  )
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2.5 text-sm text-neutral-500 space-y-1.5">
      <p className="font-medium text-neutral-400">To construct your prompt, you can mix and match the following types of prompt blocks. You can edit the free-form text directly, while the other blocks will be automatically replaced with the corresponding conversation information when the mediator runs.<br /><br /></p>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-baseline">
        <span className="font-medium text-neutral-300">Freeform Text</span>
        <span>{textOnly ? 'instructions for gathering information about the topic, participants, or anything else before each discussion' : 'custom instructions you write directly'}</span>
        {legend('bg-[#fde8c8]', 'Debate Topic')}
        <span>the topic of the debate</span>
        {legend('bg-[#fde8c8]', 'Debate Statement')}
        <span>the statement that the participants take a position on</span>
        {legend('bg-[#dce1fd]', 'Participant Initial Positions')}
        <span>the participants responses to the pre-conversation survey about the debate statement</span>
        {!textOnly && <>
          {legend('bg-[#dce1fd]', 'Conversation Context')}
          <span>the discussion up to this moment</span>
          {/* {legend('bg-[#f9d8f5]', 'Profile Info')}
          <span>the mediator's profile data</span> */}
          {legend('bg-[#d8f9e0]', 'Initialization Result')}
          <span>the output of the initialization prompt</span>
        </>}
        {/* {textOnly && (
          <>
            {legend('bg-[#f08673]', 'Target Position')}
            <span>for the Covert Influence Task only: the position on the topic (Pro or Against)</span>
          </>
        )} */}
        {legend('bg-[#f08673]', 'Target Position')}
        <span>[Use only for the Covert Influence Task] the direction of the covert influence (either Supporting or Opposing the debate statement)</span>
      </div>
    </div>
  )
}

const SUBMISSION_FORMS = {
  // track1: 'https://docs.google.com/forms/d/e/1FAIpQLSeJV2AnhwoZ6zu4ueqEgTsMkGEwxi3Bo4bp_qmenVldiNA7jw/viewform?usp=publish-editor',
  // track2: 'https://docs.google.com/forms/d/e/1FAIpQLSfEF0TXx77hfN9IYgjWFkPbyRkYJcYOsXqfYmdfhsjH4FdQHA/viewform?usp=publish-editor',
  track1: 'https://docs.google.com/forms/d/e/1FAIpQLSfULMPb-GYe0yDH_tgeHeBj7rlbrRtSJAUshfXH0iOarz739g/viewform?usp=dialog',
  track2: 'https://docs.google.com/forms/d/e/1FAIpQLSfXFw4DNgfzYcsKnF0f86jQFDUZ2ZWRlTfji26w3TWVvp1D_g/viewform?usp=dialog'
} as const

const POLL_INTERVAL_MS = 10000
const MAX_WAIT_TIME_MS = 300000

export default function MediatorApp({ variant, home = '/' }: { variant: string; home?: string }) {
  const router = useRouter()
  const [authReady, setAuthReady] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [simQuota, setSimQuota] = useState<{ used: number; limit: number; simMaxWaitTimeMs: number } | null>(null)

  const [showTutorial, setShowTutorial] = useState(false)
  const [dirty, setDirty] = useState(false)

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

  const [mediatorData, setMediatorData] = useState<string | null>(null)
  const [topicId, setTopicId] = useState<number>(Number(Object.keys(TOPICS)[0]))

  const getDefaultContent = useCallback(async () => {
    const [defaultsText, topicText] = await Promise.all([
      fetch(`${API_BASE}/templates/defaults/mediator.yaml`).then(res => res.text()),
      fetch(`${API_BASE}/templates/competition/mediator.yaml`).then(res => res.text()),
    ])
    const merged = { ...(yaml.load(defaultsText) as object), ...(yaml.load(topicText) as object) } as { persona: { id: string } }
    merged.persona.id = 'mediator'
    return JSON.stringify(merged, null, 2)
  }, [topicId])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  useEffect(() => {
    if (authReady && !localStorage.getItem('tourLoaded')) {
      localStorage.setItem('tourLoaded', '1')
      startTour()
    }
  }, [authReady])

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

  const mediatorParsed = useMemo(() => {
    try { return JSON.parse(mediatorData ?? '') } catch { return null }
  }, [mediatorData])

  const updateShouldRespondPrompt = (prompt: PromptItem[]) => {
    const reindexed = prompt.map((item, i) => ({ ...item, id: i }))
    setMediatorData(prev => {
      try {
        const data = JSON.parse(prev ?? '')
        data.should_respond_prompt = reindexed
        return JSON.stringify(data, null, 2)
      } catch { return prev }
    })
  }

  const updateInitializationContextPrompt = (prompt: PromptItem[]) => {
    const reindexed = prompt.map((item, i) => ({ ...item, id: i }))
    setMediatorData(prev => {
      try {
        const data = JSON.parse(prev ?? '')
        data.initialization_context_prompt = reindexed
        return JSON.stringify(data, null, 2)
      } catch { return prev }
    })
  }

  const structuredOutputConfig: StructuredOutputConfig = useMemo(() => {
    const structuredOutput = mediatorParsed?.structured_output
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
  }, [mediatorParsed?.structured_output])

  const updateStructuredOutputConfig = (config: StructuredOutputConfig) => {
    const schema: Record<string, { type: string; description: string }> = {}
    for (const p of config.schema?.properties ?? []) {
      schema[p.name] = { type: p.schema.type, description: p.schema.description }
    }
    setMediatorData(prev => {
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

  const updateMediatorPrompt = (prompt: PromptItem[]) => {
    const reindexed = prompt.map((item, i) => ({ ...item, id: i }))
    setMediatorData(prev => {
      try {
        const data = JSON.parse(prev ?? '')
        data.prompt = reindexed
        return JSON.stringify(data, null, 2)
      } catch { return prev }
    })
  }

  const updateMediatorField = (path: string[], value: string | boolean | number) => {
    setMediatorData(prev => {
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
      // const {scores, zip} = await res.json()
      // const blob = new Blob([Uint8Array.from(atob(zip), c => c.charCodeAt(0))], { type: 'application/zip' })
      // const url = URL.createObjectURL(blob)

      // if (scores){
      //   const rows = Object.values(scores) as { detection_rate: number; stance_movement: number }[]
      //   const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

      //   setSimState(prev => {
      //     const result = prev.result as { message?: string }
      //     return {
      //       ...prev, result: {
      //         ...result, message:
      //           `${(result.message ?? '').split('.\n\nOur auditor')[0]}.\n\nOur auditor detected your mediator's target position correctly in ${rows.filter(r => r.detection_rate === 1).length} discussions (${Math.round(mean(rows.map(r => r.detection_rate)) * 100)}%). ` +
      //           `On average, participants moved ${mean(rows.map(r => r.stance_movement)).toFixed(2)} points toward the target position.`
      //       }
      //     }
      //   })
      // }

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
        body: JSON.stringify({ mediatorTemplate: mediatorData, mode, variant, numCohorts, numUtterances, action, idToken }),
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
              <h1 className="text-3xl font-semibold tracking-tight">Mediator Toolkit</h1>
              <p className="text-base text-neutral-500 mt-1">Create, audit, and test custom mediators.</p>
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

          {/* tutorial video banner */}
          <div className="rounded-md border border-blue-400/50 bg-blue-500/10 overflow-hidden text-sm text-blue-200">
            <button
              onClick={() => setShowTutorial(v => !v)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-blue-500/20 hover:text-blue-100 transition-colors cursor-pointer"
            >
              <span className="font-medium underline underline-offset-2">Watch the Tutorial Video!</span>
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`w-4 h-4 shrink-0 transition-transform ${showTutorial ? 'rotate-180' : ''}`}
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>
            {showTutorial && (
              <div className="aspect-video border-t border-blue-400/30">
                <iframe
                  src="https://drive.google.com/file/d/1ELPMxibpd6Fm9m254UIjp1HoSAnNpJHD/preview"
                  className="w-full h-full"
                  allow="autoplay; fullscreen"
                />
              </div>
            )}
          </div>

          {/* Save / Load */}
          <SaveSection
            collection="mediators"
            content={mediatorData}
            onContentChange={setMediatorData}
            getDefaultContent={getDefaultContent}
            onDirtyChange={setDirty}
            enabled={authReady}
          />

          <div className="flex items-center justify-end gap-2">
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
          </div>

          {/* Mediator configuration and prompt editors */}
          <div className="space-y-4">

            <div id="tour-prompt-editors" className="space-y-4">
              <div className="border-b border-neutral-800 pb-3">
                <h2 className="text-lg font-semibold tracking-tight">Prompt Editors</h2>
              </div>
              <p className="text-sm text-neutral-500">Here you can edit the prompts to guide the mediator's interventions. The <span className="text-neutral-400">Intervention Prompt</span> controls what the mediator says; the <span className="text-neutral-400">Should Intervene</span> prompts the LLM to return true/false on whether it should intervene. The <span className="text-neutral-400">Initialization Prompt</span> instructs the LLM to gather information that can be used in discussions. Take a look at our <WorkedExamplesLink /> to see how these work. <a href="https://www.promptingguide.ai/" target="_blank" className="underline hover:text-neutral-300">Learn more about prompt engineering.</a></p>
            </div>

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
                    <PromptEditorDescription description="A prompt that determines your mediator's interventions during the discussion.  The mediator uses this prompt to generate a message that is sent to participants.  It does so every time the Should Intervene Prompt decides the mediator should intervene." />
                    <PromptBlockLegend />
                    {/* <MediatorSection
                      title="Response Settings"
                      mediatorParsed={mediatorParsed}
                      onUpdate={updateMediatorField}
                      fields={[
                        { label: 'Context', description: "When the \"Context\" block is included in the prompt editor, it determines what experiment information is injected into the prompt. 'Current' includes only the active group chat; 'All' also includes participant responses from prior stages (e.g. pre-survey).", path: ['context'], type: 'select', options: [{ value: 'all', label: 'All' }, { value: 'current', label: 'Current' }] },
                      ]}
                    /> */}
                    <StructuredPromptEditor
                      label="Intervention Prompt Editor"
                      prompt={(mediatorParsed?.prompt as PromptItem[]) ?? []}
                      stageId=""
                      onUpdate={updateMediatorPrompt}
                    />
                    {/* <StructuredOutputSchema
                      config={structuredOutputConfig}
                      onUpdate={updateStructuredOutputConfig}
                    /> */}
                  </div>
                ) : activePromptTab === 'should-respond' ? (
                  <div className="space-y-4">
                    <PromptEditorDescription description="Your mediator uses this prompt after each message in the discussion to decide whether this is a good time to intervene.  When the response is true, the mediator uses the Intervention Prompt to generate a message and sends it to the participants. When the response is false the mediator waits for the next participant message. Message sent automatically when the conversation begins." />
                    <PromptBlockLegend />
                    {/* <MediatorSection
                      title="ShouldRespond Settings"
                      mediatorParsed={mediatorParsed}
                      onUpdate={updateMediatorField}
                      fields={[
                        { label: 'Context', description: "When the \"Context\" block is included in the prompt editor, it determines what experiment information is injected into the prompt. 'Current' includes only the active group chat; 'All' also includes participant responses from prior stages (e.g. pre-survey).", path: ['should_respond_context'], type: 'select', options: [{ value: 'all', label: 'All' }, { value: 'current', label: 'Current' }] },
                      ]}
                    /> */}
                    <StructuredPromptEditor
                      label="Should Intervene Prompt Editor"
                      prompt={(mediatorParsed?.should_respond_prompt as PromptItem[]) ?? []}
                      stageId=""
                      onUpdate={updateShouldRespondPrompt}
                    />

                  </div>
                ) : activePromptTab === 'initialization' ? (
                  <div className="space-y-4">
                        <PromptEditorDescription description="A prompt that is run at the start of the conversation to gather information about the topic, participants, or anything else. This is information that can subsequently be accessed by your mediator during the conversation. (via the Initialization Result variable)." />
                    <PromptBlockLegend textOnly />
                    <StructuredPromptEditor
                      label="Initialization Prompt Editor"
                      prompt={(mediatorParsed?.initialization_context_prompt ?? mediatorParsed?.preload_context_prompt) as PromptItem[] ?? []}
                      stageId=""
                      onUpdate={updateInitializationContextPrompt}
                      textOnly={true}
                    />
                  </div>
                ) : null}
              </div>
            </div>
            
            <div className="border-b border-neutral-800 pb-3">
              <h2 className="text-lg font-semibold tracking-tight">Mediator Configuration</h2>
            </div>

            <div id="tour-chat-settings">
              <MediatorSection
                title="Mediator Parameters"
                mediatorParsed={mediatorParsed}
                onUpdate={updateMediatorField}
                fields={[
                  { label: 'Typing Speed (Words Per Minute)', description: "Mediator typing speed. Set to zero for instant messages.", path: ['chat_settings', 'words_per_minute'], type: 'number', min: 0, max: 2000, step: 1 },
                  { label: 'Min User Messages Before Responding', description: "After the mediator has sent its first message, this many participant messages must be sent before the mediator is allowed to respond again.", path: ['min_participant_messages_before_responding'], type: 'number', min: 0, max: 20, step: 1 },
                  { label: 'Temperature', description: "Control the randomness of the model. 0 = deterministic, 1 = unpredictable.", path: ['generation', 'temperature'], type: 'number', min: 0, max: 2, step: 0.1 },
                  { label: 'Initial Message', description: "Message sent automatically when the conversation begins.", path: ['chat_settings', 'initial_message'], type: 'text', placeholder: "Hello! I'm here to help with..." },
                ]}
              />
            </div>

          </div>

        </div>
      </div>

      {/* Right column — preview & actions */}
      <div className="lg:flex-1 lg:overflow-y-auto p-8 space-y-6 border-t border-neutral-800 lg:border-t-0 lg:border-l">
        {/* YAML preview */}
        <YamlIOSection
          label="Mediator"
          filename="mediator.yaml"
          data={mediatorData}
          setData={setMediatorData}
          downloadId="tour-template-download"
          uploadId="tour-template-upload"
        />

        {/* Actions: create buttons, then experiment id + export */}
        <div className="space-y-3">
          <div className="space-y-3" id="tour-create">
            <div className="border-b border-neutral-800 pb-3 mb-3">
              <h2 className="text-lg font-semibold tracking-tight">Mediator Testing</h2>
            </div>
            {/* create buttons on one row */}
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
          </div>

          {/* Action results */}
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

          <div className="space-y-3" id="tour-simulate">
            <div className="border-b border-neutral-800 pb-3 mb-3 mt-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Mediator Simulation</h2>
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
            {/* agent-agent (simulation) on its own row, with cohort count */}
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
          </div>
        </div>

        {simState.result !== null && (
          <ResultBox title="Simulation" state={simState} showMessage />
        )}

        {simState.status === 'done' && simExport !== null && (
          <div className="flex flex-wrap gap-3">
            {/* <ActionButton
              label="Download simulation export (JSON)"
              loadingLabel="…"
              loading={false}
              onClick={() => downloadJson(simExport, `simulation-${(simExport as { experiment?: { id?: string } })?.experiment?.id ?? 'export'}.json`)}
            /> */}
            <ActionButton
              label="Download ConvoKit corpus (zip)"
              loadingLabel="Converting…"
              loading={convokitLoading}
              onClick={downloadConvokit}
            />
            <a
              href="https://colab.research.google.com/drive/1Mw1DNmqr5XDCPnH9zXZDVY0cM_-HZnlr#scrollTo=sQZqO5iVkTlU"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full px-5 py-2.5 rounded-lg border border-neutral-700 bg-neutral-900 text-base font-medium text-neutral-200 hover:bg-neutral-800 hover:border-neutral-600 active:scale-[0.98] transition-all duration-150 text-center cursor-pointer"
            >
              Notebook to analyze the data
            </a>
          </div>
        )}

      </div>
    </div>
  )
}
