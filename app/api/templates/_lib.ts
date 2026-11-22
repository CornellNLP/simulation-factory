import { adminAuth, adminDb } from '../../lib/firebaseAdmin'

export const ALLOWED_COLLECTIONS = ['mediators', 'mediators-covert', 'assistants', 'assistants-reddit'] as const
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
