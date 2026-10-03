'use client'

import { createContext, useContext, useState, useRef, useEffect } from 'react'
import { blockDescriptions, describeBlock, type Block } from '../lib/blocks'

// ============================================================
// Types
// ============================================================

export enum PromptItemType {
  TEXT = 'TEXT',
  CONTEXT = 'CONTEXT',
  PROFILE_INFO = 'PROFILE_INFO',
  PARTICIPANT_INFO = 'PARTICIPANT_INFO',
  PARTICIPANT_CHAT_INPUT = 'PARTICIPANT_CHAT_INPUT',
  INITIALIZATION_CONTEXT = 'INITIALIZATION_CONTEXT',
  PRELOADED_CONTEXT='PRELOADED_CONTEXT',
  PROMPT_OUTPUT = 'PROMPT_OUTPUT',
  CHARACTER_CONTEXT = 'CHARACTER_CONTEXT',
  THOUGHT_HISTORY_CONTEXT = 'THOUGHT_HISTORY_CONTEXT',
  BIASED = 'BIASED',
  TOPIC_NAME = 'TOPIC_NAME',
  BLOCK = 'BLOCK',
  ARTICLE_PAGE= 'ARTICLE_PAGE',
  POST_TITLE = 'POST_TITLE',
  POST_DESCRIPTION = 'POST_DESCRIPTION',
  RULE = 'RULE',
  PARTICIPANT_ROLE = 'PARTICIPANT_ROLE',
  LATEST_ASSISTANT_MESSAGE = 'LATEST_ASSISTANT_MESSAGE',
  LATEST_PARTICIPANT_DRAFT = 'LATEST_PARTICIPANT_DRAFT',
  PARTICIPANT_PROFILES = 'PARTICIPANT_PROFILES',
}

export const RULE_OPTIONS = ['A', 'B', 'C', 'D', 'E', '1', '2', '3', '4', '5'] as const
export type RuleOption = typeof RULE_OPTIONS[number]

export const RULE_TITLES: Record<RuleOption, string> = {
  A: "Rule A - Doesn't Explain View",
  B: 'Rule B - 3rd Party/Devils Advocate/Soapboxing',
  C: 'Rule C - Unclear/Improper Title',
  D: 'Rule D - Neutral/Transgender/Harm a specific person/Promo/Meta',
  E: 'Rule E - No/Minimal Replies from OP in 2 hours',
  '1': "Rule 1 - Doesn't Challenge OP (top-level only)",
  '2': 'Rule 2 - Rude/Hostile Comment',
  '3': 'Rule 3 - Bad Faith Accusation',
  '4': 'Rule 4 - Delta Abuse/Misuse or Should Award Delta',
  '5': "Rule 5 - Doesn't Contribute Meaningfully",
}

export const RULE_DESCRIPTIONS: Record<RuleOption, string> = {
  A: 'Explain the reasoning behind your view, not just what that view is (500+ human-generated characters required). See the wiki for more information',
  B: "You must personally hold the view and demonstrate that you are open to it changing. A post cannot be on behalf of others, playing devil's advocate, as any entity other than yourself, or 'soapboxing'. Posts by throwaway accounts must be approved through modmail. See the wiki for more information",
  C: 'Submission titles must adequately sum up your view and include "CMV:" at the beginning. Posts with misleading/overly-simplistic titles or titles that contain spoilers may be removed. See the wiki for more information',
  D: 'Posts cannot express a neutral stance, a stance regarding transgender topics, suggest harm against a specific person, be self-promotional, or discuss this subreddit (visit r/ideasforcmv instead). See the wiki for more information',
  E: "Only post if you are willing to have a conversation with those who reply to you, and are available to do so within 2 hours of your post going live. If you haven't replied during this time, your post will be removed. See the wiki for more information",
  '1': "Direct responses to a CMV post must challenge at least one aspect of OP's stated view (however minor), unless they are asking a clarifying question. See the wiki for more information",
  '2': "Don't be rude or hostile to other users. Your comment will be removed even if the rest of it is solid. 'They started it' is not an excuse. You should report it, not respond to it. See the wiki for more information",
  '3': 'Refrain from accusing OP or anyone else of being unwilling to change their view, of using AI to generate their post or comment, of lying, or of arguing in bad faith. If you are unsure whether someone is genuine, ask clarifying questions (see: socratic method). If you think they are still exhibiting ill behaviour, please message us. See the wiki for more information',
  '4': "Award a delta if you've acknowledged a change in your view. Do not use deltas for any other purpose. You must include an explanation of the change along with the delta so we know it's genuine. Delta abuse includes sarcastic deltas, joke deltas, super-upvote deltas, etc. See the wiki for more information",
  '5': 'Comments must contain human-generated content and contribute meaningfully to the conversation. Comments that are only links, jokes, or "written upvotes" will be removed. Humor and affirmations of agreement can be contained within more substantial comments. See the wiki for more information.',
}

export interface PromptItem {
  type: PromptItemType | string
}

export interface TextPromptItem extends PromptItem {
  type: PromptItemType.TEXT
  text: string
}

export interface ContextPromptItem extends PromptItem {
  type: PromptItemType.CONTEXT
  context: 'all' | 'current' | 'before'
}

export interface ProfileInfoPromptItem extends PromptItem {
  type: PromptItemType.PROFILE_INFO
}

export interface ParticipantInfoPromptItem extends PromptItem {
  type: PromptItemType.PARTICIPANT_INFO
}

export interface ParticipantChatInputPromptItem extends PromptItem {
  type: PromptItemType.PARTICIPANT_CHAT_INPUT
}

export interface InitializationContextPromptItem extends PromptItem {
  type: PromptItemType.INITIALIZATION_CONTEXT
}

export interface PromptOutputPromptItem extends PromptItem {
  type: PromptItemType.PROMPT_OUTPUT
  promptId: string
}

export interface CharacterContextPromptItem extends PromptItem {
  type: PromptItemType.CHARACTER_CONTEXT
}

export interface ThoughtHistoryContextPromptItem extends PromptItem {
  type: PromptItemType.THOUGHT_HISTORY_CONTEXT
}

// Wikipedia Specific
export interface ArticlePagePromptItem extends PromptItem {
  type: PromptItemType.ARTICLE_PAGE
}

// Reddit Specific
export interface PostTitlePromptItem extends PromptItem {
  type: PromptItemType.POST_TITLE
}

export interface PostDescriptionPromptItem extends PromptItem {
  type: PromptItemType.POST_DESCRIPTION
}

export interface ParticipantRolePromptItem extends PromptItem {
  type: PromptItemType.PARTICIPANT_ROLE
}

export interface RulePromptItem extends PromptItem {
  type: PromptItemType.RULE
  rule: RuleOption
}

// Assistant Specific. Both read the participant's previous assistant consult
// for the stage; the platform renders them, the toolkit only passes them on.
export interface LatestAssistantMessagePromptItem extends PromptItem {
  type: PromptItemType.LATEST_ASSISTANT_MESSAGE
}

export interface LatestParticipantDraftPromptItem extends PromptItem {
  type: PromptItemType.LATEST_PARTICIPANT_DRAFT
}

// Every participant's profile (the profile stage only, no survey answers).
// Expanded by the toolkit's backend into a stage context for the profile stage.
export interface ParticipantProfilesPromptItem extends PromptItem {
  type: PromptItemType.PARTICIPANT_PROFILES
}

// Legacy
export interface PreloadedContextPromptItem extends PromptItem {
  type: PromptItemType.PRELOADED_CONTEXT
}


export interface BiasedPromptItem extends PromptItem {
  type: PromptItemType.BIASED
}

// A block authored in the Simulation Toolkit's Block Customization panel. The
// descriptions are copied in alongside the name so an exported template still
// carries the text: a run launched from the mediator toolkit sends no
// simulation, so there is nothing to look the name up in.
//
// A block may offer several alternative descriptions, one of which is drawn at
// random per experiment, so the copy is the whole list. Items saved before that
// carry a single `description` string instead — read them through
// `blockDescriptions`, which folds both shapes into a list.
export interface BlockPromptItem extends PromptItem {
  type: PromptItemType.BLOCK
  name: string
  descriptions: string[]
}

export interface PromptItemUpdate {
  text?: string
  rule?: RuleOption
  promptId?: string
}

// ============================================================
// Immutable tree update helpers
// ============================================================

function treeUpdateItem(root: PromptItem[], target: PromptItem, updates: PromptItemUpdate): PromptItem[] {
  return root.map(item => item === target ? { ...item, ...updates } as PromptItem : item)
}

function treeAddTo(root: PromptItem[], targetArr: PromptItem[], newItem: PromptItem): PromptItem[] {
  if (root === targetArr) return [...root, newItem]
  return root
}

function treeRemoveFrom(root: PromptItem[], targetArr: PromptItem[], index: number): PromptItem[] {
  if (root === targetArr) return root.filter((_, i) => i !== index)
  return root
}

function treeMoveIn(root: PromptItem[], targetArr: PromptItem[], index: number, dir: number): PromptItem[] {
  if (root !== targetArr) return root
  const newIndex = index + dir
  if (newIndex < 0 || newIndex >= root.length) return root
  const copy = [...root]
  ;[copy[index], copy[newIndex]] = [copy[newIndex], copy[index]]
  return copy
}

function treeReorder(root: PromptItem[], targetArr: PromptItem[], from: number, to: number): PromptItem[] {
  if (root !== targetArr) return root
  if (from === to) return root
  if (from < 0 || to < 0 || from >= root.length || to >= root.length) return root
  const copy = [...root]
  const [moved] = copy.splice(from, 1)
  copy.splice(to, 0, moved)
  return copy
}

// ============================================================
// Editor context
// ============================================================

type AssistantMode = 'wp' | 'reddit' | 'simulation'

// Display names for the participant blocks. The /assistant and Reddit editors
// use the newer names; WP, the mediator and the agent editor keep the old ones.
// Only the label changes — the stored item type stays the same everywhere.
const RENAMED_LABELS: Partial<Record<string, string>> = {
  [PromptItemType.PARTICIPANT_INFO]: 'Profile Info',
  [PromptItemType.PARTICIPANT_CHAT_INPUT]: 'Current Draft',
  [PromptItemType.LATEST_ASSISTANT_MESSAGE]: 'Previous Assistant Message',
  [PromptItemType.LATEST_PARTICIPANT_DRAFT]: 'Previous Draft',
}
const OLD_LABELS: Partial<Record<string, string>> = {
  [PromptItemType.PARTICIPANT_INFO]: 'Participant Info',
  [PromptItemType.PARTICIPANT_CHAT_INPUT]: 'Participant Chat Input',
  [PromptItemType.LATEST_ASSISTANT_MESSAGE]: 'Latest Assistant Message',
  [PromptItemType.LATEST_PARTICIPANT_DRAFT]: 'Latest Participant Draft',
}

function participantBlockLabel(type: PromptItemType, assistantMode?: AssistantMode): string {
  const renamed = assistantMode === 'simulation' || assistantMode === 'reddit'
  return (renamed ? RENAMED_LABELS : OLD_LABELS)[type] ?? type
}

interface EditorCtx {
  assistantMode?: AssistantMode
  locked: boolean
  blocks: Block[]
  blocksLoaded?: boolean
  updateItem: (item: PromptItem, updates: PromptItemUpdate) => void
  addItem: (targetArr: PromptItem[], newItem: PromptItem) => void
  deleteItem: (targetArr: PromptItem[], index: number) => void
  moveItem: (targetArr: PromptItem[], index: number, dir: number) => void
  reorderItem: (targetArr: PromptItem[], from: number, to: number) => void
  promptOutputOptions: { id: string; label: string }[]
}

const EditorContext = createContext<EditorCtx | null>(null)
const useEditorCtx = () => {
  const ctx = useContext(EditorContext)
  if (!ctx) throw new Error('Must render inside StructuredPromptEditor')
  return ctx
}

// ============================================================
// Primitive UI components
// ============================================================

const ICON_CHARS: Record<string, string> = {
  arrow_upward: '↑',
  arrow_downward: '↓',
  close: '×',
}

function IconButton({ icon, title, onClick }: {
  icon: string
  title?: string
  onClick: () => void
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-6 h-6 flex items-center justify-center rounded text-sm transition-colors text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700"
    >
      {ICON_CHARS[icon] ?? icon}
    </button>
  )
}

function AddMenu({ targetArr, textOnly, blocks = [], assistantMode, showInitializationContext, showCharacterContext, showThoughtHistoryContext, hideDebateAndParticipantBlocks, showSimulationBlocks = true, hideDebateItems, showParticipantProfiles }: {
  targetArr: PromptItem[]
  textOnly?: boolean
  blocks?: Block[]
  assistantMode?: AssistantMode
  showInitializationContext?: boolean
  showCharacterContext?: boolean
  showThoughtHistoryContext?: boolean
  hideDebateAndParticipantBlocks?: boolean
  showSimulationBlocks?: boolean
  hideDebateItems?: boolean
  showParticipantProfiles?: boolean
}) {
  const { addItem, locked, promptOutputOptions } = useEditorCtx()
  if (locked) return null
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const pick = (item: PromptItem) => { addItem(targetArr, item); setOpen(false) }
  const itemClass = 'px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 cursor-pointer whitespace-nowrap transition-colors'

  return (
    <div ref={ref} className="relative">
      <button
        id='tour-add-item'
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-md border border-dashed border-neutral-600 text-sm text-neutral-400 hover:border-neutral-400 hover:text-neutral-200 transition-colors px-3 py-1.5"
      >
        <span className="text-base leading-none">+</span> Add item
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
          <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.TEXT, text: '' } as TextPromptItem)}>
            Freeform Text
          </div>
          {!assistantMode && !hideDebateAndParticipantBlocks && !hideDebateItems && (
            <>
              <div className="my-0.5 border-t border-neutral-700/60" />
              <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.TEXT, text: '{topic_name}' } as TextPromptItem)}>
                Debate Topic
              </div>
              <div className="my-0.5 border-t border-neutral-700/60" />
              <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.TEXT, text: '{topic_statement}' } as TextPromptItem)}>
                Debate Statement
              </div>
            </>
          )}
          {assistantMode === 'wp' && (
            <>
              <div className="my-0.5 border-t border-neutral-700/60" />
              <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.ARTICLE_PAGE } as ArticlePagePromptItem)}>
                Article Page
              </div>
            </>
          )}
          {assistantMode === 'reddit' && (
            <>
              <div className="my-0.5 border-t border-neutral-700/60" />
              <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.POST_TITLE } as PostTitlePromptItem)}>
                Post Title
              </div>
              <div className="my-0.5 border-t border-neutral-700/60" />
              <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.POST_DESCRIPTION } as PostDescriptionPromptItem)}>
                Post Description
              </div>
              <div className="my-0.5 border-t border-neutral-700/60" />
              <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.RULE, rule: 'A' } as RulePromptItem)}>
                Rule
              </div>
              <div className="my-0.5 border-t border-neutral-700/60" />
              <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.PARTICIPANT_ROLE } as ParticipantRolePromptItem)}>
                Participant Role
              </div>
            </>
          )}
          {!assistantMode && !hideDebateAndParticipantBlocks && !hideDebateItems && (
            <>
              <div className="my-0.5 border-t border-neutral-700/60" />
              <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.CONTEXT, context: 'before' } as ContextPromptItem)}>
                Participant Initial Positions
              </div>
            </>
          )}
          {showParticipantProfiles && (
            <>
              <div className="my-0.5 border-t border-neutral-700/60" />
              <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.PARTICIPANT_PROFILES } as ParticipantProfilesPromptItem)}>
                Participant Profiles
              </div>
            </>
          )}
          {!textOnly && (
            <>
              <div className="my-0.5 border-t border-neutral-700/60" />
              <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.CONTEXT, context: 'current' } as ContextPromptItem)}>
                Conversation Context
              </div>
              {!assistantMode && (
                <>
                  <div className="my-0.5 border-t border-neutral-700/60" />
                  <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.PROFILE_INFO } as ProfileInfoPromptItem)}>
                    Profile Info
                  </div>
                </>
              )}
              {!hideDebateAndParticipantBlocks && (
                <>
                  <div className="my-0.5 border-t border-neutral-700/60" />
                  <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.PARTICIPANT_INFO } as ParticipantInfoPromptItem)}>
                    {participantBlockLabel(PromptItemType.PARTICIPANT_INFO, assistantMode)}
                  </div>
                  <div className="my-0.5 border-t border-neutral-700/60" />
                  <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.PARTICIPANT_CHAT_INPUT } as ParticipantChatInputPromptItem)}>
                    {participantBlockLabel(PromptItemType.PARTICIPANT_CHAT_INPUT, assistantMode)}
                  </div>
                </>
              )}
              {assistantMode && (
                <>
                  <div className="my-0.5 border-t border-neutral-700/60" />
                  <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.LATEST_ASSISTANT_MESSAGE } as LatestAssistantMessagePromptItem)}>
                    {participantBlockLabel(PromptItemType.LATEST_ASSISTANT_MESSAGE, assistantMode)}
                  </div>
                  <div className="my-0.5 border-t border-neutral-700/60" />
                  <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.LATEST_PARTICIPANT_DRAFT } as LatestParticipantDraftPromptItem)}>
                    {participantBlockLabel(PromptItemType.LATEST_PARTICIPANT_DRAFT, assistantMode)}
                  </div>
                </>
              )}
              {!assistantMode && showInitializationContext !== false && (
                <>
                  <div className="my-0.5 border-t border-neutral-700/60" />
                  <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.INITIALIZATION_CONTEXT } as InitializationContextPromptItem)}>
                    Initialization Result
                  </div>
                </>
              )}
              {!assistantMode && showCharacterContext && (
                <>
                  <div className="my-0.5 border-t border-neutral-700/60" />
                  <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.CHARACTER_CONTEXT } as CharacterContextPromptItem)}>
                    Character
                  </div>
                </>
              )}
              {!assistantMode && showThoughtHistoryContext && (
                <>
                  <div className="my-0.5 border-t border-neutral-700/60" />
                  <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.THOUGHT_HISTORY_CONTEXT } as ThoughtHistoryContextPromptItem)}>
                    Thought History
                  </div>
                </>
              )}
              {!assistantMode && promptOutputOptions.length > 0 && (
                <>
                  <div className="my-0.5 border-t border-neutral-700/60" />
                  {promptOutputOptions.map(opt => (
                    <div
                      key={opt.id}
                      className={itemClass}
                      role="button"
                      onClick={() => pick({ type: PromptItemType.PROMPT_OUTPUT, promptId: opt.id } as PromptOutputPromptItem)}
                    >
                      Output: {opt.label}
                    </div>
                  ))}
                </>
              )}
            </>
          )}
          {/* {textOnly && (
            <>
              <div className="my-0.5 border-t border-neutral-700/60" />
              <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.BIASED } as BiasedPromptItem)}>
                Target position
              </div>
            </>
          )} */}
          {!assistantMode && !hideDebateAndParticipantBlocks && !hideDebateItems && (
            <>
              <div className="my-0.5 border-t border-neutral-700/60" />
              <div className={itemClass} role="button" onClick={() => pick({ type: PromptItemType.BIASED } as BiasedPromptItem)}>
                Target Position
              </div>
            </>
          )}

          {/* Blocks authored in the Simulation Toolkit. They only appear once
              the simulation holding them has been saved. */}
          {showSimulationBlocks && (<>
          <div className="my-0.5 border-t border-neutral-700" />
          <div className="px-3 py-1.5 flex items-center justify-between gap-2">
            <span className={`text-[11px] font-semibold uppercase tracking-widest ${blocks.length === 0 ? 'text-neutral-700' : 'text-neutral-600'}`}>
              Simulation Blocks
            </span>
            {blocks.length === 0 && (
              <span className="text-[10px] font-medium normal-case tracking-normal text-neutral-600 bg-neutral-800 rounded px-1.5 py-0.5">
                Not available
              </span>
            )}
          </div>
          {blocks.length === 0 ? (
            <div className="px-3 pb-2 max-w-56 text-xs text-neutral-700">
              Only available once blocks are defined under Block Customization in the Simulation Toolkit and the simulation is saved.
            </div>
          ) : (
            blocks.map(block => (
              <div
                key={block.name}
                className={itemClass}
                role="button"
                title={describeBlock(block)}
                onClick={() => pick({
                  type: PromptItemType.BLOCK,
                  name: block.name,
                  descriptions: blockDescriptions(block),
                } as BlockPromptItem)}
              >
                {block.name}
              </div>
            ))
          )}
          </>)}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Item editors
// ============================================================

function TextItemEditor({ item }: { item: TextPromptItem }) {
  const { updateItem } = useEditorCtx()
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [item.text])

  return (
    <textarea
      ref={ref}
      className="w-full min-h-[72px] p-2 rounded-md border border-neutral-600/60 bg-neutral-900 text-sm text-neutral-200 placeholder-neutral-600 resize-none overflow-hidden focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500/30"
      placeholder="Add freeform text here…"
      value={item.text}
      onChange={e => updateItem(item, { text: e.target.value })}
    />
  )
}

// The name is the reference; the descriptions are only a fallback copy, so the
// chip shows whichever options the simulation currently holds. A block the
// simulation no longer defines is flagged rather than dropped — the prompt still
// runs on the copy it carries.
function BlockItemEditor({ item }: { item: BlockPromptItem }) {
  const { blocks, blocksLoaded } = useEditorCtx()
  const live = blocks.find(b => b.name === item.name)
  // Without a load signal from the caller, fall back to only flagging when the
  // simulation has blocks, so nothing is flagged while they are still loading.
  const missing = (blocksLoaded ?? blocks.length > 0) && !live
  const options = blockDescriptions(live ?? item).filter(d => d.trim() !== '')

  return (
    <div
      title={missing ? undefined : describeBlock(live ?? item)}
      className={`flex items-center gap-1.5 cursor-default rounded bg-[#e6dcfd] px-3 py-1.5 text-sm font-medium text-neutral-900 ${missing ? 'ring-2 ring-amber-500' : ''}`}
    >
      {missing && (
        <span className="group relative flex items-center">
          <span
            aria-label="Block deleted from simulation"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-base font-bold leading-none text-neutral-900"
          >
            !
          </span>
          <span
            role="tooltip"
            className="pointer-events-none invisible absolute left-0 top-full z-50 mt-2 w-72 whitespace-pre-wrap rounded-md border border-amber-500/50 bg-neutral-900 px-3 py-2 text-xs font-normal text-neutral-200 opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100"
          >
            <span className="mb-1 block font-semibold text-amber-400">Block deleted from the simulation</span>
            “{item.name}” was removed from Block Customization in the selected simulation. This prompt still runs with the copy saved here:
            {'\n\n'}
            <span className="text-neutral-400">{describeBlock(item) || '(empty)'}</span>
            {'\n\n'}
            Remove this block, or re-add a block named “{item.name}” in the Simulation Toolkit to link it again.
          </span>
        </span>
      )}
      {item.name}
      {options.length > 1 && (
        <span
          title={`One of these ${options.length} options is picked at random for each experiment.`}
          className="rounded-full bg-neutral-900/15 px-1.5 text-[11px] leading-4"
        >
          {options.length}
        </span>
      )}
    </div>
  )
}

function RuleItemEditor({ item }: { item: RulePromptItem }) {
  const { updateItem } = useEditorCtx()

  return (
    <select
      value={item.rule}
      onChange={e => updateItem(item, { rule: e.target.value as RuleOption })}
      title={RULE_DESCRIPTIONS[item.rule]}
      className="rounded bg-[#fde8c8] px-3 py-1.5 text-sm font-medium text-neutral-900 cursor-pointer focus:outline-none"
    >
      {RULE_OPTIONS.map(option => (
        <option key={option} value={option} title={RULE_DESCRIPTIONS[option]}>{RULE_TITLES[option]}</option>
      ))}
    </select>
  )
}

function PromptOutputItemEditor({ item }: { item: PromptOutputPromptItem }) {
  const { updateItem, promptOutputOptions } = useEditorCtx()
  const label = promptOutputOptions.find(opt => opt.id === item.promptId)?.label ?? item.promptId

  if (promptOutputOptions.length === 0) {
    return (
      <div className="cursor-default rounded bg-[#e0d8f9] px-3 py-1.5 text-sm font-medium text-neutral-900">
        Output: {label}
      </div>
    )
  }

  return (
    <select
      value={item.promptId}
      onChange={e => updateItem(item, { promptId: e.target.value })}
      className="rounded bg-[#e0d8f9] px-3 py-1.5 text-sm font-medium text-neutral-900 cursor-pointer focus:outline-none"
    >
      {!promptOutputOptions.some(opt => opt.id === item.promptId) && (
        <option value={item.promptId}>Output: {label}</option>
      )}
      {promptOutputOptions.map(opt => (
        <option key={opt.id} value={opt.id}>Output: {opt.label}</option>
      ))}
    </select>
  )
}

function ItemEditor({ item }: { item: PromptItem }) {
  const { assistantMode } = useEditorCtx()
  switch (item.type) {
    case PromptItemType.TEXT:
      if ((item as TextPromptItem).text === '{topic_name}' || (item as TextPromptItem).text === '{topic_name}\n') {
        return (
          <div className="cursor-default rounded bg-[#fde8c8] px-3 py-1.5 text-sm font-medium text-neutral-900">
            Debate Topic
          </div>
        )
      }
      else if ((item as TextPromptItem).text === '{topic_statement}' || (item as TextPromptItem).text === '{topic_statement}\n') {
        return (
          <div className="cursor-default rounded bg-[#fde8c8] px-3 py-1.5 text-sm font-medium text-neutral-900">
            Debate Statement
          </div>
        )
      }
      return <TextItemEditor item={item as TextPromptItem} />
    case PromptItemType.CONTEXT:
      return (
        <div className="cursor-default rounded bg-[#dce1fd] px-3 py-1.5 text-sm font-medium text-neutral-900">
          {(item as ContextPromptItem).context === 'before' ? 'Participant Initial Positions: the participants responses to the pre-conversation survey about the debate statement' : 'Conversation Context: the discussion up to this moment'}
        </div>
      )
    case PromptItemType.PARTICIPANT_PROFILES:
      return (
        <div className="cursor-default rounded bg-[#dce1fd] px-3 py-1.5 text-sm font-medium text-neutral-900">
          Participant Profiles
        </div>
      )
    case PromptItemType.ARTICLE_PAGE:
      return (
        <div className="cursor-default rounded bg-[#fde8c8] px-3 py-1.5 text-sm font-medium text-neutral-900">
          Article Page
        </div>
      )
    case PromptItemType.POST_TITLE:
      return (
        <div className="cursor-default rounded bg-[#fde8c8] px-3 py-1.5 text-sm font-medium text-neutral-900">
          Post Title
        </div>
      )
    case PromptItemType.POST_DESCRIPTION:
      return (
        <div className="cursor-default rounded bg-[#fde8c8] px-3 py-1.5 text-sm font-medium text-neutral-900">
          Post Description
        </div>
      )
    case PromptItemType.PARTICIPANT_ROLE:
      return (
        <div className="cursor-default rounded bg-[#fde8c8] px-3 py-1.5 text-sm font-medium text-neutral-900">
          Participant Role
        </div>
      )
    case PromptItemType.RULE:
      return <RuleItemEditor item={item as RulePromptItem} />
    case PromptItemType.PROFILE_INFO:
      return (
        <div className="cursor-default rounded bg-[#f9d8f5] px-3 py-1.5 text-sm font-medium text-neutral-900">
          Profile Info
        </div>
      )
    case PromptItemType.PARTICIPANT_INFO:
      return (
        <div className="cursor-default rounded bg-[#dce1fd] px-3 py-1.5 text-sm font-medium text-neutral-900">
          {participantBlockLabel(PromptItemType.PARTICIPANT_INFO, assistantMode)}
        </div>
      )
    case PromptItemType.PARTICIPANT_CHAT_INPUT:
      return (
        <div className="cursor-default rounded bg-[#dce1fd] px-3 py-1.5 text-sm font-medium text-neutral-900">
          {participantBlockLabel(PromptItemType.PARTICIPANT_CHAT_INPUT, assistantMode)}
        </div>
      )
    case PromptItemType.LATEST_ASSISTANT_MESSAGE:
      return (
        <div className="cursor-default rounded bg-[#dce1fd] px-3 py-1.5 text-sm font-medium text-neutral-900">
          {participantBlockLabel(PromptItemType.LATEST_ASSISTANT_MESSAGE, assistantMode)}
        </div>
      )
    case PromptItemType.LATEST_PARTICIPANT_DRAFT:
      return (
        <div className="cursor-default rounded bg-[#dce1fd] px-3 py-1.5 text-sm font-medium text-neutral-900">
          {participantBlockLabel(PromptItemType.LATEST_PARTICIPANT_DRAFT, assistantMode)}
        </div>
      )
    case PromptItemType.INITIALIZATION_CONTEXT:
    case PromptItemType.PRELOADED_CONTEXT:
      return (
        <div className="cursor-default rounded bg-[#d8f9e0] px-3 py-1.5 text-sm font-medium text-neutral-900">
          Initialization Result
        </div>
      )
    case PromptItemType.CHARACTER_CONTEXT:
      return (
        <div className="cursor-default rounded bg-[#f9e0d8] px-3 py-1.5 text-sm font-medium text-neutral-900">
          Character
        </div>
      )
    case PromptItemType.THOUGHT_HISTORY_CONTEXT:
      return (
        <div className="cursor-default rounded bg-[#d8f0f9] px-3 py-1.5 text-sm font-medium text-neutral-900">
          Thought History
        </div>
      )
    case PromptItemType.PROMPT_OUTPUT:
      return <PromptOutputItemEditor item={item as PromptOutputPromptItem} />
    case PromptItemType.BIASED:
      return (
        <div className="cursor-default rounded bg-[#f08673] px-3 py-1.5 text-sm font-medium text-neutral-900">
          Target Position
        </div>
      )
    case PromptItemType.BLOCK:
      return <BlockItemEditor item={item as BlockPromptItem} />
    default:
      return null
  }
}

// ============================================================
// Item list
// ============================================================

function DragHandle({ onArm, onDisarm }: { onArm: () => void; onDisarm: () => void }) {
  return (
    <div
      title="Drag to reorder"
      // `draggable` is armed only while the handle is held, so text selection
      // inside the item's textarea keeps working the rest of the time.
      onMouseDown={onArm}
      onMouseUp={onDisarm}
      className="w-6 h-6 shrink-0 flex items-center justify-center rounded text-neutral-600 select-none cursor-grab active:cursor-grabbing hover:text-neutral-300 hover:bg-neutral-700 transition-colors"
    >
      ⠿
    </div>
  )
}

function PromptItemList({ items, isNested = false }: { items: PromptItem[]; isNested?: boolean }) {
  const { deleteItem, moveItem, reorderItem, locked } = useEditorCtx()
  const [armedIndex, setArmedIndex] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const endDrag = () => {
    setArmedIndex(null)
    setDragIndex(null)
    setOverIndex(null)
  }

  if (items.length === 0) {
    return (
      <p className={`py-2 text-sm text-neutral-500 ${isNested ? 'italic' : ''}`}>
        ⚠️ No items added yet
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item, index) => {
        const isDragging = dragIndex === index
        const showLine = dragIndex !== null && overIndex === index && !isDragging
        const lineAbove = showLine && dragIndex > index
        const lineBelow = showLine && dragIndex < index

        return (
          <div
            key={index}
            draggable={armedIndex === index}
            onDragStart={e => {
              setDragIndex(index)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', String(index))
            }}
            onDragEnd={endDrag}
            onDragOver={e => {
              if (dragIndex === null) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (overIndex !== index) setOverIndex(index)
            }}
            onDrop={e => {
              e.preventDefault()
              if (dragIndex !== null) reorderItem(items, dragIndex, index)
              endDrag()
            }}
            className={`group rounded-lg border bg-neutral-800 transition-colors ${
              isDragging ? 'opacity-40 border-neutral-500' : 'border-neutral-700'
            } ${lineAbove ? 'border-t-2 border-t-blue-400' : ''} ${
              lineBelow ? 'border-b-2 border-b-blue-400' : ''
            }`}
          >
            <div className="flex items-start gap-2 p-2.5">
              {!locked && (
                <DragHandle
                  onArm={() => setArmedIndex(index)}
                  onDisarm={() => setArmedIndex(null)}
                />
              )}
              <div className="min-w-0 flex-1">
                <ItemEditor item={item} />
              </div>
              {!locked && (
                <div className="flex shrink-0 items-center gap-0.5 ">
                  <IconButton icon="arrow_upward" onClick={() => moveItem(items, index, -1)} />
                  <IconButton icon="arrow_downward" onClick={() => moveItem(items, index, 1)} />
                  <IconButton icon="close" onClick={() => deleteItem(items, index)} />
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// Main component
// ============================================================

export interface StructuredPromptEditorProps {
  prompt: PromptItem[]
  stageId?: string
  onUpdate: (prompt: PromptItem[]) => void
  label?: string
  locked?: boolean
  textOnly?: boolean
  /** Blocks of the selected simulation, offered under "Add item". */
  blocks?: Block[]
  /** Whether `blocks` has loaded; enables the deleted-block warning even when it is empty. */
  blocksLoaded?: boolean
  assistantMode?: AssistantMode
  // Gates the "Initialization Result" block; omit to keep it always offered
  // (existing callers), pass false where initialization is an optional,
  // toggleable feature and it should only appear once enabled.
  showInitializationContext?: boolean
  showCharacterContext?: boolean
  showThoughtHistoryContext?: boolean
  // Named prompts (with a strictly earlier order) whose output can be pulled
  // in via a "Prompt Output" block.
  promptOutputOptions?: { id: string; label: string }[]
  // Hides the debate-flavored blocks (Debate Topic/Statement, Participant
  // Initial Positions, Target Position) and the other-participant blocks
  // (Participant Info, Participant Chat Input) — none of which apply to the
  // Agent Participant toolkit.
  hideDebateAndParticipantBlocks?: boolean
  // Offers the Simulation Toolkit's blocks under "Add item". Off for pages
  // whose runs never send a simulation (the Reddit assistant), where a block
  // could only ever run from its stored copy.
  showSimulationBlocks?: boolean
  // Hides only the debate items (Debate Topic, Debate Statement, Target
  // Position, Participant Initial Positions), for editors not meant for
  // debates; the participant blocks stay.
  hideDebateItems?: boolean
  // Offers "Participant Profiles": every participant's profile, without the
  // survey answers Participant Initial Positions carries.
  showParticipantProfiles?: boolean
}

export function StructuredPromptEditor({
  prompt,
  onUpdate,
  label = 'Prompt editor',
  locked = false,
  textOnly = false,
  blocks = [],
  blocksLoaded,
  assistantMode,
  showInitializationContext,
  showCharacterContext,
  showThoughtHistoryContext,
  promptOutputOptions = [],
  hideDebateAndParticipantBlocks,
  showSimulationBlocks,
  hideDebateItems,
  showParticipantProfiles,
}: StructuredPromptEditorProps) {
  // A block item carries a copy of its descriptions so the exported template runs
  // without the simulation. Re-editing the block in the Simulation Toolkit would
  // leave that copy behind, so refresh it whenever the two drift apart. The copy
  // is rewritten as a list even when it was saved as a single string, which is
  // what retires the old shape from saved templates.
  useEffect(() => {
    if (locked || blocks.length === 0) return
    let changed = false
    const synced = prompt.map(item => {
      if (item.type !== PromptItemType.BLOCK) return item
      const block = item as BlockPromptItem
      const live = blocks.find(b => b.name === block.name)
      if (!live) return item
      const liveDescriptions = blockDescriptions(live)
      const copied = blockDescriptions(block)
      if (Array.isArray(block.descriptions)
        && liveDescriptions.length === copied.length
        && liveDescriptions.every((d, i) => d === copied[i])) return item
      changed = true
      const rest = { ...block } as BlockPromptItem & { description?: string }
      delete rest.description
      return { ...rest, descriptions: liveDescriptions }
    })
    if (changed) onUpdate(synced)
  }, [prompt, blocks, locked, onUpdate])

  const ctx: EditorCtx = {
    assistantMode,
    locked,
    blocks,
    blocksLoaded,
    updateItem: (item, updates) => onUpdate(treeUpdateItem(prompt, item, updates)),
    addItem: (targetArr, newItem) => onUpdate(treeAddTo(prompt, targetArr, newItem)),
    deleteItem: (targetArr, index) => onUpdate(treeRemoveFrom(prompt, targetArr, index)),
    moveItem: (targetArr, index, dir) => onUpdate(treeMoveIn(prompt, targetArr, index, dir)),
    reorderItem: (targetArr, from, to) => onUpdate(treeReorder(prompt, targetArr, from, to)),
    promptOutputOptions,
  }

  return (
    <EditorContext.Provider value={ctx}>
      <div className="rounded-lg border border-neutral-700 bg-neutral-900">
        <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700/60">
          <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">{label}</span>
          <AddMenu
            targetArr={prompt}
            textOnly={textOnly}
            blocks={blocks}
            assistantMode={assistantMode}
            showInitializationContext={showInitializationContext}
            showCharacterContext={showCharacterContext}
            showThoughtHistoryContext={showThoughtHistoryContext}
            hideDebateAndParticipantBlocks={hideDebateAndParticipantBlocks}
            showSimulationBlocks={showSimulationBlocks}
            hideDebateItems={hideDebateItems}
            showParticipantProfiles={showParticipantProfiles}
          />
        </div>
        <div className="p-3">
          <PromptItemList items={prompt} />
        </div>
      </div>
    </EditorContext.Provider>
  )
}

// ============================================================
// Example
// ============================================================

export function StructuredPromptEditorExample() {
  const [prompt, setPrompt] = useState<PromptItem[]>([
    { type: PromptItemType.TEXT, text: 'hi' } as TextPromptItem,
  ])

  return (
    <div className="space-y-3">
      <StructuredPromptEditor prompt={prompt} onUpdate={setPrompt} />
      <details>
        <summary className="cursor-pointer text-xs text-neutral-600 hover:text-neutral-400">Prompt JSON</summary>
        <pre className="mt-1.5 overflow-auto rounded-md bg-neutral-800/50 p-3 text-xs text-neutral-400">
          {JSON.stringify(prompt, null, 2)}
        </pre>
      </details>
    </div>
  )
}
