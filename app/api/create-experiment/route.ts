import path from 'path'
import fs from 'fs'
import { generate, type Mode } from './generator'
import { MEDIATOR_PRESET } from './config'
import { adminAuth, adminDb } from '../../lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'
import { TOPIC_SETS } from '@/app/lib/topicSets'

const MODES: Mode[] = ['human-human', 'human-agent', 'agent-agent']

function todayInEST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
}

async function checkAndIncrementQuota(email: string, cohorts: number): Promise<{ allowed: boolean; used: number; limit: number }> {
  const configRef = adminDb.collection('toolkit').doc('config')
  const userRef = adminDb.collection('toolkitDevelopers').doc(email)
  const today = todayInEST()

  return adminDb.runTransaction(async (tx) => {
    const [configSnap, userSnap] = await Promise.all([tx.get(configRef), tx.get(userRef)])
    const limit: number = configSnap.data()?.dailySimLimit ?? 10
    const userData = userSnap.data() ?? {}
    const lastDate: string = userData.simCountDate ?? ''
    const currentCount: number = lastDate === today ? (userData.dailySimCount ?? 0) : 0

    if (currentCount >= limit) return { allowed: false, used: currentCount, limit }

    tx.update(userRef, {
      dailySimCount: currentCount + cohorts,
      simCountDate: today,
      lastSimulationRan: FieldValue.serverTimestamp(),
    })
    return { allowed: true, used: currentCount + cohorts, limit }
  })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const { mediatorTemplate, simulationTemplate, assistantTemplate, assistantTemplates, agentTemplate, agentTemplates, mediator = 'template', numAgents, p1 = 'participant-1', p2 = 'participant-2', variant = 'default', mode, seats, numCohorts, numUtterances, action = 'create', idToken, postTitle, postDescription, experimentTemplateSet, agentAssignment, opParticipant, publicizeAssistantMessages, allowPublicMessageDeletion } = body as {
    mediatorTemplate?: string
    simulationTemplate?: string
    assistantTemplate?: string
    // One entry per *seat*, null where that seat runs unassisted. Takes
    // precedence over the single `assistantTemplate` + `agentAssignment` pair,
    // which the assistant toolkits still send and which can only ever address
    // p1 and p2.
    assistantTemplates?: (string | null)[]
    agentTemplate?: string
    // One entry per agent slot, null where the simulation toolkit's pick did
    // not resolve. Takes precedence over the single `agentTemplate`, which the
    // agent toolkit still sends for its one-template-everywhere runs.
    agentTemplates?: (string | null)[]
    // Which mediator to run with: the caller's own `mediatorTemplate`, the stock
    // preset, or none at all.
    mediator?: 'template' | 'preset' | 'none'
    numAgents?: string | number
    p1?: string
    p2?: string
    variant?: string
    mode?: Mode
    // The conversation's seats in order, when the caller lays them out itself
    // (the simulation toolkit does, from its Pairings). Without it the layout
    // comes from `mode` alone, which is what every other toolkit sends.
    seats?: ('human' | 'agent')[]
    numCohorts?: string | number
    numUtterances?: string | number
    action?: 'create' | 'simulate'
    idToken?: string
    postTitle?: string
    postDescription?: string
    experimentTemplateSet?: 'reddit' | 'wikipedia'
    agentAssignment?: 'participant-1' | 'participant-2' | 'both'
    opParticipant?: 'participant-1' | 'participant-2'
    // Experiment-wide chat settings for runs that send no simulation (the
    // Reddit assistant); a simulation's own settings take precedence.
    publicizeAssistantMessages?: boolean
    allowPublicMessageDeletion?: boolean
  }

  const parsedCohorts = parseInt(String(numCohorts), 10)
  const cohortCount = Number.isFinite(parsedCohorts) && parsedCohorts >= 1 ? parsedCohorts : undefined

  const parsedUtterances = parseInt(String(numUtterances), 10)
  const utteranceCount = Number.isFinite(parsedUtterances) && parsedUtterances >= 1 ? parsedUtterances : undefined

  const parsedAgents = parseInt(String(numAgents), 10)
  const agentCount = Number.isFinite(parsedAgents) && parsedAgents >= 2 ? parsedAgents : undefined

  // Only the mediator toolkit sends mediatorTemplate — assistant-toolkit pages send
  // assistantTemplate instead and never a mediator, so their experiments have none.
  let mediatorContent: string | null
  if (mediator === 'none') {
    mediatorContent = null
  } else if (mediator === 'preset') {
    mediatorContent = fs.readFileSync(MEDIATOR_PRESET, 'utf8')
  } else {
    mediatorContent = mediatorTemplate ?? null
  }

  if (!mode || !MODES.includes(mode)) {
    return Response.json({ error: `invalid or missing mode: ${mode}` }, { status: 400 })
  }

  const seatList = Array.isArray(seats) && seats.length > 0 ? seats : undefined
  if (seatList && seatList.some((s) => s !== 'human' && s !== 'agent')) {
    return Response.json({ error: 'seats may only hold "human" or "agent"' }, { status: 400 })
  }
  if (seatList && seatList.length < 2) {
    return Response.json({ error: 'a conversation needs at least 2 seats' }, { status: 400 })
  }

  // A run somebody has to join cannot be batched: the cohorts would sit empty
  // waiting for people who were never sent a link.
  if (action === 'simulate' && seatList?.includes('human')) {
    return Response.json({ error: 'a run with a human seat cannot be simulated in batch' }, { status: 400 })
  }

  if (action === 'simulate') {
    if (!idToken) return Response.json({ error: 'Authentication required' }, { status: 401 })
    let email: string
    try {
      const decoded = await adminAuth.verifyIdToken(idToken)
      email = decoded.email!
    } catch {
      return Response.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const quota = await checkAndIncrementQuota(email, cohortCount ?? 1)
    if (!quota.allowed) {
      return Response.json({ error: `Daily simulation limit reached (${quota.limit}/day). Resets at midnight EST.` }, { status: 429 })
    }
  }

  // const topicsDir = path.join(process.cwd(), 'public', 'templates', 'topics')
  // const topics = ['congestion_pricing', 'covenant_marriage'] 

  let experimentTemplatePath: string
  if (experimentTemplateSet === 'reddit') {
    experimentTemplatePath = path.join(process.cwd(), 'public', 'templates', 'reddit', 'experiment.yaml')
  } else if (experimentTemplateSet === 'wikipedia') {
    experimentTemplatePath = path.join(process.cwd(), 'public', 'templates', 'wikipedia', 'experiment.yaml')
  } else if (simulationTemplate) {
    // A simulation template brings its own topic, so it always runs against the
    // dedicated "simulation" template rather than a randomized one. It lives in
    // the default set, which is why the topic set is not consulted here.
    experimentTemplatePath = path.join(process.cwd(), 'public', 'templates', 'topics', 'simulation', 'experiment.yaml')
  } else {
    // Topic sets let the in-class (FA2026) toolkit draw from its own topics
    // while every other caller keeps randomizing over the default set.
    const set = TOPIC_SETS[variant as keyof typeof TOPIC_SETS] ?? TOPIC_SETS.default
    const topicsDir = path.join(process.cwd(), 'public', 'templates', set.dir)
    const chosen = set.topics[Math.floor(Math.random() * set.topics.length)]
    experimentTemplatePath = path.join(topicsDir, chosen, 'experiment.yaml')
  }

  try {
    const result = await generate(p1, p2, experimentTemplatePath, mediatorContent, mode, cohortCount, utteranceCount, action,
      simulationTemplate, agentCount, assistantTemplate, postTitle, postDescription, agentAssignment, experimentTemplateSet, opParticipant,
      agentTemplates?.length ? agentTemplates : agentTemplate, seatList,
      assistantTemplates?.length ? assistantTemplates : undefined,
      {
        publicizeAssistantMessages: typeof publicizeAssistantMessages === 'boolean' ? publicizeAssistantMessages : undefined,
        allowPublicMessageDeletion: typeof allowPublicMessageDeletion === 'boolean' ? allowPublicMessageDeletion : undefined,
      })
    return Response.json(result)
  } catch (e) {
    console.error('Error in create-experiment:', e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
