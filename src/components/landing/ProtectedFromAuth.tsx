import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { ReactElement } from "react";

/** Bounces signed-in users away from the marketing landing. */
export default function ProtectedFromAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/app" replace />;
  return children;
}
