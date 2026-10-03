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
  concede_strength: number
): [Record<string, any>, Record<string, any>] {
  const [side, strength] = _stanceFromRating(rating)
  const [label, action] = side === 'support' ? ['AGREEMENT', 'support'] : ['DISAGREEMENT', 'oppose']

  agentTemplate["concede_strength"] = concede_strength
  const substitutions: Record<string, string> = {
    '{topic_name}': topicInfo.name,
    '{statement}': topicInfo.statement,
    '{stance_label}': label,
    '{stance_action}': action,
    '{stance_strength}': strength,
    '{stance_strength_raw}': rating.toString(),
  }
  for (const item of agentTemplate.prompt ?? []) {
    if (item.type === 'TEXT') {
      for (const [token, value] of Object.entries(substitutions)) {
        item.text = item.text.replaceAll(token, value)
      }
    }
  }

  for (const key of ['human_style_prompt', 'should_concede_prompt', 'thought_prompt', 'persona_prompt', 'post_survey_prompt', 'pre_survey_prompt', 'agent_config']) {
    if (key in agentTemplate) {
      for (const [token, value] of Object.entries(substitutions)) {
        agentTemplate[key] = agentTemplate[key].replaceAll(token, value)
      }
    }
  }

  const agentStance = { side: label, strength, rating, concede_strength }
  return [agentTemplate, agentStance]
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
