'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithPopup } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db, googleProvider } from '../lib/firebase'

const INSTRUCTION_URL = 'https://docs.google.com/document/d/1Ej6vWrdo5QLnPVkLzMYu0ESNvd-yHpr6QCq79KZP2VY/edit?usp=sharing'
const VIDEO_URL = 'https://drive.google.com/file/d/1ELPMxibpd6Fm9m254UIjp1HoSAnNpJHD/preview'
const CONSENT_FORM_URL = 'https://cornell.ca1.qualtrics.com/jfe/form/SV_afLclmWLfLJL37M'

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
      router.push('/class/public-assistant')
    } catch (e: any) {
      setError(e.message ?? 'Sign in failed')
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center space-y-8">
        <div>
          <h1 className="text-5xl font-semibold tracking-tight max-w-4xl leading-tight">
            Public Assistant Toolkit: Build and Test Civic Discourse Public Assistants
          </h1>
        </div>

        <div className="w-full max-w-xl text-left space-y-6">
          <p className="text-base text-neutral-200">
            Step 1.{' '}
            <a
              href={INSTRUCTION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 text-neutral-100 hover:text-white"
            >
              Read the instructions
            </a>{' '}
            before you begin.
          </p>

          <p className="text-base text-neutral-200">
            Step 2.{' '} 
              Bookmark this page in case you need to come back to it later.
          </p>

          <p className="text-base text-neutral-200">
            Step 3.{' '} Sign in below to develop and submit your public assistants.
          </p>

          <div className="flex flex-col items-start gap-3">
            <button
              onClick={handleSignIn}
              className="px-6 py-3 rounded-lg bg-neutral-100 text-neutral-950 text-sm font-semibold hover:bg-white active:scale-[0.98] transition-all duration-150 cursor-pointer"
            >
              Sign in with Google
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>

          <div className="space-y-3">
            <p className="text-sm text-neutral-300">
              A brief video introducing the toolkit:
            </p>
            <div className="aspect-video rounded-lg border border-neutral-800 bg-neutral-900/50 overflow-hidden">
              <iframe
                src={VIDEO_URL}
                className="w-full h-full"
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-neutral-800 px-8 py-5 text-center text-xs text-neutral-600 space-y-1">
        <p>Public Assistant Toolkit - TrAuSt</p>
        <p>The toolkit builds in part on the ConvoKit and Deliberate Labs open source projects.</p>
      </footer>
    </div>
  )
}
