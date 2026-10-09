import { initializeApp, getApps } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries


// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
 apiKey: "AIzaSyCJ8Tg39Q7e7765GEC_QtjeuUs9U1pHgsI",
 authDomain: "traust-491612.firebaseapp.com",
 databaseURL: "https://traust-491612-default-rtdb.firebaseio.com",
 projectId: "traust-491612",
 storageBucket: "traust-491612.firebasestorage.app",
 messagingSenderId: "982548588385",
 appId: "1:982548588385:web:ddca77bbcf01ea8c184720",
 measurementId: "G-GMHWWLDEBL"
};


const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()
