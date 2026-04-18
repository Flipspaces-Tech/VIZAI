// Showcase.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import LandingNavbar from "../components/LandingNavbar.jsx";
import Footer from "../components/Footer.jsx";
import { useAuth } from "../auth/AuthProvider";
import { useVideoModal } from "../context/VideoModalContext";

import yt1 from "../assets/yt1.png";
import vz1 from "../assets/vz1.png";
import searchIcon from "../assets/search.png";
import demoIcon from "../assets/view demo.png";
import arrowPng from "../assets/Redirect Arrow.png";

import indiaIcon from "../assets/india.png";
import usIcon from "../assets/usa.png";

import "../pages/Landing.css";

/** ====== SHEET (CSV) ====== */
const SHEET_ID = "180yy7lM0CCtiAtSr87uEm3lewU-pIdvLMGl6RXBvf8o";
const GID = "1024074012";

function getRegionFromPath(pathname = "") {
  const parts = pathname.split("/").filter(Boolean);
  const first = (parts[0] || "").toLowerCase();
  return first === "us" ? "us" : "in";
}

/** ====== CSV PARSER ====== */
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
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field.trim());
        field = "";
      } else if (c === "\n") {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = "";
      } else if (c !== "\r") field += c;
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
  headers.forEach((h, i) => (m[norm(h)] = i));
  return m;
};

const safeGet = (row, idx, fallback = "") =>
  idx != null && idx < row.length && row[idx] != null
    ? String(row[idx]).trim()
    : fallback;

const COLS = {
  status: ["status"],
  server: ["server", "region", "country"],
  buildName: ["build name"],
  buildVersion: ["build version"],
  projectName: ["project slot name"],
  sbu: ["sbu"],
  areaSqft: ["area(sqft)", "area sqft", "area"],
  industry: ["industry"],
  designStyle: ["design style", "style"],
  vizdomId: ["vizdom project id", "vizdom id"],
  image: [
    "thumbnail_url",
    "image_url",
    "image url",
    "thumbnail_url ",
    "thumbnail",
    "image",
    "thumb",
  ],
  youtube: ["walkthrough link", "youtube link", "youtube"],
  constructionType: ["construction type"],
  demoLink: ["demo link", "demo", "demo url", "demo_url"],
};

const idxOf = (headers, keys) => {
  const map = headerMap(headers);
  for (const k of keys) {
    const i = map[norm(k)];
    if (i != null) return i;
  }
  return null;
};

function formatSqft(n = "") {
  const s = String(n).replace(/,/g, "").trim();
  const val = Number(s);
  if (Number.isFinite(val) && val > 0) return `${val.toLocaleString()} sqft`;
  return n || "";
}

function normalizeServer(v = "") {
  const s = norm(v);
  if (s.includes("us")) return "us";
  if (s.includes("india") || s === "in") return "india";
  return "";
}

/** ====== IMAGE WITH FALLBACK ====== */
function ImageWithFallback({ src, alt, style, className }) {
  const isDrive = /drive\.google\.com/i.test(src || "");

  const extractDriveId = (url = "") => {
    if (!url) return "";
    const m1 = url.match(/\/d\/([^/]+)\//);
    const m2 = url.match(/[?&]id=([^&]+)/);
    return m1?.[1] || m2?.[1] || "";
  };

  const id = isDrive ? extractDriveId(src) : "";

  const candidates =
    isDrive && id
      ? [
          `https://lh3.googleusercontent.com/d/${id}=w1400-h900-no`,
          `https://drive.google.com/uc?export=view&id=${id}`,
          `https://drive.google.com/thumbnail?id=${id}&sz=w1400-h900`,
          src,
        ]
      : [src || ""];

  const [idx, setIdx] = useState(0);
  const onError = () =>
    setIdx((i) => (i < candidates.length - 1 ? i + 1 : -1));

  if (!src || idx === -1) {
    return (
      <img
        className={className}
        src="https://picsum.photos/seed/vizwalk/1400/900"
        alt={alt || "preview"}
        style={style}
        loading="lazy"
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
      />
    );
  }

  const bust = Date.now();
  const current = candidates[idx]
    ? `${candidates[idx]}${candidates[idx].includes("?") ? "&" : "?"}cb=${bust}`
    : "";

  return (
    <img
      className={className}
      src={current}
      alt={alt || "preview"}
      style={style}
      loading="lazy"
      onError={onError}
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
    />
  );
}

/** ====== FEATURED CARD ====== */
function FeaturedCard({
  item,
  onOpenScreenshotGallery,
  onOpenVizdom,
  onOpenYoutube,
  onOpenDemo,
}) {
  const hasYoutube = Boolean(String(item.youtube || "").trim());
  const hasVizdom = Boolean(String(item.vizdomId || "").trim());
  const hasDemo = Boolean(String(item.demoLink || "").trim());

  const openDemo = (e) => {
    e.stopPropagation();
    onOpenDemo?.(item);
  };

  const openYoutube = (e) => {
    e.stopPropagation();
    onOpenYoutube?.(item);
  };

  return (
    <article className="fpProjectCard">
      <div className="fpCardMedia">
        <ImageWithFallback
          className="fpCardImg"
          src={item.thumb}
          alt={item.buildName}
        />

        <button
          className="fpViewPill"
          onClick={(e) => {
            e.stopPropagation();
            onOpenScreenshotGallery(item);
          }}
          type="button"
        >
          View Project
          <img
            className="fpViewPillArrow"
            src={arrowPng}
            alt=""
            aria-hidden="true"
          />
        </button>
      </div>

      <div className="fpCardDetails">
        <h3 className="fpProjectName">{item.buildName || "Project"}</h3>

        <p className="fpProjectMeta">
          {(item.constructionType || item.industry || "—")} |{" "}
          {formatSqft(item.areaSqft || "")}
        </p>

        <div className="fpCardFooter">
          {hasYoutube ? (
            <button
              className="fpFooterSquare"
              onClick={openYoutube}
              type="button"
              aria-label="Open YouTube"
            >
              <img src={yt1} alt="" className="fpFooterSquareImg fpYtImg" />
            </button>
          ) : null}

          {hasVizdom ? (
            <button
              className="fpFooterSquare"
              onClick={(e) => {
                e.stopPropagation();
                onOpenVizdom(item);
              }}
              type="button"
              aria-label="Open Vizdom"
            >
              <img src={vz1} alt="" className="fpFooterSquareImg" />
            </button>
          ) : null}

          {hasDemo ? (
            <button className="fpFooterDemoBtn" onClick={openDemo} type="button">
              <img src={demoIcon} alt="" className="fpDemoIcon" />
              <span>View Demo</span>
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/** ====== SHOWCASE PAGE ====== */
export default function Showcase() {
  const { user, signOut } = useAuth();
  const { openVideo } = useVideoModal();
  const location = useLocation();
  const currentRegion = getRegionFromPath(location.pathname);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedServer, setSelectedServer] = useState(
    currentRegion === "us" ? "us" : "india"
  );
  const [activeCategory2, setActiveCategory2] = useState("All");
  const [searchQuery2, setSearchQuery2] = useState("");

  useEffect(() => {
    setSelectedServer(currentRegion === "us" ? "us" : "india");
  }, [currentRegion]);

  useEffect(() => {
    setActiveCategory2("All");
    setSearchQuery2("");
  }, [selectedServer]);

  useEffect(() => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&id=${SHEET_ID}&gid=${GID}`;

    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const csv = await res.text();
        const rows = parseCSV(csv);
        if (!rows.length) throw new Error("Empty CSV");

        const headers = rows[0];
        const body = rows
          .slice(1)
          .filter((r) => r.some((c) => String(c || "").trim() !== ""));

        const iStatus = idxOf(headers, COLS.status);
        const iServer = idxOf(headers, COLS.server);
        const iSBU = idxOf(headers, COLS.sbu);
        const iProjectName = idxOf(headers, COLS.projectName);
        const iBuildName = idxOf(headers, COLS.buildName);
        const iBuildVersion = idxOf(headers, COLS.buildVersion);
        const iAreaSqft = idxOf(headers, COLS.areaSqft);
        const iIndustry = idxOf(headers, COLS.industry);
        const iDesignStyle = idxOf(headers, COLS.designStyle);
        const iImage = idxOf(headers, COLS.image);
        const iYouTube = idxOf(headers, COLS.youtube);
        const iVizdomId = idxOf(headers, COLS.vizdomId);
        const iConstructionType = idxOf(headers, COLS.constructionType);
        const iDemoLink = idxOf(headers, COLS.demoLink);

        const data = body
          .map((r) => {
            const status = norm(safeGet(r, iStatus, "Active"));
            if (status !== "active") return null;

            const serverRaw = safeGet(r, iServer);
            const server = normalizeServer(serverRaw);

            return {
              server,
              sbu: safeGet(r, iSBU),
              projectName: safeGet(r, iProjectName),
              buildName: safeGet(r, iBuildName),
              buildVersion: safeGet(r, iBuildVersion),
              areaSqft: safeGet(r, iAreaSqft),
              industry: safeGet(r, iIndustry),
              designStyle: safeGet(r, iDesignStyle),
              thumb: safeGet(r, iImage),
              youtube: safeGet(r, iYouTube),
              vizdomId: safeGet(r, iVizdomId),
              constructionType: safeGet(r, iConstructionType),
              demoLink: safeGet(r, iDemoLink),
            };
          })
          .filter(Boolean);

        setItems(data);
      } catch (e) {
        console.error("Sheet load error:", e);
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const typeOptions = useMemo(() => {
    const set = new Set(["All"]);
    items.forEach((it) => {
      const t = String(it.constructionType || "").trim();
      if (t) set.add(t);
    });
    return Array.from(set);
  }, [items]);

  const filtered = useMemo(() => {
    const q = norm(searchQuery2);

    return items.filter((it) => {
      if (selectedServer && it.server && it.server !== selectedServer) return false;
      if (selectedServer && !it.server) return false;

      if (activeCategory2 !== "All") {
        const typeOk = String(it.constructionType || "").trim() === activeCategory2;
        if (!typeOk) return false;
      }

      if (!q) return true;
      const big = `${it.projectName} ${it.buildName} ${it.buildVersion} ${it.areaSqft} ${it.industry} ${it.designStyle} ${it.sbu}`;
      return norm(big).includes(q);
    });
  }, [items, selectedServer, activeCategory2, searchQuery2]);

  const handleOpenScreenshotGallery = (item) => {
    sessionStorage.setItem(
      "SG_BACK_URL",
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    );

    const params = new URLSearchParams({
      build: item.buildName || item.projectName || "Build",
      ver: item.buildVersion || "",
      gid: String(GID),
    });

    window.location.assign(`/${currentRegion}/gallery?${params.toString()}`);
  };

  const handleOpenVizdom = (item) => {
    const id = String(item?.vizdomId || "").trim();
    if (!id) return;
    const url = `https://vizdom.flipspaces.app/user/project/${encodeURIComponent(id)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleOpenYoutube = (item) => {
    openVideo(
      item.youtube,
      item.buildName || item.projectName || "Project Walkthrough",
      "Offline-ready project walkthrough",
      { type: "youtube" }
    );
  };

  const handleOpenDemo = (item) => {
    openVideo(
      item.demoLink,
      item.buildName || item.projectName || "Project Demo",
      "Offline-ready project Demo",
      { type: "demo" }
    );
  };

  return (
    <div style={sx.page}>
      <LandingNavbar
        user={user}
        signOut={signOut}
        selectedServer={selectedServer}
        setSelectedServer={setSelectedServer}
      />

      <section className="fpSection">
        <div className="fpContainer">
          <div className="fpHeader">
            <div className="fpHeaderLeft">
              <div className="fpTitleRow">
                <div className="fpTitle">Featured Projects</div>

                <div className="fpServerBadge">
                  <img
                    src={selectedServer === "india" ? indiaIcon : usIcon}
                    alt=""
                    className="fpServerBadgeIcon"
                  />
                  <span className="fpServerBadgeText">
                    {selectedServer === "india" ? "India Server" : "US Server"}
                  </span>
                </div>
              </div>

              <div className="fpSub">
                Explore our projects showcasing tech-enabled interior design expertise
              </div>
            </div>
          </div>

          <div className="fpControls">
            <div className="dv-chips fpChips">
              {typeOptions.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`dv-chip ${t === activeCategory2 ? "dv-chip--active" : ""}`}
                  onClick={() => setActiveCategory2(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="fpSearchWrap">
              <img
                src={searchIcon}
                alt="Search"
                className="fpSearchIconImg"
                draggable={false}
              />
              <input
                value={searchQuery2}
                onChange={(e) => setSearchQuery2(e.target.value)}
                placeholder="Search Projects.."
                className="fpSearchInput"
              />
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 24 }}>Loading…</div>
          ) : (
            <>
              <div className="fpGrid">
                {filtered.map((item, idx) => (
                  <FeaturedCard
                    key={`${item.buildName || "p"}-${item.buildVersion || ""}-${idx}`}
                    item={item}
                    onOpenScreenshotGallery={handleOpenScreenshotGallery}
                    onOpenVizdom={handleOpenVizdom}
                    onOpenYoutube={handleOpenYoutube}
                    onOpenDemo={handleOpenDemo}
                  />
                ))}
              </div>

              {filtered.length === 0 && (
                <div className="fpEmpty">No projects found matching your criteria.</div>
              )}
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

const sx = {
  page: {
    minHeight: "100vh",
    background: "#ffffff",
    color: "#141414",
    fontFamily: "var(--font-sans)",
  },
};