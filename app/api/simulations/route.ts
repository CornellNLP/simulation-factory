import { adminAuth, adminDb } from '../../lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'

async function verifyEmail(req: Request): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  try {
    const decoded = await adminAuth.verifyIdToken(token)
    return decoded.email!
  } catch (e) {
    // Says why the token was refused (wrong project, expired, emulator…),
    // which the 401 the caller gets does not.
    console.error('verifyIdToken failed:', e)
    return null
  }
}

// GET /api/simulations — list all saved simulations for the user
export async function GET(req: Request) {
  const email = await verifyEmail(req)
  if (!email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const snap = await adminDb
    .collection('toolkitDevelopers').doc(email)
    .collection('simulations')
    .orderBy('updatedAt', 'desc')
    .get()

  const templates = snap.docs.map(d => ({
    id: d.id,
    name: d.data().name as string,
    updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() ?? null,
  }))

  return Response.json({ templates, count: templates.length })
}

// POST /api/simulations — save (create or overwrite) a simulation
export async function POST(req: Request) {
  const email = await verifyEmail(req)
  if (!email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, content } = await req.json().catch(() => ({})) as { name?: string; content?: string }
  if (!name?.trim()) return Response.json({ error: 'name is required' }, { status: 400 })
  if (!content) return Response.json({ error: 'content is required' }, { status: 400 })

  const docId = name.trim().replaceAll('/', '-')
  const ref = adminDb
    .collection('toolkitDevelopers').doc(email)
    .collection('simulations').doc(docId)

  const exists = (await ref.get()).exists

  await ref.set({ name: name.trim(), content, updatedAt: FieldValue.serverTimestamp() })

  return Response.json({ saved: true, overwritten: exists, id: docId })
}

// DELETE /api/simulations?id=... — delete a saved simulation
export async function DELETE(req: Request) {
  const email = await verifyEmail(req)
  if (!email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  await adminDb
    .collection('toolkitDevelopers').doc(email)
    .collection('simulations').doc(id)
    .delete()

  return Response.json({ deleted: true })
}
