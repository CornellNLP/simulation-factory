// Check - is there a better way of doing this???
const CONVOKIT_SERVICE_URL = process.env.CONVOKIT_SERVICE_URL ?? 'http://127.0.0.1:8080'

export async function POST(req: Request) {
  const bodyText = await req.text() // the experiment export JSON, forwarded as-is
  try {
    const r = await fetch(`${CONVOKIT_SERVICE_URL}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyText,
    })
    if (!r.ok) {
      return Response.json({ error: `convokit service failed: ${await r.text()}` }, { status: r.status })
    }
    
    // return Response.json(await r.json())

    return new Response(r.body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="convokit-corpus.zip"',
      },
    })
    
  } catch (e) {
    return Response.json({ error: `convokit service unreachable: ${String(e)}` }, { status: 502 })
  }
}
