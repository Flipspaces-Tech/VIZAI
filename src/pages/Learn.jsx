import React from "react";
import LandingNavbar from "../components/LandingNavbar.jsx";
import { useAuth } from "../auth/AuthProvider";
import LearnControls from "../components/LearnControls.jsx";
import "../styles/learn-controls.css";

export default function Learn() {
  const { user, signOut } = useAuth();

  return (
    <div style={{ minHeight: "100vh", background: "#f6f6f4" }}>
      <LandingNavbar user={user} signOut={signOut} />
      <div style={{ width: "min(1180px, 92vw)", margin: "0 auto"}}>
        <LearnControls />
      </div>
    </div>
  );
}
