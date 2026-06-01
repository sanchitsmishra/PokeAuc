import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase/firebase";

function UsernameSetup({ user, userProfile, loading, setUserProfile }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4">
        <p className="text-sm text-slate-300">Loading...</p>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (userProfile) {
    return <Navigate to="/" replace />;
  }

  const saveUsername = async (event) => {
    event.preventDefault();

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setError("Please enter a username.");
      return;
    }

    try {
      setError("");
      setIsSaving(true);

      const profile = {
        userId: user.uid,
        username: cleanUsername,
        email: user.email || "",
        credits: 360,
        photoURL: user.photoURL || ""
      };

      await setDoc(doc(db, "users", user.uid), profile);
      setUserProfile(profile);
      navigate("/", { replace: true });
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-black via-neutral-950 to-black px-4 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-[#2A75BB]/55 bg-neutral-900 p-6 shadow-xl shadow-[#2A75BB]/25">
        <h1 className="text-4xl font-black tracking-wide text-[#FFCB05] [text-shadow:0_0_8px_rgba(255,203,5,0.65),2px_2px_0_rgba(42,117,187,0.9)]">
          Poke<span className="text-[#7fc2ff]">Auc</span>
        </h1>
        <p className="mt-3 text-sm text-slate-300">
          This name will be saved with your account.
        </p>

        <form onSubmit={saveUsername} className="mt-6">
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            className="w-full rounded-md border border-[#2A75BB]/45 bg-black px-3 py-3 text-slate-100 outline-none transition focus:border-[#2A75BB] focus:ring-2 focus:ring-[#2A75BB]/35"
          />

          <button
            type="submit"
            disabled={isSaving}
            className="mt-4 w-full rounded-md bg-[#FFCB05] px-4 py-3 font-semibold text-black shadow-md shadow-[#FFCB05]/30 transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-yellow-200"
          >
            {isSaving ? "Saving..." : "Save Username"}
          </button>
        </form>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      </section>
    </main>
  );
}

export default UsernameSetup;
