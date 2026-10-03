import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)
  initializeApp({ credential: cert(serviceAccount) })
  // const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  // initializeApp(serviceAccount ? { credential: cert(JSON.parse(serviceAccount)) } : {})
}

export const adminDb = getFirestore()
export const adminAuth = getAuth()
