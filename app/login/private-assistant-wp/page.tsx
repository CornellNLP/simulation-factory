'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithPopup } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db, googleProvider } from '../../lib/firebase'

export default function LandingPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

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
      router.push('/private-assistant-wp')
    } catch (e: any) {
      setError(e.message ?? 'Sign in failed')
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center space-y-8">
        <div>
          <h1 className="text-5xl font-semibold tracking-tight max-w-4xl leading-tight">
            Private Assistant Toolkit - WP: Build and Test
          </h1>
        </div>

        <div className="w-full max-w-xl text-left space-y-6">

            <p>This toolkit is currently in its development phase. Sign in to explore the toolkit!</p>
            <div className="flex flex-col items-start gap-3">
            <button
                onClick={handleSignIn}
                className="px-6 py-3 rounded-lg bg-neutral-100 text-neutral-950 text-sm font-semibold hover:bg-white active:scale-[0.98] transition-all duration-150 cursor-pointer"
            >
                Sign in with Google
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
            </div>

        </div>
      </main>

      <footer className="border-t border-neutral-800 px-8 py-5 text-center text-xs text-neutral-600 space-y-1">
        <p>Assistant WP Toolkit - TrAuSt</p>
        <p>The toolkit builds in part on the ConvoKit and Deliberate Labs open source projects.</p>
      </footer>
    </div>
  )
}
