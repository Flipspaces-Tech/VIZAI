import React, { useEffect, useMemo, useState } from "react";
import LandingNavbar from "../components/LandingNavbar.jsx";
import Footer from "../components/Footer.jsx";
import { useAuth } from "../auth/AuthProvider";
import { useVideoModal } from "../context/VideoModalContext";

// Assets
import ytIcon from "../assets/yt1.png";
import searchIcon from "../assets/search.png";
import indiaIcon from "../assets/india.png";
import vizwalkIcon from "../assets/vz1.png";
import demoIcon from "../assets/view demo.png";
import openArrowPng from "../assets/Redirect Arrow.png";

import "../styles/demo-videos.css";

const WEBAPP_URL =
  "https://script.google.com/macros/s/AKfycbxcVqr7exlAGvAVSh672rB_oG7FdL0W0ymkRb_6L7A8awu7gqYDInR_6FLczLNkpr0B/exec";
const SHEET_ID = "180yy7lM0CCtiAtSr87uEm3lewU-pIdvLMGl6RXBvf8o";
const TAB_NAME = "Demo Videos Page";

/* --- Robust Drive Helpers --- */
function extractDriveFileId(url = "") {
  const s = String(url || "").trim();
  if (!s) return null;
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /thumbnail\?id=([a-zA-Z0-9_-]+)/,
    /lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.usercontent\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/,
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

function isProbablyDriveId(x) {
  const s = String(x || "").trim();
  return /^[a-zA-Z0-9_-]{20,}$/.test(s);
}

function getDriveImageCandidates(urlOrId = "") {
  if (!urlOrId) return ["https://picsum.photos/seed/viz/1400/900"];
  const raw = String(urlOrId).trim();
  const extracted = extractDriveFileId(raw);
  const id = extracted || (isProbablyDriveId(raw) ? raw : null);
  if (!id) return [raw];
  return [
    `https://lh3.googleusercontent.com/d/${id}=w1400`,
    `https://drive.usercontent.google.com/uc?id=${id}&export=view`,
    `https://drive.google.com/thumbnail?id=${id}&sz=w1400`,
    `https://drive.google.com/uc?export=view&id=${id}`,
  ];
}

function ImageWithFallback({ src, alt, className }) {
  const candidates = useMemo(() => getDriveImageCandidates(src), [src]);
  const [idx, setIdx] = useState(0);

  useEffect(() => setIdx(0), [src, candidates.length]);

  const finalSrc =
    candidates[idx] || "https://picsum.photos/seed/vizwalk/1400/900";

  return (
    <img
      className={className}
      src={finalSrc}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (idx < candidates.length - 1) setIdx(idx + 1);
      }}
    />
  );
}

export default function DemoVideos() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState("All");
  const [query, setQuery] = useState("");
  const [selectedServer, setSelectedServer] = useState("india");

  const { user, signOut } = useAuth();
  const { openVideo } = useVideoModal();

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const u = new URL(WEBAPP_URL);
        u.searchParams.set("action", "demovideos");
        u.searchParams.set("sheetId", SHEET_ID);
        u.searchParams.set("tab", TAB_NAME);
        const res = await fetch(u.toString());
        const data = await res.json();
        setRows(Array.isArray(data?.rows) ? data.rows : []);
      } catch (e) {
        console.error("Fetch error:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const openScreenshotGallery = (row) => {
    sessionStorage.setItem(
      "SG_BACK_URL",
      window.location.pathname + window.location.search
    );

    const params = new URLSearchParams({
      build: row.videoName || row.buildName || "Build",
      ver: row.buildVersion || row.ver || "",
    });

    window.location.assign(`/gallery?${params.toString()}`);
  };

  const typeOptions = useMemo(() => {
    const set = new Set(["All"]);
    rows.forEach((r) => {
      const val = r.constructionType || r.industry;
      if (val) set.add(String(val).trim());
    });
    return Array.from(set);
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return rows.filter((r) => {
      const typeOk =
        activeType === "All" ||
        r.constructionType === activeType ||
        r.industry === activeType;

      const match =
        !q ||
        [r.videoName, r.constructionType, r.industry].some((s) =>
          String(s || "").toLowerCase().includes(q)
        );

      return typeOk && match;
    });
  }, [rows, activeType, query]);

  const openYoutubeVideo = (row) => {
    const ytUrl = row.youtubeUrl || row.youtube;
    if (!ytUrl) return;

    openVideo(
      ytUrl,
      row.videoName || row.buildName || "Project Walkthrough",
      "Offline-ready project walkthrough",
      { type: "youtube" }
    );
  };

  const openDemoVideo = (row) => {
    const demoUrl = row.vizwalkDemoUrl || row.walkthrough_link;
    if (!demoUrl) return;

    openVideo(
      demoUrl,
      row.videoName || row.buildName || "Project Demo",
      "Offline-ready project Demo",
      { type: "demo" }
    );
  };

  const openPrimaryVideo = (row) => {
    const ytUrl = row.youtubeUrl || row.youtube;
    const demoUrl = row.vizwalkDemoUrl || row.walkthrough_link;

    if (ytUrl) {
      openYoutubeVideo(row);
      return;
    }

    if (demoUrl) {
      openDemoVideo(row);
    }
  };

  return (
    <div className="dv-page-container">
      <LandingNavbar
        user={user}
        signOut={signOut}
        selectedServer={selectedServer}
        setSelectedServer={setSelectedServer}
      />

      <main className="dv-main-content">
        <header className="dv-header-top">
          <div className="dv-header-left">
            <div className="dv-title-row">
              <h1 className="dv-heading">Walkthrough Videos</h1>

              {/* <div className="dv-badge-server">
                <img src={indiaIcon} alt="IN" />
                <span>India Server</span>
              </div> */}
            </div>

            <p className="dv-description">
              Explore our premium architectural visualizations and immersive 3D
              walkthroughs
            </p>
          </div>
        </header>

        <section className="dv-filter-bar">
          <div className="dv-filter-chips">
            {typeOptions.map((t) => (
              <button
                key={t}
                className={`dv-type-chip ${t === activeType ? "active" : ""}`}
                onClick={() => setActiveType(t)}
                type="button"
              >
                {t}
              </button>
            ))}
          </div>

          <div className="dv-search-box">
            <img src={searchIcon} alt="" className="dv-search-icon-img" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Projects..."
            />
          </div>
        </section>

        {loading ? (
          <div className="dv-loader-container">
            <div className="dv-loader-ring"></div>
          </div>
        ) : (
          <div className="dv-projects-grid">
            {filtered.map((r, idx) => {
              const thumb =
                r.thumbnailUrl || r.image_url || r.thumbnail || r.image || "";
              const demoUrl = r.vizwalkDemoUrl || r.walkthrough_link;
              const ytUrl = r.youtubeUrl || r.youtube;

              return (
                <article className="dv-project-card" key={idx}>
                  <div
                    className="dv-card-media"
                    onClick={() => openPrimaryVideo(r)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openPrimaryVideo(r);
                      }
                    }}
                  >
                    <ImageWithFallback
                      className="dv-card-img"
                      src={thumb}
                      alt={r.videoName || "Project"}
                    />

                    {(ytUrl || demoUrl) && (
                      <button
                        className="dvPlayBtn"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPrimaryVideo(r);
                        }}
                        type="button"
                      >
                        <span className="dvPlayTri" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <div className="dv-card-details">
                    <div className="dv-sliding-content">
                      <h3 className="dv-project-name">
                        {r.videoName || r.buildName || "Project Name"}
                      </h3>
                      <p className="dv-project-meta">
                        {r.constructionType || r.industry || "Design"} |{" "}
                        {r.areaSqft
                          ? `${String(r.areaSqft).replace(/,/g, "")} Sqft`
                          : "—"}
                      </p>

                      <div className="dv-card-footer">
                        {ytUrl && (
                          <button
                            className="dv-footerSquare"
                            onClick={() => openYoutubeVideo(r)}
                            type="button"
                          >
                            <img
                              src={ytIcon}
                              alt=""
                              className="dv-footerSquareImg dv-ytImg"
                            />
                          </button>
                        )}

                        
                        {demoUrl && (
                          <button
                            className="dv-footerDemoBtn"
                            onClick={() => openDemoVideo(r)}
                            type="button"
                          >
                            <img src={demoIcon} alt="" className="dv-demoIcon" />
                            <span>View Demo</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* <button
                      className="dvGalleryArrowBtn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openScreenshotGallery(r);
                      }}
                    >
                      <img src={openArrowPng} alt="Open Gallery" />
                    </button> */}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="dv-no-results">No projects found.</div>
        )}
      </main>

      <Footer />
    </div>
  );
}