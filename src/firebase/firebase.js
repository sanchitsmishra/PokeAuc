import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCTwN7-bX_6bDBK0GxILyBeAvhBmuTTUJY",
  authDomain: "pokebid-69fe3.firebaseapp.com",
  projectId: "pokebid-69fe3",
  storageBucket: "pokebid-69fe3.firebasestorage.app",
  messagingSenderId: "810280845693",
  appId: "1:810280845693:web:bd56035ee08c1570158c14",
  measurementId: "G-94CY5E4RM0"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export default app;