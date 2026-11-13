import path from 'path'
import {
  BASE_URL, API_KEY, FRONTEND_BASE,
  STAGE_R1, POST_SURVEY_STAGE_ID, EXPERIMENT_DEFAULT,
  PRE_SURVEY_STAGE_ID,
} from './config'
import { parseMediatorTemplate, buildMediator } from './parsers/mediator'
import { buildAgent } from './parsers/agent'
import type { AgentParticipantTemplate } from './parsers/agent'
import { buildTopic, buildStages, buildExperiment } from './parsers/experiment'
import { loadTemplate, replaceDefaults, fillAgentStance, agentConfig, createParticipant, excludeNone } from './utils'
import { url } from 'inspector/promises'

export type Mode = 'human-human' | 'human-agent' | 'agent-agent'
type ParticipantSlot = { slot: string; type: 'human' | 'agent'; template?: string }

const randint = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a
const COHORT_RATINGS: [number, number][] = [[1, 7], [1, 6], [2, 7], [2, 6]]   // same as TrAuSt-util competition/tracks.py
const SIDES = ['supporting the debate statement', 'opposing the debate statement']

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

// The toolkit picks the mode via the request/button, so we build the participant
// slots from `mode`. The agent template path is data here (mirrors the `participants`
// block generator.py reads from YAML: `template: templates/defaults/agent-N.yaml`),
// resolved like the topic experiment.yaml path below.
const defaultTemplate = (file: string) => path.join(process.cwd(), 'public', 'templates', 'defaults', file)

function participantSlotsFor(mode: Mode): ParticipantSlot[] {
  if (mode === 'agent-agent') {
    return [
      { slot: 'p1', type: 'agent', template: defaultTemplate('agent-1.yaml') },
      { slot: 'p2', type: 'agent', template: defaultTemplate('agent-2.yaml') },
    ]
  }
  if (mode === 'human-agent') {
    return [
      { slot: 'p1', type: 'human' },
      { slot: 'p2', type: 'agent', template: defaultTemplate('agent-1.yaml') },
    ]
  }
  return [
    { slot: 'p1', type: 'human' },
    { slot: 'p2', type: 'human' },
  ]
}

// Mediator randomization within each cohort
const BIAS_VARIABLE_CONFIG = {
  id: 'bias-target',
  type: 'random_permutation',
  scope: 'cohort',
  definition: {
    name: 'target_bias_position',
    description: 'Which side the mediator favors (randomized per cohort)',
    schema: { type: 'array', items: { type: 'string' } },
  },
  shuffleConfig: { shuffle: true, seed: 'cohort', customSeed: '' },
  values: [JSON.stringify('supporting the debate statement'), JSON.stringify('opposing the debate statement')],
  expandListToSeparateVariables: false,
  numToSelect: 1,
}

export async function generate(p1: string, p2: string, experimentTemplatePath: string, mediatorTemplateContent: string,
                          mode: Mode, numCohorts?: number, numUtterances?: number, action?: 'create' | 'simulate') {
  const experimentTemplate = replaceDefaults(
    loadTemplate(experimentTemplatePath),
    loadTemplate(EXPERIMENT_DEFAULT),
  )
  const topicInfo = buildTopic(experimentTemplate.topic)

  const stages = buildStages(experimentTemplate, topicInfo)
  const stageIdsInOrder = stages.map((s) => s.id)

  // one mediator + one chat supported for now
  const chatStageId = stages.find((s) => s.kind === 'chat')?.id ?? STAGE_R1
  const preSurveyStageId = stages.find((s) => s.kind === 'survey' && s.id === PRE_SURVEY_STAGE_ID)?.id ?? PRE_SURVEY_STAGE_ID
  const postSurveyStageId = [...stages].reverse().find((s) => s.kind === 'survey')?.id ?? POST_SURVEY_STAGE_ID

  const mediatorTemplate = parseMediatorTemplate(mediatorTemplateContent)

  const mediatorR1 = buildMediator(chatStageId, mediatorTemplate, stageIdsInOrder, topicInfo)

  const exp = experimentTemplate.experiment ?? {}
  const participantSlots = participantSlotsFor(mode)
  const slotToPid: Record<string, string> = { p1, p2 }

  const agentSlots = participantSlots.filter((s) => s.type === 'agent').map((s) => s.slot)

  const isSim = mode === 'agent-agent'

  const chatStage = stages.find((s) => s.kind === 'chat')
  if (chatStage) {
    if (isSim) {
      // currently not removing the timer limit, in case simulation gets stuck in some cohorts, they can still finish within this time.
      chatStage.timeLimitInMinutes = 4
      chatStage.requireFullTime = false
      if (numUtterances != null) chatStage.numUtterances = numUtterances  // else keep template default
    } else {
      chatStage.numUtterances = null
    }
  }

  const numCohortsResolved = (mode === 'agent-agent' && action === 'simulate')
    ? (numCohorts && numCohorts >= 1 ? numCohorts : (Number(exp.num_cohorts) || 1))
    : 1

  // each cohort gets a randomized pair
  const cohortAgents: AgentParticipantTemplate[][] = []
  const agentStances: Record<string, any>[] = []
  const humanSlots: Record<string, string> = {}
  const cohortAgentConfigs: string[][] = []

  for (let ci = 0; ci < numCohortsResolved; ci++) {
    const ratings = isSim
      ? shuffle([...COHORT_RATINGS[ci % COHORT_RATINGS.length]])
      : agentSlots.map(() => randint(1, 7))
    const stance: Record<string, any> = {}
    agentSlots.forEach((slot, i) => {
      stance[slot] = { rating: ratings[i], }
    })

    const pair: AgentParticipantTemplate[] = []
    const configs: string[] = []

    for (const pSlot of participantSlots) {
      const slot = pSlot.slot
      if (pSlot.type === 'agent') {
        const tpl = loadTemplate(pSlot.template!)
        if (isSim) tpl.persona.id = `${tpl.persona.id}-c${ci}`
        const s = stance[slot]
        const [filled, finalStance] = fillAgentStance(tpl, topicInfo, s.rating, s.rating)
        stance[slot] = { side: finalStance.side, strength: finalStance.strength } // removing rating and concession info

        configs.push(filled.agent_config ?? '')
        pair.push(buildAgent(chatStageId, preSurveyStageId, postSurveyStageId, filled, stageIdsInOrder))
      } else {
        humanSlots[slot] = slotToPid[slot] ?? slot
      }
    }
    cohortAgents.push(pair)
    agentStances.push(stance)
    cohortAgentConfigs.push(configs)
  }

  const agents = cohortAgents.flat() 

  // first half of the cohorts push toward supporting, second half toward opposing
  const simAliases = isSim ? Array.from({ length: numCohortsResolved }, (_, i) => `sim-${i + 1}`) : []
  const [template, cohortAlias] = buildExperiment(experimentTemplate, topicInfo, stages, stageIdsInOrder, mediatorR1, agents, mode, isSim, simAliases)
  const sideOf = (i: number) => JSON.stringify([SIDES[i < numCohortsResolved / 2 ? 0 : 1]])
  template.experiment.variableConfigs = [isSim
    ? { id: BIAS_VARIABLE_CONFIG.id, type: 'static', scope: 'cohort', definition: BIAS_VARIABLE_CONFIG.definition,
        value: sideOf(0), cohortValues: Object.fromEntries(simAliases.map((a, i) => [a, sideOf(i)])) }
    : BIAS_VARIABLE_CONFIG]

  const authHeaders = {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  }

  let expId: string
  let cohortIds: string[]
  let cohortBias: (Record<string, string> | null)[] = []

  if (isSim) {
    const expRes = await fetch(`${BASE_URL}/experiments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ template: excludeNone(template) }),
    })
    if (!expRes.ok) throw new Error(`create_simulation failed: ${await expRes.text()}`)
    const expJson = await expRes.json()
    expId = expJson.experiment.id

    // the cohorts were created with the experiment (one per alias); look up their ids like the non-sim path below
    const exportRes = await fetch(`${BASE_URL}/experiments/${expId}/export`, { method: 'GET', headers: authHeaders })
    if (!exportRes.ok) throw new Error(`export_experiment failed: ${await exportRes.text()}`)
    const expData = await exportRes.json()
    const generated: Record<string, string> = {}
    for (const c of expData.experiment.cohortDefinitions) generated[c.alias] = c.generatedCohortId
    cohortIds = simAliases.map(a => generated[a])
    cohortBias = await Promise.all(cohortIds.map(async cid => {
      const res = await fetch(`${BASE_URL}/experiments/${expId}/cohorts/${cid}`, { method: 'GET', headers: authHeaders })
      if (!res.ok) return null
      const cohortJson = await res.json()
      return (cohortJson.cohort ?? cohortJson)?.variableMap ?? null
    }))
  } else {
    const expRes = await fetch(`${BASE_URL}/experiments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ template: excludeNone(template) }),
    })

    if (!expRes.ok) throw new Error(`create_experiment failed: ${await expRes.text()}`)
    const result = await expRes.json()
    expId = result.experiment.id

    const exportRes = await fetch(`${BASE_URL}/experiments/${expId}/export`, { method: 'GET', headers: authHeaders })
    if (!exportRes.ok) throw new Error(`export_experiment failed: ${await exportRes.text()}`)
    const expData = await exportRes.json()
    const generated: Record<string, string> = {}
    for (const c of expData.experiment.cohortDefinitions) generated[c.alias] = c.generatedCohortId
    cohortIds = [generated[cohortAlias]]

    const cohortRes = await fetch(`${BASE_URL}/experiments/${expId}/cohorts/${cohortIds[0]}`, { method: 'GET', headers: authHeaders })
    if (cohortRes.ok) {
      const cohortJson = await cohortRes.json()
      cohortBias = [(cohortJson.cohort ?? cohortJson)?.variableMap ?? null]
    }
  }

  const agentUrls: Record<string, string>[] = []

  for (let i = 0; i < cohortIds.length; i++) {
    const urls: Record<string, string> = {}
    for (let k = 0; k < cohortAgents[i].length; k++) {
      const created = await createParticipant(expId, cohortIds[i], agentConfig(cohortAgents[i][k], cohortAgentConfigs[i][k]))
      urls[agentSlots[k]] = `${FRONTEND_BASE}/#/e/${expId}/p/${created.id}`
    }
    agentUrls.push(urls)
  }

  const experimentUrl = `${FRONTEND_BASE}/#/e/${expId}`

  const biasFor = (i: number) => {
    const vm = cohortBias[i]
    if (!vm) return null
    const parse = (s?: string) => { try { return s != null ? JSON.parse(s) : null } catch { return s ?? null } }
    return { side: parse(vm.target_bias_position)[0], }
  }

  const cohorts = cohortIds.map((cid, i) => {
    const url = `${FRONTEND_BASE}/#/e/${expId}/c/${cid}`

    const humanUrls: Record<string, string> = {}
    for (const [slot, pid] of Object.entries(humanSlots)) {
      humanUrls[slot] = `${url}?PROLIFIC_PID=${pid}`
    }

    if (mode === 'human-human') {
      const participant_urls: Record<string, string>[] = []
      for (const [slot, url] of Object.entries(humanUrls)) {
        participant_urls.push({ url: url, type: 'human', })
      }
      return { cohort_id: cid, participant_urls: participant_urls, mediator_bias: biasFor(i) }
    } 
    else if (mode === 'human-agent') {
      const participant_urls: Record<string, string>[] = []
      for (const [slot, url] of Object.entries(humanUrls)) {
        const human_url = `${url}`
        participant_urls.push({ url: human_url, type: 'human', })
      }
      return { cohort_id: cid, participant_urls: participant_urls, agent_stances: agentStances[i].p2, mediator_bias: biasFor(i) }
    }
    else if (mode === 'agent-agent' && action === 'create') {
      const participant_urls: Record<string, string>[] = []
      for (const [slot, url] of Object.entries(agentUrls[i])) {
        participant_urls.push({ url: url, type: 'agent', })
      }
      return { participant_urls: participant_urls, agent_stances: agentStances[i], mediator_bias: biasFor(i) }
    }
    // simplify the return of simulations, hiding links, only show stances
    return { agent_stances: agentStances[i], mediator_bias: biasFor(i) }
  })

  return {
    mode,
    topic: topicInfo.name,
    experiment_id: expId,
    // experiment_url: experimentUrl,
    cohorts,
    // is_sim: (mode === 'agent-agent' && action === 'simulate'),
  }
}
