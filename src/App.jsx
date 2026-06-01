import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import Home from "./pages/Home";
import Login from "./pages/Login";
import UsernameSetup from "./pages/UsernameSetup";
import ProtectedRoute from "./components/ProtectedRoute";
import { auth, db } from "./firebase/firebase";

function App() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        setUserProfile(null);
        setLoading(false);
        return;
      }

      try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists() && userSnap.data().username) {
          const profile = userSnap.data();

          if (profile.credits === undefined) {
            await updateDoc(userRef, {
              credits: 360
            });
            profile.credits = 360;
          }

          setUserProfile(profile);
        } else {
          setUserProfile(null);
        }
      } catch (error) {
        console.error("Could not load user profile:", error);
        setUserProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <Routes>
      <Route
        path="/login"
        element={<Login user={user} userProfile={userProfile} loading={loading} />}
      />
      <Route
        path="/username-setup"
        element={
          <UsernameSetup
            user={user}
            userProfile={userProfile}
            loading={loading}
            setUserProfile={setUserProfile}
          />
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute user={user} userProfile={userProfile} loading={loading}>
            <Home user={user} userProfile={userProfile} />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
