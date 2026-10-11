import { initializeApp, getApps } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries


// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
 apiKey: "YOUR_API_KEY",
 authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
 databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
 projectId: "YOUR_PROJECT_ID",
 storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
 messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
 appId: "YOUR_APP_ID",
 measurementId: "YOUR_MEASUREMENT_ID"
};


const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()
