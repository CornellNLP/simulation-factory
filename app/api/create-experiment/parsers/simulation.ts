import yaml from 'js-yaml'
import { blockDescriptions, pickBlockDescription } from '../utils'

// ── Types ─────────────────────────────────────────────────────────────────────

// One named chunk of the chat stage description. Mirrors `Block` in
// lib/blocks.ts. A block offers one or more alternative descriptions; a single
// one is drawn per experiment and handed to the backend, whose
// `StageDescriptionBlock` holds one `description` string.
export interface SimulationBlock {
  name: string
  descriptions: string[]
}

export interface SimulationTemplate {
  description: string
  blocks: SimulationBlock[]
  maxUtterance?: number
  maxTime?: number
  // Experiment-wide chat settings. Unset (every simulation saved before they
  // existed) leaves them to the experiment YAML, which turns them off.
  publicizeAssistantMessages?: boolean
  allowPublicMessageDeletion?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _positiveNumber(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? n : undefined
}

function _boolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

// Blocks arrive from a hand-editable YAML file, so tolerate missing fields
// rather than failing the whole run. A block without a name has nothing to
// label it in the prompt, so it is dropped. Files written before a block could
// hold several options carry a single `description`, which blockDescriptions
// folds into a one-entry list.
function _blocks(value: unknown): SimulationBlock[] {
  if (!Array.isArray(value)) return []
  return value
    .map((b) => ({
      name: String((b as SimulationBlock)?.name ?? '').trim(),
      descriptions: blockDescriptions(b),
    }))
    .filter((b) => b.name !== '')
}

// ── Public ────────────────────────────────────────────────────────────────────

export function parseSimulationTemplate(content: string): SimulationTemplate {
  const tpl = (yaml.load(content) ?? {}) as Record<string, unknown>
  return {
    description: String(tpl.description ?? ''),
    blocks: _blocks(tpl.blocks),
    maxUtterance: _positiveNumber(tpl.max_utterance),
    maxTime: _positiveNumber(tpl.max_time),
    publicizeAssistantMessages: _boolean(tpl.publicize_assistant_messages),
    allowPublicMessageDeletion: _boolean(tpl.allow_public_message_deletion),
  }
}

/**
 * Hands the chat stage over to the simulation template.
 *
 * The conversation description becomes the stage's primary text so it leads the
 * stage description in the agent prompt, with the blocks listed under it. The
 * topic YAML's own primary text is dropped either way: when the simulation has
 * no description the backend skips the `* Stage description:` line entirely,
 * leaving only the block list under `[Stage: ...]`.
 *
 * Each block contributes the one description drawn for this experiment, taken
 * from `choices` so the stage agrees with the mediator and agent prompts.
 */
export function applySimulationToChatStage(
  chatStage: Record<string, any>,
  simulation: SimulationTemplate,
  choices: Map<string, string> = new Map(),
): void {
  chatStage.descriptions = {
    ...chatStage.descriptions,
    primaryText: simulation.description,
    blocks: simulation.blocks.map((b) => ({
      name: b.name,
      description: pickBlockDescription(b.name, b.descriptions, choices),
    })),
  }
  if (simulation.maxUtterance != null) chatStage.numUtterances = simulation.maxUtterance
  if (simulation.maxTime != null) chatStage.timeLimitInMinutes = simulation.maxTime
}
