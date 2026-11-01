// Text similarity between a mediator template and the default template.
// Same as the similarity check in notebooks/mediator-prolific/submission.ipynb

import { PromptItemType, type PromptItem, type TextPromptItem } from '../components/StructuredPromptEditor'

export const SIMILARITY_THRESHOLD = 0.6
// const PARTS = ['initialization_context_prompt', 'should_respond_prompt', 'prompt']
const PARTS = ['prompt']

function mediatorText(config: Record<string, unknown>) {
  return PARTS.map(part => {
    const lines = ((config[part] as PromptItem[]) ?? []).map(b =>
      b.type === PromptItemType.TEXT ? (b as TextPromptItem).text.trim() : `[${b.type}]`)
    return `## ${part}\n` + lines.join('\n')
  }).join('\n\n')
}

const squash = (text: string) => text.split(/\s+/).filter(Boolean).join(' ')

// difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()
function sequenceRatio(a: string, b: string) {
  const b2j = new Map<string, number[]>()
  for (let j = 0; j < b.length; j++) b2j.set(b[j], [...(b2j.get(b[j]) ?? []), j])

  function longestMatch(alo: number, ahi: number, blo: number, bhi: number) {
    let [besti, bestj, bestsize] = [alo, blo, 0]
    let j2len = new Map<number, number>()
    for (let i = alo; i < ahi; i++) {
      const next = new Map<number, number>()
      for (const j of b2j.get(a[i]) ?? []) {
        if (j < blo) continue
        if (j >= bhi) break
        const k = (j2len.get(j - 1) ?? 0) + 1
        next.set(j, k)
        if (k > bestsize) [besti, bestj, bestsize] = [i - k + 1, j - k + 1, k]
      }
      j2len = next
    }
    return [besti, bestj, bestsize]
  }

  let matches = 0
  const queue = [[0, a.length, 0, b.length]]
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!
    const [i, j, k] = longestMatch(alo, ahi, blo, bhi)
    if (!k) continue
    matches += k
    if (alo < i && blo < j) queue.push([alo, i, blo, j])
    if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi])
  }
  return a.length + b.length ? 2 * matches / (a.length + b.length) : 1
}

export function templateSimilarity(current: Record<string, unknown>, defaults: Record<string, unknown>) {
  return sequenceRatio(squash(mediatorText(defaults)), squash(mediatorText(current)))
}
