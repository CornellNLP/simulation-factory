'use client'

import { useCallback, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import { API_BASE } from './config'

// One assistant saved from the Private Assistant toolkit. Only the identity is
// needed here: the Simulation Toolkit lists assistants by name exactly as it
// lists public assistants, so the template body is never read.
export type SavedAssistant = { id: string; name: string }

// The collection the Private Assistant tab writes to. The nav points that tab at
// /assistant, so its library is the one the Pairings editor offers.
const ASSISTANT_COLLECTION = 'assistants-simulation'

/**
 * The user's saved assistants.
 *
 * Assistants live in the same per-user template store the Private Assistant
 * toolkit saves through, so saving one there makes it selectable next to an
 * agent in the Pairings editor. Mirrors `useSavedPublicAssistants`, refresh on focus
 * included, so a save made in another tab lands without a reload.
 */
export function useSavedAssistants() {
  const [assistants, setAssistants] = useState<SavedAssistant[]>([])
  const [signedIn, setSignedIn] = useState(false)

  const refresh = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken()
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/templates?collection=${ASSISTANT_COLLECTION}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setAssistants((data.templates ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })))
    } catch (e) {
      console.warn('useSavedAssistants: listing assistants failed:', e)
    }
  }, [])

  useEffect(() => onAuthStateChanged(auth, user => {
    setSignedIn(!!user)
    if (user) refresh()
    else setAssistants([])
  }), [refresh])

  useEffect(() => {
    if (!signedIn) return
    const handler = () => refresh()
    window.addEventListener('focus', handler)
    return () => window.removeEventListener('focus', handler)
  }, [signedIn, refresh])

  return { assistants, signedIn, refresh }
}
