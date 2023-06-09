import { Navigate, Outlet } from "react-router-dom";

import LoadingPage from "@src/components/LoadingPage";
import { useUser } from "@src/contexts/AuthContext";

export default function Layout() {
  const [user, loading] = useUser();
  const isLoggedIn = user !== null;

  if (loading) return <LoadingPage />;
  if (!isLoggedIn) return <Navigate to="/login" replace={true} />;
  return <Outlet />;
}
