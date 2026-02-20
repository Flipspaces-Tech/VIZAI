// src/components/LandingNavbar.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import vizIcon from "../assets/vw1.png";
import vIcon from "../assets/Viz logo_01_w.png";
import "../styles/navbar-v2.css";

import indiaFlag from "../assets/india.png";
import usFlag from "../assets/usa.png";

const TOPBAR_KEY = "vwTopBarClosed";

// ✅ Detect if this page load is a browser refresh/reload
function isReloadNavigation() {
  try {
    const navEntries = performance.getEntriesByType?.("navigation");
    if (navEntries && navEntries.length) {
      return navEntries[0].type === "reload";
    }
    // Fallback (older browsers)
    return performance.navigation?.type === 1;
  } catch {
    return false;
  }
}

function getInitialShowTopBar() {
  // ✅ If user refreshed, show bar again (clear flag)
  if (isReloadNavigation()) {
    sessionStorage.removeItem(TOPBAR_KEY);
    return true;
  }

  // ✅ Otherwise (normal SPA navigation / initial entry), respect closed flag
  return sessionStorage.getItem(TOPBAR_KEY) !== "1";
}

export default function LandingNavbar({
  user,
  signOut,
  selectedServer = "india",
  setSelectedServer,
}) {
  const [dd, setDd] = useState(false);

  // ✅ stays closed on route changes, reappears on refresh
  const [showTopBar, setShowTopBar] = useState(getInitialShowTopBar);

  const ddRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onDown = (e) => {
      if (ddRef.current && !ddRef.current.contains(e.target)) setDd(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // ✅ active link logic
  const pathname = location.pathname || "/";
  const hash = location.hash || "";

  const isHomeActive =
    pathname === "/" && (hash === "" || hash === "#featured-projects");

  const isProjectsActive =
    pathname === "/live-projects" ||
    pathname === "/showcase" ||
    (pathname === "/" && hash === "#featured-projects");

  const isLearnActive = pathname.startsWith("/learn");
  const isDemoActive = pathname.startsWith("/demo-videos");

  const goHome = () => {
    setDd(false);
    navigate("/");
  };

  return (
    <>
      <div className="vwNavWrap">
        {/* Yellow info bar */}
        {showTopBar && (
          <div className="vwTopBar">
            <div className="vwContainer vwTopBarInner">
              <div className="vwTopBarText">
                Make Sure Choose the region closest to you for a seamless
                experience
              </div>

              <button
                type="button"
                className="vwTopBarClose"
                onClick={() => {
                  sessionStorage.setItem(TOPBAR_KEY, "1"); // ✅ persist across SPA route changes
                  setShowTopBar(false);
                }}
                aria-label="Close"
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M1 1L13 13M1 13L13 1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Dark navbar */}
        <div className="vwNav">
          <div className="vwContainer vwNavInner">
            {/* Left: Logo Area */}
            <a
              className="vwLogoGroup"
              href="/"
              onClick={(e) => {
                e.preventDefault();
                goHome();
              }}
            >
              <img className="vwLogoIcon" src={vizIcon} alt="Vizwalk Logo" />
              <div className="vwLogoDivider" />
              <img className="vwIcon" src={vIcon} alt="Vizwalk Logo" />
            </a>

            {/* Center: Links */}
            <div className="vwNavLinks">
              <button
                className={`vwNavLink ${isHomeActive ? "isActive" : ""}`}
                onClick={() => {
                  setDd(false);
                  navigate("/");
                }}
              >
                HOME
              </button>

              <div className="vwDd" ref={ddRef}>
                <button
                  className={`vwNavLink ${isProjectsActive ? "isActive" : ""}`}
                  onClick={() => setDd((v) => !v)}
                >
                  PROJECTS ▾
                </button>

                {dd && (
                  <div className="vwDdMenu">
                    <button
                      className="vwDdItem"
                      onClick={() => {
                        setDd(false);
                        navigate("/showcase");
                      }}
                    >
                      Showcase Projects
                    </button>

                    <button
                      className="vwDdItem"
                      onClick={() => {
                        setDd(false);
                        navigate("/live-projects");
                      }}
                    >
                      Live Projects
                    </button>
                  </div>
                )}
              </div>

              <button
                className={`vwNavLink ${isLearnActive ? "isActive" : ""}`}
                onClick={() => {
                  setDd(false);
                  navigate("/learn");
                }}
              >
                LEARN
              </button>

              <button
                className={`vwNavLink ${isDemoActive ? "isActive" : ""}`}
                onClick={() => {
                  setDd(false);
                  navigate("/demo-videos");
                }}
              >
                DEMO VIDEOS
              </button>
            </div>

            {/* Right: Controls */}
            <div className="vwNavRight">
              <div className="vwRegionContainer">
                <button
                  className={`vwRegionBtn ${
                    selectedServer === "india" ? "active" : ""
                  }`}
                  onClick={() => setSelectedServer?.("india")}
                  type="button"
                >
                  <img src={indiaFlag} alt="IN" className="vwFlagIcon" />
                  IN
                </button>

                <button
                  className={`vwRegionBtn ${
                    selectedServer === "us" ? "active" : ""
                  }`}
                  onClick={() => setSelectedServer?.("us")}
                  type="button"
                >
                  <img src={usFlag} alt="US" className="vwFlagIcon" />
                  US
                </button>
              </div>

              <button
                className="vwIconBtn"
                title={user?.email || "Logout"}
                onClick={signOut}
                type="button"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        className="vwHeaderSpacer"
        style={{ height: showTopBar ? "124px" : "76px" }}
      />
    </>
  );
}