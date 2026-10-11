import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { firebaseConfig } from './firebase'

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)
  // A service account from another project rejects every sign-in with a 401,
  // so fail loudly at startup instead.
  if (serviceAccount.project_id !== firebaseConfig.projectId) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT is for "${serviceAccount.project_id}" but app/lib/firebase.ts is for "${firebaseConfig.projectId}". ` +
        `Check for a stale 'export FIREBASE_SERVICE_ACCOUNT' in your shell, or update .env.`,
    )
  }
  initializeApp({ credential: cert(serviceAccount) })
  // const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  // initializeApp(serviceAccount ? { credential: cert(JSON.parse(serviceAccount)) } : {})
}

export const adminDb = getFirestore()
export const adminAuth = getAuth()
