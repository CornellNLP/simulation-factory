'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'

// A save that runs before the Nav switches tabs. It resolves true when there
// was nothing to save or the save went through, false when it failed.
type LeaveSave = () => Promise<boolean>

const saves = new Set<{ current: LeaveSave }>()

// Registers `save` to run whenever the user leaves this page through the Nav.
// The latest closure is always the one called, so it sees current state.
export function useSaveOnLeave(save: LeaveSave) {
  const ref = useRef(save)
  useLayoutEffect(() => { ref.current = save })
  useEffect(() => {
    saves.add(ref)
    return () => { saves.delete(ref) }
  }, [])
}

// Runs every registered save and reports whether all of them succeeded.
export async function runLeaveSaves(): Promise<boolean> {
  const results = await Promise.all(
    [...saves].map(s => s.current().catch(() => false)),
  )
  return results.every(Boolean)
}

// Saves `delay` ms after `value` stops changing, as long as `shouldSave` holds.
// Pass the in-flight save as part of `shouldSave` so edits made during a save
// get their own save once it finishes.
export function useAutoSave(
  value: unknown,
  shouldSave: boolean,
  save: () => Promise<unknown>,
  delay = 2500,
) {
  const ref = useRef(save)
  useLayoutEffect(() => { ref.current = save })
  useEffect(() => {
    if (!shouldSave) return
    const timer = setTimeout(() => { ref.current() }, delay)
    return () => clearTimeout(timer)
  }, [value, shouldSave, delay])
}
