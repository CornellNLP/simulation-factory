import { FieldValue } from 'firebase-admin/firestore'
import { isAllowedCollection, templatesRef, verifyEmail } from '../_lib'

const PAST_RUNS_LIMIT = 20 // keep only the most recent 20 runs, this also aligns with our daily tests per day

export async function GET(req: Request) {
  const email = await verifyEmail(req)
  if (!email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const collection = new URL(req.url).searchParams.get('collection')
  if (!isAllowedCollection(collection)) return Response.json({ error: 'invalid collection' }, { status: 400 })

  const templates = await templatesRef(email, collection).get()
  const runsByTemplate = await Promise.all(templates.docs.map(async t => {
    const snap = await t.ref.collection('runs').orderBy('createdAt', 'desc').limit(PAST_RUNS_LIMIT).get()
    return snap.docs.map(d => ({
      id: d.id,
      mediatorId: t.id,
      mediatorName: t.data().name as string,
      detection: d.data().detection as number,
      movement: d.data().movement as number,
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
      content: (d.data().content as string | undefined) ?? null,
    }))
  }))
  const runs = runsByTemplate.flat().sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, PAST_RUNS_LIMIT)

  return Response.json({ runs })
}

export async function POST(req: Request) {
  const email = await verifyEmail(req)
  if (!email) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { collection, id, experimentId, content, detection, movement, flagged, total } = await req.json().catch(() => ({})) as {
    collection?: string; id?: string; experimentId?: string; content?: string; detection?: number; movement?: number; flagged?: number; total?: number
  }
  if (!isAllowedCollection(collection)) return Response.json({ error: 'invalid collection' }, { status: 400 })
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })
  if (!Number.isFinite(detection) || !Number.isFinite(movement)) {
    return Response.json({ error: 'detection and movement are required' }, { status: 400 })
  }

  const docRef = templatesRef(email, collection).doc(id)
  if (!(await docRef.get()).exists) return Response.json({ error: 'Not found' }, { status: 404 })

  const runRef = await docRef.collection('runs').add({
    experimentId: experimentId ?? null,
    content: content ?? null,
    detection,
    movement,
    flagged: flagged ?? null,
    total: total ?? null,
    createdAt: FieldValue.serverTimestamp(),
  })

  const templates = await templatesRef(email, collection).get()
  const allRuns = (await Promise.all(templates.docs.map(t => t.ref.collection('runs').get()))).flatMap(s => s.docs)
  const oldRuns = allRuns.sort((a, b) => b.data().createdAt.toMillis() - a.data().createdAt.toMillis()).slice(PAST_RUNS_LIMIT)
  await Promise.all(oldRuns.map(d => d.ref.delete()))

  return Response.json({ id: runRef.id }, { status: 201 })
}
