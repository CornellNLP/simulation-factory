import { adminAuth, adminDb } from '../../lib/firebaseAdmin'
import { competitionQuotaFields, isCompetitionTask } from '@/app/lib/competitionQuota'

export async function GET(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let email: string
  try {
    const decoded = await adminAuth.verifyIdToken(token)
    email = decoded.email!
  } catch {
    return Response.json({ error: 'Invalid token' }, { status: 401 })
  }

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
  const [userSnap, configSnap] = await Promise.all([
    adminDb.collection('toolkitDevelopers').doc(email).get(),
    adminDb.collection('toolkit').doc('config').get(),
  ])

  const configData = configSnap.data() ?? {}
  const simMaxWaitTimeMs: number = configData.simMaxWaitTimeMs ?? 300000
  const userData = userSnap.data() ?? {}

  const taskParam = new URL(req.url).searchParams.get('task')
  const { countField, dateField, limit } = isCompetitionTask(taskParam)
    ? competitionQuotaFields(configData, taskParam)
    : { countField: 'dailySimCount', dateField: 'simCountDate', limit: (configData.dailySimLimit as number | undefined) ?? 30 }
  const used: number = userData[dateField] === today ? (userData[countField] ?? 0) : 0

  return Response.json({ used, limit, simMaxWaitTimeMs })
}
