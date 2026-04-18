import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import vizIcon from "../assets/vw1.png";
import vIcon from "../assets/Viz logo_01_w.png";
import indiaFlag from "../assets/india.png";
import usFlag from "../assets/usa.png";
import alertIcon from "../assets/warning.png";
import "../styles/navbar-v2.css";

const TOPBAR_KEY = "vwTopBarClosed";

const SHEET_ID = "180yy7lM0CCtiAtSr87uEm3lewU-pIdvLMGl6RXBvf8o";
const WARNING_GID = "738570445";

const DEFAULT_TOPBAR_TEXT =
  "Make Sure Choose the region closest to you for a seamless experience";

function getInitialShowTopBar() {
  return sessionStorage.getItem(TOPBAR_KEY) !== "1";
}
function parseCSV(text) {
  if (!text) return [];
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field.trim());
        field = "";
      } else if (c === "\n") {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = "";
      } else if (c !== "\r") {
        field += c;
      }
    }
  }

  if (field.length > 0 || inQuotes || row.length) {
    row.push(field.trim());
    rows.push(row);
  }

  return rows;
}

const norm = (s = "") =>
  String(s).toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();

const headerMap = (headers) => {
  const m = {};
  headers.forEach((h, i) => {
    m[norm(h)] = i;
  });
  return m;
};

const idxOf = (headers, keys) => {
  const map = headerMap(headers);
  for (const k of keys) {
    const i = map[norm(k)];
    if (i != null) return i;
  }
  return null;
};

const safeGet = (row, idx, fallback = "") =>
  idx != null && idx < row.length && row[idx] != null
    ? String(row[idx]).trim()
    : fallback;

/* ---------- REGION HELPERS ---------- */
function normalizeRegion(v = "") {
  const s = String(v || "").trim().toLowerCase();
  if (s === "us") return "us";
  return "in";
}

function getRegionFromPath(pathname = "") {
  const parts = pathname.split("/").filter(Boolean);
  const first = (parts[0] || "").toLowerCase();

  if (first === "in" || first === "us") return first;
  return "in";
}

function stripRegionFromPath(pathname = "") {
  const parts = pathname.split("/").filter(Boolean);
  const first = (parts[0] || "").toLowerCase();

  if (first === "in" || first === "us") {
    return "/" + parts.slice(1).join("/");
  }
  return pathname || "/";
}

function buildRegionalPath(region, pathname = "/", search = "", hash = "") {
  const cleanRegion = normalizeRegion(region);
  let basePath = stripRegionFromPath(pathname);

  if (!basePath || basePath === "") basePath = "/";
  if (!basePath.startsWith("/")) basePath = `/${basePath}`;

  const regionalPath =
    basePath === "/"
      ? `/${cleanRegion}`
      : `/${cleanRegion}${basePath}`;

  return `${regionalPath}${search || ""}${hash || ""}`;
}

export default function LandingNavbar({
  user,
  signOut,
  selectedServer = "india",
  setSelectedServer,
}) {
  const [dd, setDd] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileProjectsOpen, setMobileProjectsOpen] = useState(false);
  const [showTopBar, setShowTopBar] = useState(getInitialShowTopBar);
  const [warningData, setWarningData] = useState({
    warningStatus: "",
    warningText: "",
  });

  const ddRef = useRef(null);
  const mobileMenuRef = useRef(null);

  const navigate = useNavigate();
  const location = useLocation();

  const currentRegion = getRegionFromPath(location.pathname);
  const effectiveServer = currentRegion === "us" ? "us" : "india";

  useEffect(() => {
    if (setSelectedServer) {
      setSelectedServer(effectiveServer);
    }
  }, [effectiveServer, setSelectedServer]);

  useEffect(() => {
    const onDown = (e) => {
      if (ddRef.current && !ddRef.current.contains(e.target)) setDd(false);
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target)) {
        const btn = document.querySelector(".vwHamburger");
        if (btn && !btn.contains(e.target)) {
          setMobileMenuOpen(false);
          setMobileProjectsOpen(false);
        }
      }
    };

    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
  const handleBeforeUnload = () => {
    sessionStorage.removeItem(TOPBAR_KEY);
  };

  window.addEventListener("beforeunload", handleBeforeUnload);

  return () => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
  };
}, []);

  useEffect(() => {
    setMobileMenuOpen(false);
    setMobileProjectsOpen(false);
    setDd(false);
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&id=${SHEET_ID}&gid=${WARNING_GID}`;

    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const csv = await res.text();
        const rows = parseCSV(csv);

        if (!rows.length) {
          setWarningData({ warningStatus: "", warningText: "" });
          return;
        }

        const headers = rows[0];
        const body = rows
          .slice(1)
          .filter((r) => r.some((c) => String(c || "").trim() !== ""));

        const iWarning = idxOf(headers, ["warning"]);
        const iWarningText = idxOf(headers, ["warning text", "warning_text"]);

        const warningRow =
          body.find((r) => {
            const status = String(safeGet(r, iWarning, ""))
              .trim()
              .toLowerCase();
            return status === "active";
          }) || null;

        setWarningData({
          warningStatus: warningRow ? safeGet(warningRow, iWarning) : "",
          warningText: warningRow ? safeGet(warningRow, iWarningText) : "",
        });
      } catch (err) {
        console.error("Navbar warning load error:", err);
        setWarningData({ warningStatus: "", warningText: "" });
      }
    })();
  }, []);

  const pathname = stripRegionFromPath(location.pathname || "/");
  const hash = location.hash || "";

  const isHomeActive =
    pathname === "/" && (hash === "" || hash === "#featured-projects");

  const isProjectsActive =
    pathname === "/live-projects" ||
    pathname === "/showcase" ||
    (pathname === "/" && hash === "#featured-projects");

  const isLearnActive = pathname.startsWith("/learn");
  const isDemoActive = pathname.startsWith("/demo-videos");

  const goToRegionPath = (targetPath) => {
    const next = buildRegionalPath(currentRegion, targetPath, "", "");
    navigate(next);
  };

  const goHome = () => {
    setDd(false);
    setMobileMenuOpen(false);
    setMobileProjectsOpen(false);
    navigate(buildRegionalPath(currentRegion, "/", "", ""));
  };

  const changeRegion = (server) => {
    const nextRegion = server === "us" ? "us" : "in";

    if (setSelectedServer) {
      setSelectedServer(server);
    }

    const nextUrl = buildRegionalPath(
      nextRegion,
      location.pathname,
      location.search,
      location.hash
    );

    navigate(nextUrl);
  };

  const isWarningActive =
    String(warningData.warningStatus || "").trim().toLowerCase() === "active" &&
    String(warningData.warningText || "").trim() !== "";

  const topBarText = useMemo(() => {
    if (isWarningActive) return String(warningData.warningText || "").trim();
    return DEFAULT_TOPBAR_TEXT;
  }, [isWarningActive, warningData.warningText]);

  return (
    <>
      <div className="vwNavWrap">
        {showTopBar && (
          <div className={`vwTopBar ${isWarningActive ? "vwTopBarAlert" : ""}`}>
            <div className="vwContainer vwTopBarInner">
              <div className="vwTopBarTextWrap">
                {isWarningActive && (
                  <img
                    src={alertIcon}
                    alt="Alert"
                    className="vwTopBarAlertIcon"
                  />
                )}
                <div className="vwTopBarText">{topBarText}</div>
              </div>

              <button
                type="button"
                className="vwTopBarClose"
                onClick={() => {
                  sessionStorage.setItem(TOPBAR_KEY, "1");
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

        <div className="vwNav">
          <div className="vwContainer vwNavInner">
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

            <div className="vwNavLinks">
              <button
                className={`vwNavLink ${isHomeActive ? "isActive" : ""}`}
                onClick={() => {
                  setDd(false);
                  goToRegionPath("/");
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
                        goToRegionPath("/showcase");
                      }}
                    >
                      Showcase Projects
                    </button>

                    <button
                      className="vwDdItem"
                      onClick={() => {
                        setDd(false);
                        goToRegionPath("/live-projects");
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
                  window.open(
                    buildRegionalPath(currentRegion, "/learn"),
                    "_blank",
                    "noopener,noreferrer"
                  );
                }}
              >
                LEARN
              </button>

              <button
                className={`vwNavLink ${isDemoActive ? "isActive" : ""}`}
                onClick={() => {
                  setDd(false);
                  goToRegionPath("/demo-videos");
                }}
              >
                DEMO VIDEOS
              </button>
            </div>

            <div className="vwNavRight">
              <div className="vwRegionContainer">
                <button
                  className={`vwRegionBtn ${
                    effectiveServer === "india" ? "active" : ""
                  }`}
                  onClick={() => changeRegion("india")}
                  type="button"
                >
                  <img src={indiaFlag} alt="IN" className="vwFlagIcon" />
                  IN
                </button>

                <button
                  className={`vwRegionBtn ${
                    effectiveServer === "us" ? "active" : ""
                  }`}
                  onClick={() => changeRegion("us")}
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

              <button
                type="button"
                className={`vwHamburger ${mobileMenuOpen ? "isOpen" : ""}`}
                aria-label="Open menu"
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen((v) => !v)}
              >
                <span />
                <span />
                <span />
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="vwMobileMenu" ref={mobileMenuRef}>
              <button
                className={`vwMobileLink ${isHomeActive ? "isActive" : ""}`}
                onClick={() => {
                  setMobileMenuOpen(false);
                  goToRegionPath("/");
                }}
              >
                HOME
              </button>

              <div className="vwMobileProjectsWrap">
                <button
                  className={`vwMobileLink ${isProjectsActive ? "isActive" : ""}`}
                  onClick={() => setMobileProjectsOpen((v) => !v)}
                >
                  <span>PROJECTS</span>
                  <span className={`vwMobileCaret ${mobileProjectsOpen ? "isOpen" : ""}`}>
                    ▾
                  </span>
                </button>

                {mobileProjectsOpen && (
                  <div className="vwMobileSubmenu">
                    <button
                      className="vwMobileSubLink"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setMobileProjectsOpen(false);
                        goToRegionPath("/showcase");
                      }}
                    >
                      Showcase Projects
                    </button>

                    <button
                      className="vwMobileSubLink"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setMobileProjectsOpen(false);
                        goToRegionPath("/live-projects");
                      }}
                    >
                      Live Projects
                    </button>
                  </div>
                )}
              </div>

              <button
                className={`vwMobileLink ${isLearnActive ? "isActive" : ""}`}
                onClick={() => {
                  setMobileMenuOpen(false);
                  window.open(
                    buildRegionalPath(currentRegion, "/learn"),
                    "_blank",
                    "noopener,noreferrer"
                  );
                }}
              >
                LEARN
              </button>

              <button
                className={`vwMobileLink ${isDemoActive ? "isActive" : ""}`}
                onClick={() => {
                  setMobileMenuOpen(false);
                  goToRegionPath("/demo-videos");
                }}
              >
                DEMO VIDEOS
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        className="vwHeaderSpacer"
        style={{ height: showTopBar ? "124px" : "76px" }}
      />
    </>
  );
}