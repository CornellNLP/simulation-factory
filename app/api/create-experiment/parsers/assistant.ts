import fs from 'fs'
import yaml from 'js-yaml'
import { ASSISTANT_DEFAULT } from '../config'
import { replaceDefaults, substituteTokens, topicTokens } from '../utils'
import {
  buildPromptItems,
  buildPersona,
  buildGeneration,
  buildStructuredOutput,
  type PromptItem,
  type StructuredOutputConfig,
  type GenerationConfig,
  type Persona,
} from './common'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AssistantPersona extends Persona {
  minCallIntervalMs: number | null
}

interface ChatPromptConfig {
  id: string
  type: 'chat'
  prompt: { default: PromptItem[] }
  order: Record<string, unknown>
  addTo: Record<string, unknown>
  shouldRespondPrompt: PromptItem[]
  structuredOutputConfig: StructuredOutputConfig
  generationConfig: GenerationConfig
  numRetries: number
}

export interface PrivateAssistantTemplate {
  persona: AssistantPersona
  promptMap: Record<string, ChatPromptConfig>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _chatPrompt(tpl: Record<string, any>, stageId: string, stageIdsInOrder: string[], postTitle?: string, postDescription?: string, assistedRole?: string): ChatPromptConfig {
  return {
    id: stageId,
    type: 'chat',
    prompt: { default: buildPromptItems(tpl, stageId, stageIdsInOrder, [], postTitle, postDescription, assistedRole, true) },
    order: {},
    addTo: {},
    shouldRespondPrompt: buildPromptItems({ ...tpl, prompt: tpl.should_respond_prompt, context: tpl.should_respond_context }, stageId, stageIdsInOrder, [], postTitle, postDescription, assistedRole, true),
    structuredOutputConfig: buildStructuredOutput(tpl),
    generationConfig: buildGeneration(tpl, 'generation'),
    numRetries: tpl.num_retries,
  }
}

// ── Public ────────────────────────────────────────────────────────────────────

export function loadAssistantTemplate(templatePath: string): Record<string, any> {
  const raw = fs.readFileSync(templatePath, 'utf8')
  return yaml.load(raw) as Record<string, any>
}

export function parseAssistantTemplate(content: string): Record<string, any> {
  return yaml.load(content) as Record<string, any>
}

export function buildAssistant(stageId: string, assistantTemplate: Record<string, any>, stageIdsInOrder: string[], topicInfo: Record<string, any> | null, postTitle?: string, postDescription?: string, assistedRole?: string): PrivateAssistantTemplate {
  let tpl = replaceDefaults(assistantTemplate, loadAssistantTemplate(ASSISTANT_DEFAULT))
  tpl = substituteTokens(tpl, topicTokens(topicInfo))
  return {
    persona: { ...buildPersona(tpl), minCallIntervalMs: tpl.persona.min_call_interval_ms ?? null },
    promptMap: { [stageId]: _chatPrompt(tpl, stageId, stageIdsInOrder, postTitle, postDescription, assistedRole) },
  }
}
