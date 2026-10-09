'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { onAuthStateChanged, signInWithPopup, type User } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db, googleProvider } from '../lib/firebase'

// Pages `?next=` may send a signed-in user to: the Nav's tabs, plus the Reddit
// and WP assistant pages, which have no tab.
const TOOLKITS = [
  '/simulation',
  '/public-assistant',
  '/agent-participant',
  '/private-assistant',
  '/private-assistant-reddit',
  '/private-assistant-wp',
] as const

// `?next=` may only name one of the toolkits, so the link cannot be used to
// send someone off-site after they sign in.
function nextToolkit(next: string | null) {
  return TOOLKITS.find(t => t === next) ?? null
}

function LoginContent() {
  const router = useRouter()
  const next = nextToolkit(useSearchParams().get('next'))
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => onAuthStateChanged(auth, u => {
    setUser(u)
    setAuthReady(true)
  }), [])

  // Signed-in users skip the picker and land on the simulation tab, or on the
  // page that sent them here.
  useEffect(() => {
    if (user) router.replace(next ?? '/simulation')
  }, [user, next, router])

  async function handleSignIn() {
    setError(null)
    try {
      const result = await signInWithPopup(auth, googleProvider)
      const email = result.user.email!
      const ref = doc(db, 'toolkitDevelopers', email)
      const snap = await getDoc(ref)
      if (!snap.exists()) {
        await setDoc(ref, { email, createdAt: new Date().toISOString() })
      }
    } catch (e: any) {
      setError(e.message ?? 'Sign in failed')
    }
  }

  if (!authReady || user) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-500 text-sm">
      Loading...
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-8 py-12 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight">Simulation Toolkit</h1>
          <p className="text-base text-neutral-500 max-w-2xl">
            Generates diverse simulated conversations with a high degree of control over participants, scenarios, and interaction dynamics for development, evaluation, and auditing.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleSignIn}
            className="px-6 py-3 rounded-lg bg-neutral-100 text-neutral-950 text-sm font-semibold hover:bg-white active:scale-[0.98] transition-all duration-150 cursor-pointer"
          >
            Sign in with Google
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </main>

      <footer className="border-t border-neutral-800 px-8 py-5 text-center text-xs text-neutral-600 space-y-1">
        <p>Toolkit - TrAuSt</p>
        <p>The toolkit builds in part on the ConvoKit and Deliberate Labs open source projects.</p>
      </footer>
    </div>
  )
}

// useSearchParams needs a Suspense boundary for the page to prerender.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
