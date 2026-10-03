'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db, googleProvider } from '../lib/firebase'

// The toolkits a signed-in user can open: the Nav's tabs, plus the Reddit and
// WP assistant pages, which have no tab and are only reached from here.
const TOOLKITS = [
  { href: '/simulation', label: 'Simulation', description: 'Pair agents, mediators and assistants, then create or simulate conversations.' },
  { href: '/mediator', label: 'Mediator', description: 'Build and test mediator prompts.' },
  { href: '/agent-participant', label: 'Agent Participant', description: 'Design the agents that take part in a conversation.' },
  { href: '/assistant', label: 'Agent Assistant', description: 'Build assistants that privately help a participant, tested against a simulation.' },
  { href: '/assistant-reddit', label: 'Agent Assistant - Reddit', description: 'Assistants for ChangeMyView-style Reddit threads.' },
  { href: '/assistant-wp', label: 'Agent Assistant - WP', description: 'Assistants for Wikipedia article discussions.' },
] as const

// `?next=` may only name one of the toolkits, so the link cannot be used to
// send someone off-site after they sign in.
function nextToolkit(next: string | null) {
  return TOOLKITS.find(t => t.href === next)?.href ?? null
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
      if (next) router.push(next)
    } catch (e: any) {
      setError(e.message ?? 'Sign in failed')
    }
  }

  if (!authReady) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-500 text-sm">
      Loading...
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-8 py-12 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight">Simulation Toolkit</h1>
          <p className="text-base text-neutral-500">
            {user ? 'Choose a toolkit to open.' : 'Sign in to explore the toolkit.'}
          </p>
        </div>

        {user ? (
          <div className="w-full max-w-2xl space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {TOOLKITS.map(t => (
                <Link
                  key={t.href}
                  href={t.href}
                  className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-4 space-y-1 hover:border-neutral-600 hover:bg-neutral-800/60 transition-colors"
                >
                  <p className="text-base font-medium text-neutral-100">{t.label}</p>
                  <p className="text-sm text-neutral-500">{t.description}</p>
                </Link>
              ))}
            </div>
            <div className="flex items-center justify-center gap-3 text-sm">
              <span className="text-neutral-400">{user.email}</span>
              <button
                onClick={() => signOut(auth)}
                className="px-3 py-1.5 rounded-md border border-neutral-600 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={handleSignIn}
              className="px-6 py-3 rounded-lg bg-neutral-100 text-neutral-950 text-sm font-semibold hover:bg-white active:scale-[0.98] transition-all duration-150 cursor-pointer"
            >
              Sign in with Google
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        )}
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
