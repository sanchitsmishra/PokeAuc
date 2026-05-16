import { Navigate, useLocation } from "react-router-dom";

function ProtectedRoute({ user, userProfile, loading, children }) {
  const location = useLocation();

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-slate-600">Loading...</p>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!userProfile) {
    return <Navigate to="/username-setup" replace />;
  }

  return children;
}

export default ProtectedRoute;
