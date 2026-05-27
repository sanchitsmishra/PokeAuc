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
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-slate-600">Loading...</p>
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
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="w-full max-w-md rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Choose Username</h1>
        <p className="mt-2 text-sm text-slate-600">
          This name will be saved with your account.
        </p>

        <form onSubmit={saveUsername} className="mt-6">
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            className="w-full rounded-md border border-slate-300 px-3 py-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          />

          <button
            type="submit"
            disabled={isSaving}
            className="mt-4 w-full rounded-md bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {isSaving ? "Saving..." : "Save Username"}
          </button>
        </form>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </section>
    </main>
  );
}

export default UsernameSetup;
