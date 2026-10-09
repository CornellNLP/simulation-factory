'use client'

// One row of an experiment: who sits in the conversation, and which assistant
// stands behind them. Public Assistants never take an assistant, so `assistant` stays
// null on those rows.
export type PairingMember = { participant: string; assistant: string | null }

// `id` is stable for the life of the pairing so that other panels (e.g. Simulate
// Conversation) can reference an experiment without breaking when one is removed
// and the remaining ones shift position.
export type Pairing = { id: string; members: PairingMember[] }

export const newPairingId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `pairing-${Math.random().toString(36).slice(2)}`

export type MemberOption = { value: string; label: string }

// Public Assistant picks carry this prefix so a stored member value still says which
// library it came from: agents are stored as their bare saved-agent id, and the
// two are opaque document ids that would otherwise be indistinguishable once a
// simulation is saved. The stored value keeps the original `mediator:` spelling
// (as does `no_mediator` below) so simulations saved before the rename still load.
export const PUBLIC_ASSISTANT_PREFIX = 'mediator:'

export const publicAssistantMember = (id: string) => `${PUBLIC_ASSISTANT_PREFIX}${id}`

// A human seat. It takes a place in the conversation like an agent does, and a
// run that holds one hands back a join link for it instead of building a
// participant up front.
export const HUMAN_MEMBER = 'human'

// Simulations saved while the public assistant list was still hardcoded hold these
// placeholders; they keep counting as a public assistant so an old simulation runs the
// way it used to.
const LEGACY_PUBLIC_ASSISTANT_VALUES = new Set(['mediator1', 'mediator2', 'mediator3'])

const isPublicAssistantMember = (member: string) =>
  member.startsWith(PUBLIC_ASSISTANT_PREFIX) || LEGACY_PUBLIC_ASSISTANT_VALUES.has(member)

/** Whether a participant pick can have an assistant attached to it. */
export const takesAssistant = (participant: string) =>
  participant !== '' && participant !== 'no_mediator' && !isPublicAssistantMember(participant)

// A member that is no longer in either library is shown by whatever is left of
// its stored value, which for a public assistant is the id behind the prefix.
const memberLabel = (member: string) =>
  member.startsWith(PUBLIC_ASSISTANT_PREFIX) ? member.slice(PUBLIC_ASSISTANT_PREFIX.length) : member

/**
 * Reads a pairing's members however they were stored.
 *
 * Simulations saved before members carried an assistant hold one plain string
 * per row, which reads as "this participant, no assistant".
 */
export function normalizeMembers(members: unknown): PairingMember[] {
  if (!Array.isArray(members)) return []
  return members.map(m => {
    if (typeof m === 'string') return { participant: m, assistant: null }
    const participant = String((m as PairingMember)?.participant ?? '')
    const assistant = (m as PairingMember)?.assistant ?? null
    return { participant, assistant: takesAssistant(participant) ? assistant : null }
  })
}

// What a pairing means to a run: how many agents sit in the conversation,
// whether a public assistant joins them, and which saved templates were picked so the
// run can load the ones the user actually authored. Stances are still drawn
// randomly per cohort; only the prompts come from the picks.
//
// Agents are identified by exclusion rather than by a fixed list, because both
// lists are now the user's own saved libraries: a simulation saved against an
// agent that has since been renamed still counts toward the agent total.
export function summarizePairing(pairing: Pairing) {
  const selected = normalizeMembers(pairing.members)
    .filter(m => m.participant && m.participant !== 'no_mediator')
  const publicAssistant = selected.find(m => isPublicAssistantMember(m.participant))
  // Every seat in the conversation, in the order it was laid out, which is the
  // order the run hands them to p1, p2, … A human seat and an agent seat each
  // take one; the public assistant sits outside the count.
  const seatMembers = selected.filter(m => !isPublicAssistantMember(m.participant))
  const agents = seatMembers.filter(m => m.participant !== HUMAN_MEMBER)
  return {
    agentCount: agents.length,
    hasPublicAssistant: publicAssistant !== undefined,
    seats: seatMembers.map(
      m => (m.participant === HUMAN_MEMBER ? 'human' : 'agent') as 'human' | 'agent',
    ),
    // Saved-agent ids in the order they were added, which is the order they are
    // handed to the participant slots.
    agentIds: agents.map(m => m.participant),
    // Saved-assistant ids positional against `seats` — not against `agentIds` —
    // null where that seat runs unassisted. A human seat may be assisted too, and
    // the run addresses both kinds by the slot the seat sits in, so the alignment
    // that has to survive is the one with the seats.
    seatAssistantIds: seatMembers.map(m => m.assistant ?? null),
    // Human seats need a join link handed out rather than a built participant.
    humanCount: selected.filter(m => m.participant === HUMAN_MEMBER).length,
    // Null for a legacy placeholder, which names no saved template to load; the
    // run falls back to the stock public assistant for those.
    publicAssistantId: publicAssistant?.participant.startsWith(PUBLIC_ASSISTANT_PREFIX)
      ? publicAssistant.participant.slice(PUBLIC_ASSISTANT_PREFIX.length)
      : null,
  }
}

/**
 * A pairing named by what it uses, e.g. "Moderator · Alice (Helper) · Human".
 * Assistants follow the participant they back; an empty pairing is "Empty".
 */
export function describePairing(
  pairing: Pairing,
  options: { agents?: MemberOption[]; publicAssistants?: MemberOption[]; assistants?: MemberOption[] },
) {
  const labels = new Map([...(options.agents ?? []), ...(options.publicAssistants ?? [])].map(o => [o.value, o.label]))
  const assistantLabels = new Map((options.assistants ?? []).map(o => [o.value, o.label]))
  const parts = normalizeMembers(pairing.members)
    .filter(m => m.participant && m.participant !== 'no_mediator')
    .map(m => {
      const name = m.participant === HUMAN_MEMBER ? 'Human' : labels.get(m.participant) ?? memberLabel(m.participant)
      return m.assistant ? `${name} (${assistantLabels.get(m.assistant) ?? m.assistant})` : name
    })
  return parts.length > 0 ? parts.join(' · ') : 'Empty'
}

function ordinal(n: number) {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

const SELECT_CLASS =
  'flex-1 min-w-0 px-2 py-1.5 rounded-md border border-neutral-700 bg-neutral-800 text-sm text-neutral-200 focus:outline-none focus:border-neutral-500 transition-colors cursor-pointer'

export function PairingsEditor({ pairings, onUpdate, agentOptions = [], publicAssistantOptions = [], assistantOptions = [] }: {
  pairings: Pairing[]
  onUpdate: (pairings: Pairing[]) => void
  /** Agents saved in the Agent Participants toolkit. */
  agentOptions?: MemberOption[]
  /** Public Assistants saved in the Public Assistant Toolkit; values are already prefixed. */
  publicAssistantOptions?: MemberOption[]
  /** Assistants saved in the Private Assistant toolkit. */
  assistantOptions?: MemberOption[]
}) {
  const knownValues = new Set([...agentOptions, ...publicAssistantOptions].map(o => o.value))
  const knownAssistants = new Set(assistantOptions.map(o => o.value))
  const addExperiment = () => onUpdate([...pairings, { id: newPairingId(), members: [] }])

  const removeExperiment = (idx: number) => onUpdate(pairings.filter((_, i) => i !== idx))

  const membersOf = (pairing: Pairing) => normalizeMembers(pairing.members)

  const updateMembers = (idx: number, next: (members: PairingMember[]) => PairingMember[]) =>
    onUpdate(pairings.map((p, i) => (i === idx ? { ...p, members: next(membersOf(p)) } : p)))

  const addMember = (idx: number) =>
    updateMembers(idx, members => [...members, { participant: '', assistant: null }])

  // Switching a row onto a public assistant drops the assistant with it — a public assistant has
  // nowhere to put one, and leaving it set would resurrect it if the row were
  // switched back.
  const setParticipant = (idx: number, memberIdx: number, participant: string) =>
    updateMembers(idx, members => members.map((m, j) =>
      j === memberIdx
        ? { participant, assistant: takesAssistant(participant) ? m.assistant : null }
        : m,
    ))

  const setAssistant = (idx: number, memberIdx: number, assistant: string) =>
    updateMembers(idx, members => members.map((m, j) =>
      j === memberIdx ? { ...m, assistant: assistant || null } : m,
    ))

  const removeMember = (idx: number, memberIdx: number) =>
    updateMembers(idx, members => members.filter((_, j) => j !== memberIdx))

  return (
    <div className="flex flex-wrap gap-4">
      {pairings.map((pairing, idx) => {
        const members = membersOf(pairing)
        return (
          <div
            key={pairing.id}
            className="w-96 min-h-64 flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-300">{ordinal(idx + 1)} experiment</span>
              <button
                onClick={() => removeExperiment(idx)}
                aria-label={`Remove ${ordinal(idx + 1)} experiment`}
                className="text-neutral-600 hover:text-neutral-300 transition-colors cursor-pointer leading-none px-1"
              >
                ×
              </button>
            </div>

            {members.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                <span className="flex-1">Participant</span>
                <span className="flex-1">Assistant</span>
                <span className="w-4" />
              </div>
            )}

            {members.map((member, memberIdx) => (
              <div key={memberIdx} className="flex items-center gap-1.5">
                <select
                  value={member.participant}
                  onChange={e => setParticipant(idx, memberIdx, e.target.value)}
                  aria-label="Participant"
                  className={SELECT_CLASS}
                >
                  <option value="" disabled>Select…</option>
                  <optgroup label="Public Assistants">
                    <option value="no_mediator">No public assistant</option>
                    {publicAssistantOptions.length === 0 && (
                      <option value="" disabled>Save a public assistant in the Public Assistant toolkit</option>
                    )}
                    {publicAssistantOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Agents">
                    {agentOptions.length === 0 && (
                      <option value="" disabled>Save an agent in the Agent Participants toolkit</option>
                    )}
                    {agentOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Humans">
                    <option value={HUMAN_MEMBER}>Human Participant</option>
                  </optgroup>
                  {/* An agent or public assistant the simulation was saved against but
                      that no longer exists still needs an option, or the select
                      would silently blank the choice out. */}
                  {member.participant
                    && member.participant !== 'no_mediator'
                    && member.participant !== HUMAN_MEMBER
                    && !knownValues.has(member.participant) && (
                    <option value={member.participant}>{memberLabel(member.participant)} (no longer saved)</option>
                  )}
                </select>

                {takesAssistant(member.participant) ? (
                  <select
                    value={member.assistant ?? ''}
                    onChange={e => setAssistant(idx, memberIdx, e.target.value)}
                    aria-label="Assistant"
                    className={SELECT_CLASS}
                  >
                    <option value="">No Assistant</option>
                    {assistantOptions.length === 0 && (
                      <option value="" disabled>Save an assistant in the Private Assistant toolkit</option>
                    )}
                    {assistantOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                    {/* Same as above: an assistant deleted after the simulation
                        was saved keeps its row rather than silently clearing. */}
                    {member.assistant && !knownAssistants.has(member.assistant) && (
                      <option value={member.assistant}>{member.assistant} (no longer saved)</option>
                    )}
                  </select>
                ) : (
                  // Public Assistants take no assistant, and an empty row has nothing to
                  // attach one to.
                  <span
                    className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-neutral-800 bg-neutral-900 text-sm text-neutral-600 select-none"
                    title="Public Assistants do not take an assistant"
                  >
                    NA
                  </span>
                )}

                <button
                  onClick={() => removeMember(idx, memberIdx)}
                  aria-label="Remove selection"
                  className="w-4 text-neutral-600 hover:text-neutral-300 transition-colors cursor-pointer leading-none"
                >
                  ×
                </button>
              </div>
            ))}

            <button
              onClick={() => addMember(idx)}
              aria-label={`Add a participant to the ${ordinal(idx + 1)} experiment`}
              className="w-full py-1.5 rounded-md border border-neutral-700 bg-neutral-800 text-sm text-neutral-300 hover:bg-neutral-700 hover:border-neutral-600 transition-colors cursor-pointer"
            >
              +
            </button>
          </div>
        )
      })}

      <button
        onClick={addExperiment}
        aria-label="Add an experiment"
        className="w-64 min-h-64 flex items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-neutral-900/40 text-3xl text-neutral-500 hover:border-neutral-500 hover:text-neutral-300 hover:bg-neutral-900 transition-colors cursor-pointer"
      >
        +
      </button>
    </div>
  )
}
