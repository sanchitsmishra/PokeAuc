import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { signInWithPopup } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "../firebase/firebase";

function Login({ user, userProfile, loading }) {
  const [error, setError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4">
        <p className="text-sm text-slate-300">Loading...</p>
      </main>
    );
  }

  if (user && userProfile) {
    return <Navigate to="/" replace />;
  }

  if (user && !userProfile) {
    return <Navigate to="/username-setup" replace />;
  }

  const loginWithGoogle = async () => {
    try {
      setError("");
      setIsSigningIn(true);

      const result = await signInWithPopup(auth, googleProvider);
      const userRef = doc(db, "users", result.user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists() && userSnap.data().username) {
        const redirectPath = location.state?.from?.pathname || "/";
        navigate(redirectPath, { replace: true });
      } else {
        navigate("/username-setup", { replace: true });
      }
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-black via-neutral-950 to-black px-4 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-[#2A75BB]/55 bg-neutral-900 p-6 shadow-xl shadow-[#2A75BB]/25">
        <h1 className="text-4xl font-black tracking-wide text-[#FFCB05] [text-shadow:0_0_8px_rgba(255,203,5,0.65),2px_2px_0_rgba(42,117,187,0.9)]">
          Poke<span className="text-[#7fc2ff]">Auc</span>
        </h1>
        <p className="mt-3 text-sm text-slate-300">
          Sign in with Google to continue to Auction Room.
        </p>

        <button
          type="button"
          onClick={loginWithGoogle}
          disabled={isSigningIn}
          className="mt-6 w-full rounded-md bg-[#FFCB05] px-4 py-3 font-semibold text-black shadow-md shadow-[#FFCB05]/30 transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-yellow-200"
        >
          {isSigningIn ? "Signing in..." : "Continue with Google"}
        </button>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      </section>
    </main>
  );
}

export default Login;
