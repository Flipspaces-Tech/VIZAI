import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // if (loading) {
  //   return (
  //     <div
  //       style={{
  //         minHeight: "100vh",
  //         display: "grid",
  //         fontSize: "32px",
  //         placeItems: "center",
  //         fontFamily: "system-ui",
  //         background: "#D1D6E2",
  //         color: "rgba(0, 0, 0, 0.85)",
  //       }}
  //     >
  //       Loading…
  //     </div>
  //   );
  // }

  if (loading) return null;

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace state={{ from: location }} />;
  }

  return children;
}
