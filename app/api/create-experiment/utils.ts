import fs from 'fs'
import yaml from 'js-yaml'
import { CREATE_PARTICIPANT_URL } from './config'
import type { AgentParticipantTemplate } from './parsers/agent'

export function loadTemplate(templatePath: string): Record<string, any> {
  return yaml.load(fs.readFileSync(templatePath, 'utf8')) as Record<string, any>
}

export function substituteTokens(obj: any, subs: Record<string, string>): any {
  if (typeof obj === 'string') {
    let s = obj
    for (const [k, v] of Object.entries(subs)) s = s.replaceAll(k, v)
    return s
  }
  if (Array.isArray(obj)) return obj.map((x) => substituteTokens(x, subs))
  if (obj && typeof obj === 'object') {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(obj)) out[k] = substituteTokens(v, subs)
    return out
  }
  return obj
}

/**
 * Reads a block's alternative descriptions off either shape it is saved in: a
 * `descriptions` list, or the single `description` string used before a block
 * could hold several options.
 */
export function blockDescriptions(raw: unknown): string[] {
  const b = raw as { descriptions?: unknown; description?: unknown } | null
  const list = Array.isArray(b?.descriptions)
    ? b!.descriptions
    : b?.description != null ? [b.description] : []
  return list.map((d: unknown) => String(d ?? ''))
}

/**
 * Draws the description one block contributes to this experiment.
 *
 * A block may offer several alternatives, and exactly one of them is used —
 * every place that block appears in the experiment (the chat stage description,
 * the public assistant prompt, every agent prompt in every cohort) has to agree, or the
 * conversation describes itself two different ways. `choices` is that agreement:
 * one map per `generate()` call, holding the first draw made for each name.
 */
export function pickBlockDescription(
  name: string,
  descriptions: string[],
  choices: Map<string, string>,
): string {
  const cached = choices.get(name)
  if (cached !== undefined) return cached
  const options = descriptions.filter((d) => d.trim() !== '')
  const chosen = options.length > 0 ? options[Math.floor(Math.random() * options.length)] : ''
  choices.set(name, chosen)
  return chosen
}

/**
 * Rewrites every `BLOCK` prompt item into the plain `TEXT` item the backend
 * expects, in place of the block authored in the simulation toolkit.
 *
 * A block item carries both the `name` it refers to and a copy of the
 * `descriptions` it had when it was added. The live simulation wins when it
 * still defines that name, so editing a block there updates every prompt
 * referencing it; the copy is the fallback for runs that send no simulation at
 * all (a public-assistant-toolkit run, or an exported template run on its own).
 *
 * Walking the whole template rather than each prompt array covers the response,
 * should-respond, initialization and survey prompts in one pass.
 */
export function resolveBlockItems(
  obj: any,
  blocks: { name: string; descriptions: string[] }[] = [],
  choices: Map<string, string> = new Map(),
): any {
  if (Array.isArray(obj)) return obj.map((x) => resolveBlockItems(x, blocks, choices))
  if (obj && typeof obj === 'object') {
    if (obj.type === 'BLOCK') {
      const name = String(obj.name ?? '')
      const live = blocks.find((b) => b.name === name)
      const description = pickBlockDescription(name, blockDescriptions(live ?? obj), choices)
      return { ...obj, type: 'TEXT', text: description ? `${name}: ${description}` : name }
    }
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(obj)) out[k] = resolveBlockItems(v, blocks, choices)
    return out
  }
  return obj
}

// replace missing values by defaults
export function replaceDefaults(template: Record<string, any>, defaults: Record<string, any>): Record<string, any> {
  const merged: Record<string, any> = { ...defaults }
  for (const [key, value] of Object.entries(template)) {
    const d = defaults[key]
    if (value && typeof value === 'object' && !Array.isArray(value) && d && typeof d === 'object' && !Array.isArray(d)) {
      merged[key] = replaceDefaults(value, d)
    } else {
      merged[key] = value
    }
  }
  return merged
}

// drop null/undefined fields recursively (mirrors pydantic model_dump(exclude_none=True))
export function excludeNone(obj: any): any {
  if (Array.isArray(obj)) return obj.map(excludeNone)
  if (obj && typeof obj === 'object') {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined) continue
      out[k] = excludeNone(v)
    }
    return out
  }
  return obj
}

function _stanceFromRating(rating: number): [string, string] {
  if (rating === 4) return [Math.random() < 0.5 ? 'support' : 'counter', 'mildly']
  const side = rating > 4 ? 'support' : 'counter'
  const distance = Math.abs(rating - 4)
  let strength: string
  if (distance >= 3) strength = 'strongly'
  else if (distance === 2) strength = 'moderately'
  else strength = 'mildly'
  return [side, strength]
}

export function fillAgentStance(
  agentTemplate: Record<string, any>,
  topicInfo: Record<string, any>,
  rating: number,
  concede_strength: number,
  postTitle?: string,
  postDescription?: string,
  redditRole?: string,
): [Record<string, any>, Record<string, any>] {
  const [side, strength] = _stanceFromRating(rating)
  const [label, action] = side === 'support' ? ['AGREEMENT', 'support'] : ['DISAGREEMENT', 'oppose']

  agentTemplate["concede_strength"] = concede_strength
  substituteAgentTokens(agentTemplate, {
    '{topic_name}': topicInfo.name,
    '{statement}': topicInfo.statement,
    '{stance_label}': label,
    '{stance_action}': action,
    '{stance_strength}': strength,
    '{stance_strength_raw}': rating.toString(),
    ...postSubstitutions(postTitle, postDescription, redditRole),
  })

  const agentStance = { side: label, strength, rating, concede_strength }
  return [agentTemplate, agentStance]
}

// The topic lines a public assistant or assistant prompt may carry. A simulation-toolkit
// run has no debate topic (it passes null), so the tokens are blanked there.
export function topicTokens(topicInfo: Record<string, any> | null): Record<string, string> {
  if (!topicInfo) return { '{topic_name}': '', '{topic_statement}': '' }
  return { '{topic_name}': `Debate Topic: ${topicInfo.name}`, '{topic_statement}': `Debate Statement: ${topicInfo.statement}` }
}

function postSubstitutions(postTitle?: string, postDescription?: string, redditRole?: string): Record<string, string> {
  return {
    '{post_title}': postTitle ?? '',
    '{post_description}': postDescription ?? '',
    '{reddit_role}': redditRole ?? '',
    '{article_title}': postTitle ?? '',
    '{article_body}': postDescription ?? '',
  }
}

/**
 * Fills an agent for a simulation-toolkit run, which is a conversation rather
 * than a debate: there is no statement to take a side on, so no stance is drawn
 * and nothing concedes. Leftover topic and stance tokens in a prompt written for
 * the debate toolkit are blanked rather than left in the text verbatim.
 */
export function fillAgentWithoutStance(
  agentTemplate: Record<string, any>,
  postTitle?: string,
  postDescription?: string,
  redditRole?: string,
): Record<string, any> {
  agentTemplate["concede_strength"] = null
  substituteAgentTokens(agentTemplate, {
    '{topic_name}': '',
    '{statement}': '',
    '{stance_label}': '',
    '{stance_action}': '',
    '{stance_strength}': '',
    '{stance_strength_raw}': '',
    ...postSubstitutions(postTitle, postDescription, redditRole),
  })
  return agentTemplate
}

function substituteAgentTokens(agentTemplate: Record<string, any>, substitutions: Record<string, string>): void {
  const substituteInBlocks = (items: any[] | undefined) => {
    for (const item of items ?? []) {
      if (item.type === 'TEXT') {
        for (const [token, value] of Object.entries(substitutions)) {
          item.text = item.text.replaceAll(token, value)
        }
      }
    }
  }

  substituteInBlocks(agentTemplate.prompt)

  // New (order/promptOutput) schema: named prompts live under chatSettings.promptMap,
  // plus the separate optional initializationPrompt/thoughtPrompt/characterPrompt block lists.
  if (agentTemplate.chatSettings?.promptMap) {
    for (const entry of Object.values(agentTemplate.chatSettings.promptMap) as any[]) {
      substituteInBlocks(entry?.prompt)
    }
    substituteInBlocks(agentTemplate.chatSettings.initializationPrompt)
    substituteInBlocks(agentTemplate.chatSettings.thoughtPrompt)
    substituteInBlocks(agentTemplate.chatSettings.characterPrompt)
  }

  for (const key of ['human_style_prompt', 'should_concede_prompt', 'thought_prompt', 'post_survey_prompt', 'pre_survey_prompt', 'agent_config']) {
    if (key in agentTemplate) {
      for (const [token, value] of Object.entries(substitutions)) {
        agentTemplate[key] = agentTemplate[key].replaceAll(token, value)
      }
    }
  }
}

export function wrapChars(statement: string, charsPerLine = 30): string {
  const lines: string[] = []
  let current = ''
  for (const word of statement.split(' ')) {
    if (!word) continue
    if (current && current.length + 1 + word.length > charsPerLine) {
      lines.push(current)
      current = word
    } else {
      current = current ? `${current} ${word}` : word
    }
  }
  if (current) lines.push(current)
  return lines.join('\n') || statement
}

export function agentConfig(template: AgentParticipantTemplate, promptContext = ''): Record<string, any> {
  const model = template.persona.defaultModelSettings
  return {
    agentId: template.persona.id,
    promptContext: promptContext,
    modelSettings: { apiType: model.apiType, modelName: model.modelName },
    assistantId: template.persona.assistantId,
  }
}

export async function createParticipant(experimentId: string, cohortId: string, agentConfig: Record<string, any>) {
  const payload = {
    experimentId,
    cohortId,
    isAnonymous: true,
    agentConfig,
  }
  const res = await fetch(CREATE_PARTICIPANT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: payload }),
  })
  if (!res.ok) throw new Error(`createParticipant failed: ${res.status} ${await res.text()}`)
  const body = await res.json()
  if (body.error) throw new Error(`createParticipant failed: ${body.error}`)
  return body.result ?? body
}
