import {
  buildPromptItems,
  buildPersona,
  buildGeneration,
  buildChatSettings,
  buildStructuredOutput,
  type PromptItem,
  type StructuredOutputConfig,
  type GenerationConfig,
  type ChatSettings,
  type Persona,
} from './common'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatPromptConfig {
  id: string
  type: 'chat'
  includeScaffoldingInPrompt: boolean
  thoughtPrompt: PromptItem[]
  characterPrompt: PromptItem[]
  prompt: Record<string, PromptItem[]>
  order: Record<string, string[]>
  shouldRespondPrompt: PromptItem[] | null
  minParticipantMessagesBeforeResponding: number
  structuredOutputConfig: StructuredOutputConfig
  generationConfig: GenerationConfig
  chatSettings: ChatSettings
  numRetries: number
}

type GenericPromptConfig = {
  id: string
  type: 'survey'
  includeScaffoldingInPrompt: boolean
  includeConcessionInPrompt: boolean
  prompt: Record<string, PromptItem[]>
  order: Record<string, string[]>
  generationConfig: GenerationConfig
  numRetries: number
}

export interface AgentParticipantTemplate {
  persona: Persona
  promptMap: Record<string, ChatPromptConfig | GenericPromptConfig>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _shouldConcedePrompt(tpl: Record<string, any>, stage_id: string): PromptItem[] {
  return [
    {type: 'TEXT', text: tpl.should_concede_prompt },
    {
      type: 'STAGE_CONTEXT',
      stageId: stage_id,
      includePrimaryText: false,
      includeInfoText: false,
      includeHelpText: false,
      includeStageDisplay: true,
      includeParticipantAnswers: false,
    },
  ]
}

function _thoughtPrompt(tpl: Record<string, any>, stage_id: string): PromptItem[] {
  return [
    { type: 'TEXT', text: tpl.thought_prompt },
    {
      type: 'STAGE_CONTEXT',
      stageId: stage_id,
      includePrimaryText: false,
      includeInfoText: false,
      includeHelpText: false,
      includeStageDisplay: true,
      includeParticipantAnswers: false,
    },
  ]
}

function _characterPrompt(tpl: Record<string, any>, stage_id: string): PromptItem[] {
  return [
    { type: 'TEXT', text: tpl.persona_prompt },
    {
      type: 'STAGE_CONTEXT',
      stageId: stage_id,
      includePrimaryText: false,
      includeInfoText: false,
      includeHelpText: false,
      includeStageDisplay: true,
      includeParticipantAnswers: false,
    },
  ]
}

function _human_style_prompt(tpl: Record<string, any>): PromptItem[] {
  return [{ type: 'TEXT', text: tpl.human_style_prompt }]
}

function _pre_survey_prompt(tpl: Record<string, any>): PromptItem[] {
  return [{ type: 'TEXT', text: tpl.pre_survey_prompt }]
}

function _post_survey_prompt(tpl: Record<string, any>): PromptItem[] {
  return [{ type: 'TEXT', text: tpl.post_survey_prompt }]
}


function _chatPrompt(tpl: Record<string, any>, stageId: string, stageIdsInOrder: string[]): ChatPromptConfig {
  return {
    id: stageId,
    type: 'chat',
    includeScaffoldingInPrompt: tpl.include_scaffolding_in_prompt,
    thoughtPrompt: _thoughtPrompt(tpl, stageId),
    characterPrompt: _characterPrompt(tpl, stageId),
    // step 1 decides whether to concede; step 2 writes the message, seeing step 1's output
    prompt: {
      concede: _shouldConcedePrompt(tpl, stageId),
      message: [
        ...buildPromptItems(tpl, stageId, stageIdsInOrder, _human_style_prompt(tpl)),
        { type: 'PROMPT_OUTPUT', promptId: 'concede' },
        { type: 'CHARACTER_CONTEXT', stageIds: [stageId] },
        { type: 'THOUGHT_HISTORY_CONTEXT', stageIds: [stageId] },
      ],
    },
    order: { '1': ['concede'], '2': ['message'] },
    shouldRespondPrompt: null,
    minParticipantMessagesBeforeResponding: tpl.min_participant_messages_before_responding,
    structuredOutputConfig: buildStructuredOutput(tpl),
    generationConfig: buildGeneration(tpl, "chat_generation"),
    chatSettings: buildChatSettings(tpl),
    numRetries: tpl.num_retries,
  }
}

function _pre_survey_stage(tpl: Record<string, any>, stageId: string, stageIdsInOrder: string[]): GenericPromptConfig {
  return {
    id: stageId,
    type: 'survey',
    includeScaffoldingInPrompt: true,
    includeConcessionInPrompt: true,
    // survey stages must use the "default" key (hardcoded in the backend)
    prompt: { default: buildPromptItems(tpl, stageId, stageIdsInOrder, _pre_survey_prompt(tpl)) },
    order: { '1': ['default'] },
    generationConfig: buildGeneration(tpl, "pre_survey_generation"),
    numRetries: tpl.num_retries,
  }
}

function _post_survey_stage(tpl: Record<string, any>, stageId: string, stageIdsInOrder: string[], personaStages: string[], thoughtHistoryStages: string[]): GenericPromptConfig {
  return {
    id: stageId,
    type: 'survey',
    includeScaffoldingInPrompt: true,
    includeConcessionInPrompt: true,
    prompt: {
      default: [
        ...buildPromptItems(tpl, stageId, stageIdsInOrder, _post_survey_prompt(tpl)),
        { type: 'CHARACTER_CONTEXT', stageIds: personaStages },
        { type: 'THOUGHT_HISTORY_CONTEXT', stageIds: thoughtHistoryStages },
      ],
    },
    order: { '1': ['default'] },
    generationConfig: buildGeneration(tpl, "post_survey_generation"),
    numRetries: tpl.num_retries,
  }
}



// ── Public ────────────────────────────────────────────────────────────────────

export function buildAgent(chat_stage_id: string, pre_survey_stage_id: string, post_survey_stage_id: string, agentTemplate: Record<string, any>, stageIdsInOrder: string[]): AgentParticipantTemplate {
  const tpl = agentTemplate
  return {
    persona: buildPersona(tpl),
    promptMap: { 
      [chat_stage_id]: _chatPrompt(tpl, chat_stage_id, stageIdsInOrder),
      [pre_survey_stage_id]: _pre_survey_stage(tpl, pre_survey_stage_id, stageIdsInOrder),
      [post_survey_stage_id]: _post_survey_stage(tpl, post_survey_stage_id, stageIdsInOrder, [chat_stage_id], [chat_stage_id]),
    },
  }
}
