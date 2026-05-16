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
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-slate-600">Loading...</p>
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
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="w-full max-w-md rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Login</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in with Google to continue to Auction Room.
        </p>

        <button
          type="button"
          onClick={loginWithGoogle}
          disabled={isSigningIn}
          className="mt-6 w-full rounded-md bg-slate-900 px-4 py-3 font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isSigningIn ? "Signing in..." : "Continue with Google"}
        </button>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </section>
    </main>
  );
}

export default Login;
