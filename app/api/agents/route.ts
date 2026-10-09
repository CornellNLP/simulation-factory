import { adminAuth, adminDb } from '../../lib/firebaseAdmin'
import { FieldValue } from 'firebase-admin/firestore'

async function verifyEmail(req: Request): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  try {
    const decoded = await adminAuth.verifyIdToken(token)
    return decoded.email!
  } catch {
    return null
  }
}

// GET /api/agents — list the user's saved agent participants
//
// Unlike simulations and public assistants these are small enough to hand back whole,
// so there is no separate /load route: the agent toolkit needs every prompt to
// render its library, and the simulation toolkit only reads the names.
export async function GET(req: Request) {
  const email = await verifyEmail(req)
  if (!email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const snap = await adminDb
    .collection('toolkitDevelopers').doc(email)
    .collection('agents')
    .orderBy('updatedAt', 'desc')
    .get()

  const agents = snap.docs.map(d => ({
    id: d.id,
    name: d.data().name as string,
    content: d.data().content as string,
    updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() ?? null,
  }))

  return Response.json({ agents, count: agents.length })
}

// POST /api/agents — save (create or overwrite) an agent participant
export async function POST(req: Request) {
  const email = await verifyEmail(req)
  if (!email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, content } = await req.json().catch(() => ({})) as { name?: string; content?: string }
  if (!name?.trim()) return Response.json({ error: 'name is required' }, { status: 400 })
  if (!content) return Response.json({ error: 'content is required' }, { status: 400 })

  const docId = name.trim().replaceAll('/', '-')
  const ref = adminDb
    .collection('toolkitDevelopers').doc(email)
    .collection('agents').doc(docId)

  const exists = (await ref.get()).exists

  await ref.set({ name: name.trim(), content, updatedAt: FieldValue.serverTimestamp() })

  return Response.json({ saved: true, overwritten: exists, id: docId })
}

// DELETE /api/agents?id=... — delete a saved agent participant
export async function DELETE(req: Request) {
  const email = await verifyEmail(req)
  if (!email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  await adminDb
    .collection('toolkitDevelopers').doc(email)
    .collection('agents').doc(id)
    .delete()

  return Response.json({ deleted: true })
}
