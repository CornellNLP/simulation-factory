import { initializeApp, getApps } from 'firebase/app'
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
 apiKey: "AIzaSyCfyqzBXPAdeaWrRzHVaUzjHl_0HumzhCo",
 authDomain: "convoarenadev.firebaseapp.com",
 databaseURL: "https://convoarenadev-default-rtdb.firebaseio.com",
 projectId: "convoarenadev",
 storageBucket: "convoarenadev.firebasestorage.app",
 messagingSenderId: "634368617031",
 appId: "1:634368617031:web:341548305229f049845f62",
 measurementId: "G-WJ3VZHHEF4"
};


const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()

// Fast Refresh re-runs this module without resetting the underlying Auth/
// Firestore instances, and connecting an already-connected emulator throws —
// only connect on the app's first real initialization.
if (useEmulators && !alreadyInitialized) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}
