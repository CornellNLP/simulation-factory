'use client'

export type ActionState = { status: 'idle' | 'loading' | 'done' | 'error'; result: unknown }

// highlighted message inside a ResultBox: ok = green, warn = amber, score = blue
export type Note = { text: string; tone: 'ok' | 'warn' | 'score' }
const NOTE_CLASS = {
  ok: 'border-emerald-800 bg-emerald-950/40 text-emerald-300',
  warn: 'border-amber-800 bg-amber-950/40 text-amber-300',
  score: 'border-sky-800 bg-sky-950/40 text-sky-300',
}
const noteBox = (note: Note, key?: number) => (
  <p key={key} className={`text-sm whitespace-pre-wrap rounded-md border px-3 py-2 ${NOTE_CLASS[note.tone]}`}>{note.text}</p>
)

export function ActionButton({ label, loadingLabel, loading, disabled, onClick }: {
  label: string
  loadingLabel: string
  loading: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="w-full px-5 py-2.5 rounded-lg border border-neutral-700 bg-neutral-900 text-base font-medium text-neutral-200 hover:bg-neutral-800 hover:border-neutral-600 active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
    >
      {loading ? loadingLabel : label}
    </button>
  )
}

type ParticipantLink = {url: string; type: string}
type CohortLinks = { participant_urls?: ParticipantLink[] }

export function ResultBox({ title, state, links, showMessage, note, scoreNotes }: {
  title: string
  state: ActionState
  links?: { cohorts?: CohortLinks[]; mode?: string }
  showMessage?: boolean
  note?: Note
  scoreNotes?: Note[]
}) {
  const isError = state.status === 'error'
  const message = showMessage && state.result && typeof state.result === 'object'
    ? (state.result as Record<string, unknown>).message as string | undefined
    : undefined

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-800">
        <span className={`w-1.5 h-1.5 rounded-full ${isError ? 'bg-red-500' : 'bg-emerald-500'}`} />
        <span className="text-sm font-medium text-neutral-400 uppercase tracking-wider">{title} {links?.mode ? `(${links.mode})` : ''}</span>
      </div>
      <div className="p-4 space-y-3">
        {links?.cohorts && links.cohorts.map((cohort, cohortIdx) => (
          <div key={cohortIdx} className="space-y-2">
            {cohort.participant_urls?.length === 2 && cohort.participant_urls.some(u => u.type === "agent") && (
              <div className="mb-3">
                <label className="text-sm text-neutral-400">
                  The links below show you the Agent view as they complete the surveys and participate in the debate. You won't be able to interact.
                </label>
              </div>
            )}
            {cohort.participant_urls?.map((item, pIdx) => (
              <a
                key={`${cohortIdx}-${pIdx}`}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="block text-sm text-neutral-300 hover:text-white underline underline-offset-2 transition-colors break-all"
              >
                Participant {pIdx + 1} ({item.type}) ↗
              </a>
            ))}
          </div>
        ))}
        {note && noteBox(note)}
        {message && (
          <p className="text-sm text-neutral-300 whitespace-pre-wrap">{message}</p>
        )}
        {scoreNotes?.map(noteBox)}
        <details className="text-sm text-neutral-400">
          <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300 transition-colors select-none">Show JSON output</summary>
          <pre className="mt-2 overflow-auto leading-relaxed whitespace-pre-wrap break-words">
            {JSON.stringify(state.result, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  )
}
