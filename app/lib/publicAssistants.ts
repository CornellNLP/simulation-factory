'use client'

import { useCallback, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import { API_BASE } from './config'

// One public assistant saved from the Public Assistant Toolkit. Only the identity is needed
// here: the Simulation Toolkit lists public assistants by name exactly as it lists
// agent participants, so the template body is never read.
export type SavedPublicAssistant = { id: string; name: string }

/**
 * The user's saved public assistants.
 *
 * Public Assistants live in the same per-user template store the Public Assistant Toolkit saves
 * through, so saving one there makes it selectable in the Pairings editor.
 * Mirrors `useSavedAgents`, refresh on focus included, so a save made in another
 * tab lands without a reload.
 */
export function useSavedPublicAssistants() {
  const [publicAssistants, setPublicAssistants] = useState<SavedPublicAssistant[]>([])
  const [signedIn, setSignedIn] = useState(false)

  const refresh = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken()
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/templates?collection=mediators`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setPublicAssistants((data.templates ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })))
    } catch (e) {
      console.warn('useSavedPublicAssistants: listing public assistants failed:', e)
    }
  }, [])

  useEffect(() => onAuthStateChanged(auth, user => {
    setSignedIn(!!user)
    if (user) refresh()
    else setPublicAssistants([])
  }), [refresh])

  useEffect(() => {
    if (!signedIn) return
    const handler = () => refresh()
    window.addEventListener('focus', handler)
    return () => window.removeEventListener('focus', handler)
  }, [signedIn, refresh])

  return { publicAssistants, signedIn, refresh }
}
