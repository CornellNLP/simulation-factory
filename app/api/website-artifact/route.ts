import fs from 'fs'
import path from 'path'
import { generate } from '../create-experiment/generator'

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' }

// randomize over the same 2 topics create-experiment uses for development
const TOPICS = ['congestion_pricing', 'covenant_marriage']

export async function POST() {
  try {
    const chosen = TOPICS[Math.floor(Math.random() * TOPICS.length)]
    const experimentTemplatePath = path.join(process.cwd(), 'public', 'templates', 'topics', chosen, 'experiment.yaml')
    const mediatorTemplate = fs.readFileSync(path.join(process.cwd(), 'public', 'templates', 'artifact', 'mediator.yaml'), 'utf8')

    const result = await generate('participant-1', 'participant-2', experimentTemplatePath, mediatorTemplate, 'human-agent')
    return Response.json(result, { headers: CORS_HEADERS })
  } catch (e) {
    console.error('Error in website-artifact:', e)
    return Response.json({ error: String(e) }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS_HEADERS, 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
  })
}
