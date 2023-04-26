import { Navigate, Outlet } from "react-router-dom";

import { useUser } from "../../contexts/AuthContext";
import LoadingPage from "../LoadingPage";

export default function RequireAuth() {
  const [user, loading] = useUser();
  const isLoggedIn = user !== null;

  if (loading) return <LoadingPage />;
  if (!isLoggedIn) return <Navigate to="/login" />;
  return <Outlet />;
}
