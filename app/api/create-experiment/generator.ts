import path from 'path'
import {
  BASE_URL, API_KEY, FRONTEND_BASE,
  STAGE_R1, POST_SURVEY_STAGE_ID, EXPERIMENT_DEFAULT,
  PRE_SURVEY_STAGE_ID,
} from './config'
import { parseMediatorTemplate, buildMediator } from './parsers/mediator'
import { buildAgent } from './parsers/agent'
import type { AgentParticipantTemplate } from './parsers/agent'
import { parseAssistantTemplate, buildAssistant } from './parsers/assistant'
import type { AgentAssistantTemplate } from './parsers/assistant'
import { buildTopic, buildStages, buildExperiment } from './parsers/experiment'
import { parseSimulationTemplate, applySimulationToChatStage } from './parsers/simulation'
import { loadTemplate, replaceDefaults, fillAgentStance, fillAgentWithoutStance, agentConfig, createParticipant, excludeNone, resolveBlockItems, pickBlockDescription } from './utils'
import { url } from 'inspector/promises'

export type Mode = 'human-human' | 'human-agent' | 'agent-agent'
type ParticipantSlot = { slot: string; type: 'human' | 'agent'; template?: string; customTemplate?: Record<string, any> }

const randint = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a

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
// resolved like the topic experiment.yaml path below. Reddit-toolkit requests use the
// reddit-specific agent templates instead, which reference {post_title}/{post_description}.
const agentTemplate = (file: string, templateSet?: 'reddit' | 'wikipedia') =>
  path.join(process.cwd(), 'public', 'templates', templateSet === 'reddit' || templateSet === 'wikipedia' ? templateSet : 'defaults', file)

// Agent templates on disk, cycled through when a run asks for more agents than
// there are templates. The templates differ only by persona, so repeating one
// costs nothing: each slot still draws its own stance.
const AGENT_TEMPLATE_FILES = ['agent-1.yaml', 'agent-2.yaml']

// Picks the custom template for one agent slot and clones it.
//
// IMPORTANT: every slot must get its own clone with a slot-suffixed persona id.
// Saved agents all carry the same persona id (the Agent Participant toolkit
// derives it from the user's email and does not expose it for editing), so this
// suffix is the only thing keeping two agents in one cohort apart. Handing a
// template through unsuffixed makes the second agent overwrite the first.
//
// The list is indexed modulo its length: the simulation toolkit sends one entry
// per slot, while the agent toolkit sends a single template meant for every
// slot, and both land correctly. A null entry means the pick did not resolve,
// so that slot falls back to the stock template on disk.
function customTemplateFor(
  customAgentTemplates: (Record<string, any> | null)[] | undefined,
  index: number,
  slot: string,
): Record<string, any> | undefined {
  if (!customAgentTemplates?.length) return undefined
  const picked = customAgentTemplates[index % customAgentTemplates.length]
  if (!picked) return undefined
  const clone = structuredClone(picked)
  clone.persona = { ...clone.persona, id: `${clone.persona.id}-${slot}` }
  return clone
}

// The seats `mode` stands for. The three modes each describe one fixed layout,
// which is all the mediator, agent and assistant toolkits ever ask for.
function seatsForMode(mode: Mode, numAgents?: number): ('human' | 'agent')[] {
  if (mode === 'agent-agent') {
    const count = numAgents && numAgents >= 2 ? numAgents : AGENT_TEMPLATE_FILES.length
    return Array.from({ length: count }, () => 'agent' as const)
  }
  if (mode === 'human-agent') return ['human', 'agent']
  return ['human', 'human']
}

// `seats` lets a caller lay the conversation out itself — one entry per seat, in
// the order they should be handed to p1, p2, … — so a run can mix humans and
// agents in any arrangement rather than the three `mode` describes. The
// simulation toolkit sends it straight from its Pairings; everyone else sends
// only a mode and gets that mode's fixed layout.
function participantSlotsFor(mode: Mode, numAgents?: number, templateSet?: 'reddit' | 'wikipedia',
                             customAgentTemplates?: (Record<string, any> | null)[],
                             seats?: ('human' | 'agent')[]): ParticipantSlot[] {
  // Agent templates are positional against the *agents*, not against the seats,
  // so a human sitting in front of them must not shift the ones behind.
  let agentIndex = 0
  return (seats?.length ? seats : seatsForMode(mode, numAgents)).map((type, i) => {
    const slot = `p${i + 1}`
    if (type === 'human') return { slot, type: 'human' as const }
    const ai = agentIndex++
    return {
      slot,
      type: 'agent' as const,
      template: agentTemplate(AGENT_TEMPLATE_FILES[ai % AGENT_TEMPLATE_FILES.length], templateSet),
      customTemplate: customTemplateFor(customAgentTemplates, ai, slot),
    }
  })
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

// A simulation-toolkit run has no debate statement for a mediator to favor a side
// of, so any "Target Bias position" item left in a mediator it reuses is dropped
// rather than rendered as an unfilled `{{target_bias_position}}`.
function dropBiasItems(value: any): any {
  if (Array.isArray(value)) return value.filter((v) => v?.type !== 'BIASED').map(dropBiasItems)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, dropBiasItems(v)]))
  }
  return value
}

export async function generate(p1: string, p2: string, experimentTemplatePath: string, mediatorTemplateContent: string | null | undefined,
                          mode: Mode, numCohorts?: number, numUtterances?: number, action?: 'create' | 'simulate',
                          simulationTemplateContent?: string, numAgents?: number, assistantTemplateContent?: string,
                          postTitle?: string, postDescription?: string,
                          agentAssignment?: 'participant-1' | 'participant-2' | 'both', templateSet?: 'reddit' | 'wikipedia',
                          opParticipant?: 'participant-1' | 'participant-2',
                          // A single template applies to every agent slot (agent toolkit);
                          // a list is positional, one entry per agent (simulation toolkit).
                          agentTemplateContent?: string | (string | null)[],
                          // The conversation's seats in order, when the caller lays them out
                          // itself; otherwise `mode` decides them.
                          seats?: ('human' | 'agent')[],
                          // One assistant template per seat, in the same order as `seats`, null
                          // where that seat runs unassisted (simulation toolkit). Where it is
                          // given it replaces `assistantTemplateContent` + `agentAssignment`.
                          assistantTemplateContents?: (string | null)[]) {
  // Optional: when the simulation toolkit supplies a template, it owns the chat
  // stage description (and the conversation limits) instead of the topic YAML.
  const simulation = simulationTemplateContent
    ? parseSimulationTemplate(simulationTemplateContent)
    : null

  // A block can offer several alternative descriptions, and one of them is drawn
  // for the whole experiment: the chat stage description, the mediator prompt and
  // every agent prompt in every cohort must describe the conversation the same
  // way. Drawing here, before anything is built, also lets the live simulation
  // win over the stale copy a prompt item may carry for the same block name.
  const blockChoices = new Map<string, string>()
  for (const block of simulation?.blocks ?? []) {
    pickBlockDescription(block.name, block.descriptions, blockChoices)
  }

  const customAgentTemplates: (Record<string, any> | null)[] | undefined = agentTemplateContent
    ? (Array.isArray(agentTemplateContent) ? agentTemplateContent : [agentTemplateContent])
        .map((c) => (c ? JSON.parse(c) : null))
    : undefined

  const experimentTemplate = replaceDefaults(
    loadTemplate(experimentTemplatePath),
    loadTemplate(EXPERIMENT_DEFAULT),
  )
  const topicInfo = buildTopic(experimentTemplate.topic)

  // Simulations are just the conversation, so the surveys around it are dropped
  // and the run goes profile -> conversation. The simulation template carries no
  // surveys of its own; this also keeps them out should it inherit any.
  // Mediator-toolkit runs keep them.
  const SIM_SKIPPED_STAGES = [PRE_SURVEY_STAGE_ID, POST_SURVEY_STAGE_ID]
  const stages = buildStages(experimentTemplate, topicInfo, postTitle, postDescription)
    .filter((s) => !(simulation && SIM_SKIPPED_STAGES.includes(s.id)))
  const stageIdsInOrder = stages.map((s) => s.id)

  // one mediator + one chat supported for now
  const chatStageId = stages.find((s) => s.kind === 'chat')?.id ?? STAGE_R1
  // Null when the run has no pre-discussion survey, so no prompt is built for one.
  const preSurveyStageId = stages.find((s) => s.kind === 'survey' && s.id === PRE_SURVEY_STAGE_ID)?.id
    ?? (simulation ? null : PRE_SURVEY_STAGE_ID)
  // Null when the run has no survey stage, so no prompt is built for one.
  const postSurveyStageId = [...stages].reverse().find((s) => s.kind === 'survey')?.id
    ?? (simulation ? null : POST_SURVEY_STAGE_ID)

  // A run may deliberately have no mediator, in which case the experiment is
  // created with an empty `agentMediators` list.
  // A simulation-toolkit run is a conversation, not a debate: it has no topic
  // statement, no sides and so no mediator bias. Only the debate toolkits use them.
  const mediatorR1 = mediatorTemplateContent
    ? (simulation
        ? buildMediator(chatStageId, dropBiasItems(parseMediatorTemplate(mediatorTemplateContent)), stageIdsInOrder, null, simulation.blocks, blockChoices)
        : buildMediator(chatStageId, parseMediatorTemplate(mediatorTemplateContent), stageIdsInOrder, topicInfo, [], blockChoices))
    : null

  const roleFor = (slot: string): 'OP' | 'Challenger' | undefined =>
    opParticipant ? ((slot === 'p1' && opParticipant === 'participant-1') || (slot === 'p2' && opParticipant === 'participant-2') ? 'OP' : 'Challenger') : undefined

  const exp = experimentTemplate.experiment ?? {}
  const participantSlots = participantSlotsFor(mode, numAgents, templateSet, customAgentTemplates, seats)
  // The first two seats keep the caller's own names for them; a run that seats a
  // human further back numbers it off its slot, since only p1/p2 are passed in.
  const slotToPid: Record<string, string> = { p1, p2 }
  const pidFor = (slot: string) => slotToPid[slot] ?? `participant-${slot.slice(1)}`

  const agentSlots = participantSlots.filter((s) => s.type === 'agent').map((s) => s.slot)

  // An all-agent run needs nobody to show up, so it can be batched into cohorts
  // and held to a wall-clock limit. One seat held by a human makes it a run
  // somebody joins by link, whatever `mode` it was labelled with.
  const isSim = participantSlots.every((s) => s.type === 'agent')

  // Whether the agents should be drawn onto opposing sides of the debate
  // statement, which is what makes an all-agent debate worth watching. A
  // simulation-toolkit run draws no stances at all (see fillAgentWithoutStance):
  // what each agent wants comes from its own prompt and the simulation blocks.
  const opposeStances = agentSlots.length >= 2 && isSim

  // Assistants are addressed by the slot they stand behind, so they are built
  // once the seats are laid out. They are experiment-wide rather than per-cohort:
  // `agentAssistants` holds one definition each, which every cohort's agents then
  // point at through `persona.assistantId`.
  const assistants: AgentAssistantTemplate[] = []
  const assistantIdForSlot: Record<string, string> = {}
  // Whether the caller named an assistant per seat rather than one for the run.
  // That is the only form that can address a seat past p2, so where it is given
  // it names the recipients on its own and `agentAssignment` is not consulted.
  const perSeatAssistants = assistantTemplateContents?.some((c) => c) ?? false
  if (perSeatAssistants) {
    participantSlots.forEach(({ slot }, i) => {
      const content = assistantTemplateContents![i]
      if (!content) return
      const assistant = buildAssistant(chatStageId, parseAssistantTemplate(content), stageIdsInOrder, simulation ? null : topicInfo, postTitle, postDescription, roleFor(slot))
      // The same collision the agent templates have: every assistant one user
      // saves carries the same persona id (the Agent Assistant toolkit derives it
      // from their email and does not expose it for editing), so this suffix is
      // the only thing keeping two of them apart inside one experiment.
      assistant.persona.id = `${assistant.persona.id}-${slot}`
      assistants.push(assistant)
      assistantIdForSlot[slot] = assistant.persona.id
    })
  } else if (assistantTemplateContent) {
    // one shared assistant normally; but when both participants get the assistant and we know
    // who's OP, build two role-specific assistants (one can't correctly serve both roles at once).
    const parsedAssistant = parseAssistantTemplate(assistantTemplateContent)
    if (agentAssignment === 'both' && opParticipant) {
      const opSlot = opParticipant === 'participant-1' ? 'p1' : 'p2'
      const challengerSlot = opSlot === 'p1' ? 'p2' : 'p1'
      const opAssistant = buildAssistant(chatStageId, parsedAssistant, stageIdsInOrder, topicInfo, postTitle, postDescription, 'OP')
      opAssistant.persona.id = `${opAssistant.persona.id}-op`
      const challengerAssistant = buildAssistant(chatStageId, parsedAssistant, stageIdsInOrder, topicInfo, postTitle, postDescription, 'Challenger')
      challengerAssistant.persona.id = `${challengerAssistant.persona.id}-challenger`
      assistants.push(opAssistant, challengerAssistant)
      assistantIdForSlot[opSlot] = opAssistant.persona.id
      assistantIdForSlot[challengerSlot] = challengerAssistant.persona.id
    } else {
      const singleSlot = agentAssignment === 'participant-1' ? 'p1' : agentAssignment === 'participant-2' ? 'p2' : undefined
      const assistant = buildAssistant(chatStageId, parsedAssistant, stageIdsInOrder, topicInfo, postTitle, postDescription, singleSlot ? roleFor(singleSlot) : undefined)
      assistants.push(assistant)
      if (singleSlot) {
        assistantIdForSlot[singleSlot] = assistant.persona.id
      } else {
        assistantIdForSlot.p1 = assistant.persona.id
        assistantIdForSlot.p2 = assistant.persona.id
      }
    }
  }

  const chatStage = stages.find((s) => s.kind === 'chat')
  if (chatStage) {
    if (isSim) {
      // currently not removing the timer limit, in case simulation gets stuck in some cohorts, they can still finish within this time.
      chatStage.timeLimitInMinutes = 9
      chatStage.requireFullTime = false
      if (numUtterances != null) chatStage.numUtterances = numUtterances  // else keep template default
    } else {
      chatStage.numUtterances = null
    }
    // The chat cannot start until every slot in the run has arrived.
    if (chatStage.progress) chatStage.progress.minParticipants = participantSlots.length

    if (assistants.length > 0 && chatStage.progress) {
      const isHumanSlot = (slot: string) => participantSlots.find((s) => s.slot === slot)?.type === 'human'
      const mapping: Record<string, string> = {}
      if (perSeatAssistants) {
        // Every human seat that was given one, keyed by the id it joins under —
        // an agent seat's assistant rides on its persona instead, below.
        for (const { slot, type } of participantSlots) {
          if (type === 'human' && assistantIdForSlot[slot]) mapping[pidFor(slot)] = assistantIdForSlot[slot]
        }
      } else {
        if ((agentAssignment === 'participant-1' || agentAssignment === 'both') && isHumanSlot('p1') && assistantIdForSlot.p1) mapping[p1] = assistantIdForSlot.p1
        if ((agentAssignment === 'participant-2' || agentAssignment === 'both') && isHumanSlot('p2') && assistantIdForSlot.p2) mapping[p2] = assistantIdForSlot.p2
      }
      chatStage.progress.pIdToAssistantId = mapping
    }

    // Applied last so the simulation template wins over the defaults above.
    if (simulation) applySimulationToChatStage(chatStage, simulation, blockChoices)
  }

  const numCohortsResolved = (isSim && action === 'simulate')
    ? (numCohorts && numCohorts >= 1 ? numCohorts : (Number(exp.num_cohorts) || 1))
    : 1

  // each cohort gets a randomized pair
  const cohortAgents: AgentParticipantTemplate[][] = []
  const agentStances: Record<string, any>[] = []
  const humanSlots: Record<string, string> = {}
  const cohortAgentConfigs: string[][] = []

  for (let ci = 0; ci < numCohortsResolved; ci++) {
    // Simulations want a real disagreement, so stances alternate strong-for /
    // strong-against before being shuffled across the slots.
    const ratings = opposeStances
      ? shuffle(agentSlots.map((_, i) => (i % 2 === 0 ? randint(5, 7) : randint(1, 3))))
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
        const tpl = pSlot.customTemplate ? structuredClone(pSlot.customTemplate) : loadTemplate(pSlot.template!)
        // Slot is part of the id because agent templates repeat once a run asks
        // for more agents than there are templates. customTemplateFor already
        // suffixed the slot on a custom template, so that one only needs the cohort.
        if (isSim) {
          tpl.persona.id = pSlot.customTemplate
            ? `${tpl.persona.id}-c${ci}`
            : `${tpl.persona.id}-${slot}-c${ci}`
        }

        // A per-seat pick already said which slots get one, so only the shared
        // form has to ask the assignment switch who the recipients are.
        const wantsAssistant = perSeatAssistants
          || agentAssignment === 'both'
          || (agentAssignment === 'participant-1' && slot === 'p1')
          || (agentAssignment === 'participant-2' && slot === 'p2')
        if (wantsAssistant && assistantIdForSlot[slot]) {
          tpl.persona.assistant_id = assistantIdForSlot[slot]
        }

        const redditRole = roleFor(slot)

        let filled: Record<string, any>
        if (simulation) {
          filled = fillAgentWithoutStance(tpl, postTitle, postDescription, redditRole)
        } else {
          const s = stance[slot]
          const [withStance, finalStance] = fillAgentStance(tpl, topicInfo, s.rating, s.rating, postTitle, postDescription, redditRole)
          filled = withStance
          stance[slot] = { side: finalStance.side, strength: finalStance.strength } // removing rating and concession info
        }

        // Agent prompts can reference simulation blocks too, so they go through
        // the same resolution as the mediator's.
        const resolved = resolveBlockItems(filled, simulation?.blocks ?? [], blockChoices)

        configs.push(resolved.agent_config ?? '')
        const built = buildAgent(chatStageId, preSurveyStageId, postSurveyStageId, resolved, stageIdsInOrder)
        pair.push(built)

      } else {
        humanSlots[slot] = pidFor(slot)
      }
    }
    cohortAgents.push(pair)
    agentStances.push(stance)
    cohortAgentConfigs.push(configs)
  }

  const agents = cohortAgents.flat() 

  const [template, cohortAlias] = buildExperiment(experimentTemplate, topicInfo, stages, stageIdsInOrder, mediatorR1, agents, mode, isSim, assistants, postTitle, postDescription, participantSlots.length)
  // Nothing to randomize a bias for when the run has no mediator, or when it is a
  // simulation-toolkit conversation with no sides to favor.
  template.experiment.variableConfigs = mediatorR1 && !simulation ? [BIAS_VARIABLE_CONFIG] : []

  // A cohort holds exactly the run's participants, however many that is.
  template.experiment.defaultCohortConfig.minParticipantsPerCohort = participantSlots.length
  template.experiment.defaultCohortConfig.maxParticipantsPerCohort = participantSlots.length

  // The description also labels the experiment in ConvoArena's list (it leads
  // the chat stage description separately, see applySimulationToChatStage).
  if (simulation?.description) {
    template.experiment.metadata.description = simulation.description
  }

  const authHeaders = {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  }

  let expId: string
  let cohortIds: string[]
  let cohortBias: (Record<string, string> | null)[] = []

  if (isSim) {
    const cfg = exp.defaultCohortConfig ?? {}
    const expRes = await fetch(`${BASE_URL}/experiments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ template: excludeNone(template) }),
    })
    if (!expRes.ok) throw new Error(`create_simulation failed: ${await expRes.text()}`)
    const expJson = await expRes.json()
    expId = expJson.experiment.id

    const cohortRes = await fetch(`${BASE_URL}/experiments/${expId}/cohorts/batch`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        cohorts: Array.from({ length: numCohortsResolved }, (_, i) => ({
          name: `[toolkit-sim] ${topicInfo.name} #${i + 1}`,
          description: `Simulation for ${topicInfo.name}.`,
          participantConfig: {
            minParticipantsPerCohort: participantSlots.length,
            maxParticipantsPerCohort: participantSlots.length,
            includeAllParticipantsInCohortCount: cfg.includeAllParticipantsInCohortCount ?? true,
            botProtection: cfg.botProtection ?? false,
          },
        })),
      }),
    })
    if (!cohortRes.ok) throw new Error(`create_simulation failed: ${await cohortRes.text()}`)
    const cohortJson = await cohortRes.json()
    cohortIds = cohortJson.cohorts.map((c: any) => (c.cohort ?? c).id)
    cohortBias = cohortJson.cohorts.map((c: any) => (c.cohort ?? c).variableMap ?? null)
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
    // Absent whenever the run has no mediator to be biased in the first place.
    const raw = cohortBias[i]?.target_bias_position
    if (!raw) return null
    const parse = (s: string) => { try { return JSON.parse(s) } catch { return s } }
    const parsed = parse(raw)
    return { side: Array.isArray(parsed) ? parsed[0] : parsed }
  }

  const cohorts = cohortIds.map((cid, i) => {
    const cohortUrl = `${FRONTEND_BASE}/#/e/${expId}/c/${cid}`
    // Stances only ever describe the agents, so a run without any leaves them out,
    // and a simulation-toolkit run draws neither stances nor a mediator bias.
    const stances = simulation
      ? {}
      : { ...(agentSlots.length > 0 ? { agent_stances: agentStances[i] } : {}), mediator_bias: biasFor(i) }

    // A batch simulation runs itself with nobody watching, so it reports the
    // cohort (and any stances) and hides the links.
    if (action === 'simulate') {
      return { cohort_id: cid, ...stances }
    }

    // One entry per seat, in the order the seats were laid out, so a run that
    // mixes the two kinds hands back both sorts of link side by side: a human
    // joins through the cohort link under their own id, while an agent already
    // exists as a participant and is watched through its own link.
    const participant_urls = participantSlots.map(({ slot, type }) => {
      const role = roleFor(slot)
      const url = type === 'human'
        ? `${cohortUrl}?PROLIFIC_PID=${humanSlots[slot]}`
        : agentUrls[i][slot]
      return { url, type, ...(role ? { role } : {}) }
    })

    return { cohort_id: cid, participant_urls, ...stances }
  })

  return {
    mode,
    // The debate topic; a simulation-toolkit run has none to report.
    ...(simulation ? {} : { topic: topicInfo.name }),
    experiment_id: expId,
    // experiment_url: experimentUrl,
    cohorts,
    // Which option each multi-option block was drawn as, so a run can be read
    // back without opening the experiment. Experiment-wide, unlike mediator_bias.
    ...(blockChoices.size > 0 ? { block_choices: Object.fromEntries(blockChoices) } : {}),
    // is_sim: (mode === 'agent-agent' && action === 'simulate'),
  }
}
