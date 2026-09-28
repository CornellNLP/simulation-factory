'use client'

import { auth } from './firebase'

// Unsaved edits are parked in sessionStorage so they survive switching between
// toolkit pages (and reloads) in the same tab without having to click Save.
// Keyed per signed-in user so a shared browser never hands one person's draft
// to another. Storage can be unavailable (private mode, blocked site data), in
// which case drafts simply don't persist.

function draftKey(scope: string): string | null {
  const email = auth.currentUser?.email
  return email ? `draft:${scope}:${email}` : null
}

export function readDraft<T>(scope: string): T | null {
  const key = draftKey(scope)
  if (!key) return null
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeDraft<T>(scope: string, value: T) {
  const key = draftKey(scope)
  if (!key) return
  try { sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
}
