import { adminAuth, adminDb } from '../../lib/firebaseAdmin'

export const ALLOWED_COLLECTIONS = ['mediators', 'assistants', 'assistants-reddit', 'assistants-simulation', 'agents', 'simulations'] as const
export type TemplateCollection = typeof ALLOWED_COLLECTIONS[number]

export function isAllowedCollection(c: unknown): c is TemplateCollection {
  return typeof c === 'string' && (ALLOWED_COLLECTIONS as readonly string[]).includes(c)
}

export async function verifyEmail(req: Request): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  try {
    const decoded = await adminAuth.verifyIdToken(token)
    return decoded.email ?? null
  } catch {
    return null
  }
}

export function templatesRef(email: string, collection: TemplateCollection) {
  return adminDb.collection('toolkitDevelopers').doc(email).collection(collection)
}

export const DUPLICATE_NAME_ERROR = 'duplicate_name'

// Agents and assistants are referenced by id from simulation YAML, so their ids
// are readable: the document id is a slug of the name, fixed at creation (a
// rename keeps it, so saved simulations keep resolving), and the template's own
// persona.id mirrors it. Public Assistants and simulations keep auto ids.
const SLUG_ID_COLLECTIONS: readonly TemplateCollection[] = ['agents', 'assistants', 'assistants-reddit', 'assistants-simulation']

export function usesSlugIds(collection: TemplateCollection) {
  return SLUG_ID_COLLECTIONS.includes(collection)
}

// "Skeptical Voter" -> "skeptical-voter". Names with no latin letters or digits
// (a Korean name, say) slug to nothing, so fall back to what the thing is.
export function slugIdFor(name: string, collection: TemplateCollection) {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return slug || (collection === 'agents' ? 'agent' : 'assistant')
}

// Writes `id` into the template's persona.id. Content that is not a JSON object
// with a persona is returned untouched.
export function withPersonaId(content: string, id: string) {
  try {
    const data = JSON.parse(content)
    if (!data || typeof data !== 'object' || !data.persona || typeof data.persona !== 'object') return content
    if (data.persona.id === id) return content
    data.persona.id = id
    return JSON.stringify(data, null, 2)
  } catch {
    return content
  }
}
