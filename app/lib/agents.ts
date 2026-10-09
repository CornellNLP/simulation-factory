'use client'

import { useCallback, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import { API_BASE } from './config'
import type { PromptItem } from '../components/StructuredPromptEditor'

// One agent participant saved from the Agent Participants toolkit. The id is the
// Firestore document id, which is derived from the name — saving under a name
// that already exists overwrites it, matching the public assistant and simulation
// toolkits.
export type SavedAgent = {
  id: string
  name: string
  description: string
  prompt: PromptItem[]
  order: number
  addTo: string | null
}

// What actually lives in the document body; the name is stored alongside it.
type AgentContent = Omit<SavedAgent, 'id' | 'name'>

function parseAgent(id: string, name: string, content: string): SavedAgent {
  let body: Partial<AgentContent> = {}
  try { body = JSON.parse(content) } catch { /* keep the defaults below */ }
  return {
    id,
    name,
    description: String(body.description ?? ''),
    prompt: Array.isArray(body.prompt) ? body.prompt : [],
    order: Number(body.order) || 1,
    addTo: body.addTo ?? null,
  }
}

/**
 * The user's saved agent participants.
 *
 * The Agent Participants toolkit reads and writes this library; the Simulation
 * Toolkit reads it to fill the agent options of the Pairings editor, so an agent
 * saved in one shows up in the other. Refreshed on focus so a save made in
 * another tab lands without a reload.
 */
export function useSavedAgents() {
  const [agents, setAgents] = useState<SavedAgent[]>([])
  const [signedIn, setSignedIn] = useState(false)

  const refresh = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken()
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/agents`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      setAgents((data.agents ?? []).map((a: { id: string; name: string; content: string }) =>
        parseAgent(a.id, a.name, a.content)))
    } catch (e) {
      console.warn('useSavedAgents: listing agents failed:', e)
    }
  }, [])

  const saveAgent = useCallback(async (agent: Omit<SavedAgent, 'id'>) => {
    const token = await auth.currentUser?.getIdToken()
    if (!token) return false
    const { name, ...body } = agent
    const res = await fetch(`${API_BASE}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, content: JSON.stringify(body) }),
    })
    if (res.ok) await refresh()
    return res.ok
  }, [refresh])

  const deleteAgent = useCallback(async (id: string) => {
    const token = await auth.currentUser?.getIdToken()
    if (!token) return false
    const res = await fetch(`${API_BASE}/api/agents?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) await refresh()
    return res.ok
  }, [refresh])

  useEffect(() => onAuthStateChanged(auth, user => {
    setSignedIn(!!user)
    if (user) refresh()
    else setAgents([])
  }), [refresh])

  useEffect(() => {
    if (!signedIn) return
    const handler = () => refresh()
    window.addEventListener('focus', handler)
    return () => window.removeEventListener('focus', handler)
  }, [signedIn, refresh])

  return { agents, signedIn, refresh, saveAgent, deleteAgent }
}
