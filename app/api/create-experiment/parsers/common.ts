// ── Types ─────────────────────────────────────────────────────────────────────

export interface StageContextItem {
  type: 'STAGE_CONTEXT'
  stageId: string
  includePrimaryText: boolean
  includeInfoText: boolean
  includeHelpText: boolean
  includeStageDisplay: boolean
  includeParticipantAnswers: boolean
}

export interface TextPromptItem {
  type: 'TEXT'
  text: string
}

export interface ProfileInfoPromptItem {
  type: 'PROFILE_INFO'
}

export interface ProfileContextPromptItem {
  type: 'PROFILE_CONTEXT'
}

export interface InitializationContextPromptItem {
  type: 'INITIALIZATION_CONTEXT'
}

export interface PromptOutputPromptItem {
  type: 'PROMPT_OUTPUT'
  promptId: string
}

export interface CharacterContextPromptItem {
  type: 'CHARACTER_CONTEXT'
  stageIds: string[]
}

export interface ThoughtHistoryContextPromptItem {
  type: 'THOUGHT_HISTORY_CONTEXT'
  stageIds: string[]
}

export type PromptItem = StageContextItem | TextPromptItem | ProfileInfoPromptItem | ProfileContextPromptItem | InitializationContextPromptItem
  | PromptOutputPromptItem | CharacterContextPromptItem | ThoughtHistoryContextPromptItem

export interface StructuredOutputSchemaProperty {
  name: string
  schema: { type: string; description: string }
}

export interface StructuredOutputConfig {
  enabled: boolean
  type: 'JSON_SCHEMA'
  appendToPrompt: boolean
  shouldRespondField: string | null
  messageField: string
  explanationField: string
  readyToEndField: string
  schema: {
    type: 'OBJECT'
    properties: StructuredOutputSchemaProperty[]
  }
}

export interface GenerationConfig {
  temperature: number
  reasoningLevel: string
  includeReasoning: boolean
}

export interface ChatSettings {
  minMessagesBeforeResponding: number
  canSelfTriggerCalls: boolean
  initialMessage: string
  wordsPerMinute: number
  concedeStrength: number
}

export interface Persona {
  id: string
  name: string
  defaultProfile: { name: string; avatar: string; pronouns?: string | null }
  defaultModelSettings: { apiType: string; modelName: string }
}

// ── shared functions (common.py in the python codes) ───────────────────────────────────────────────────────────────────

export function buildContextItems(stageId: string, stageIdsInOrder: string[], context: string): StageContextItem[] {
  const idx = stageIdsInOrder.indexOf(stageId)
  let stagesToInclude: string[]
  if (context === 'all') {
    stagesToInclude = stageIdsInOrder.slice(0, idx + 1) // change: include all stages before the current stage; originally we are keeping all stages including the current one
  } else if (context === 'before') {
    stagesToInclude = stageIdsInOrder.slice(0, idx) // include all stages before the current stage
  } else if (context === 'current') {
    stagesToInclude = [stageId]
  } else {
    throw new Error(`Unknown context value ${JSON.stringify(context)}. Must be 'all', 'before', or 'current'.`)
  }

  return stagesToInclude.map((sid) => ({
    type: 'STAGE_CONTEXT',
    stageId: sid,
    includePrimaryText: true,
    includeInfoText: false,
    includeHelpText: false,
    includeStageDisplay: true,
    includeParticipantAnswers: true,
  }))
}



export function buildPromptItems(tpl: Record<string, any>, stageId: string, stageIdsInOrder: string[], stageSpecificPrompts: PromptItem[] = []): PromptItem[] {
  const context: string = tpl.context
  const prompts: any[] = [...(tpl.prompt ?? [])].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))

  const items: PromptItem[] = []
  for (const promptItem of prompts) {
    const kind: string = promptItem.type
    if (kind === 'CONTEXT') {
      items.push(...buildContextItems(stageId, stageIdsInOrder, promptItem.context ?? context))
    } else if (kind === 'PROFILE_INFO') {
      items.push({ type: 'PROFILE_INFO' })
    } else if (kind === 'PROFILE_CONTEXT') {
      items.push({ type: 'PROFILE_CONTEXT' })
    } else if (kind === 'INITIALIZATION_CONTEXT' || kind === 'PRELOADED_CONTEXT') {
      items.push({ type: 'INITIALIZATION_CONTEXT' })
    } else if (kind === 'TEXT') {
      items.push({ type: 'TEXT', text: promptItem.text })
    } else if (kind === 'BIASED') {
      items.push({ type: 'TEXT', text: '{{target_bias_position}}', })
    } else {
      throw new Error(`Unknown prompt item type ${kind}. Must be 'CONTEXT', 'PROFILE_INFO', 'PROFILE_CONTEXT', 'INITIALIZATION_CONTEXT', 'BIASED' or 'TEXT'.`)
    }
  }
  return [...items, ...stageSpecificPrompts]
}

export function buildPersona(tpl: Record<string, any>): Persona {
  const persona = tpl.persona
  const model = tpl.model
  const name: string = persona.name
  return {
    id: persona.id,
    name,
    defaultProfile: {
      name,
      avatar: persona.avatar,
      pronouns: persona.pronouns,
    },
    defaultModelSettings: {
      apiType: model.apiType,
      modelName: model.modelName,
    },
  }
}

export function buildGeneration(tpl: Record<string, any>, genKey: string): GenerationConfig {
  const generation = tpl[genKey]
  return {
    temperature: generation.temperature,
    reasoningLevel: generation.reasoning_level,
    includeReasoning: generation.include_reasoning,
  }
}

export function buildChatSettings(tpl: Record<string, any>): ChatSettings {
  const chatSettings = tpl.chat_settings
  return {
    minMessagesBeforeResponding: chatSettings.min_messages_before_responding,
    canSelfTriggerCalls: chatSettings.can_self_trigger_calls,
    initialMessage: chatSettings.initial_message,
    wordsPerMinute: chatSettings.words_per_minute,
    concedeStrength: tpl.concede_strength ?? 0,
  }
}

export function buildStructuredOutput(tpl: Record<string, any>): StructuredOutputConfig {
  const config = tpl.structured_output
  // console.log('structured_output:', JSON.stringify(config, null, 2))
  const schema: Record<string, { type: string; description: string }> = config.schema
  const properties: StructuredOutputSchemaProperty[] = Object.entries(schema).map(([name, field]) => ({
    name,
    schema: { type: field.type, description: field.description },
  }))
  return {
    enabled: config.enabled,
    type: 'JSON_SCHEMA',
    appendToPrompt: config.append_to_prompt,
    shouldRespondField: config.should_respond_field ?? null,
    messageField: config.message_field,
    explanationField: config.explanation_field,
    readyToEndField: config.ready_to_end_field,
    schema: { type: 'OBJECT', properties },
  }
}
