import {resolveDlApiKey} from '../dl-key'
import {BASE_URL} from '../create-experiment/config'

export async function GET(request: Request) {
  const apiKey = resolveDlApiKey()
  if (!apiKey) return Response.json({ error: 'DL_API_KEY not set' }, { status: 500 })

  const expId = new URL(request.url).searchParams.get('experimentId')
  console.log(`Exporting experiment ${expId}`)
  if (!expId) return Response.json({ error: 'experimentId query param is required' }, { status: 400 })

  const res = await fetch(`${BASE_URL}/experiments/${expId}/export`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })

  const data = await res.json()
  return Response.json(data, { status: res.status })
}
