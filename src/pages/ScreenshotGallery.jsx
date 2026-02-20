// src/pages/ScreenshotGallery.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import "../styles/screenshot-gallery.css";

import placeholderImg from "../assets/Flipspace - Logo - Black.png";
import backIcon from "../assets/back.png"; // ✅ your back icon

import LandingNavbar from "../components/LandingNavbar.jsx";
import Footer from "../components/Footer.jsx";
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";

import downloadIcon from "../assets/download.png";
import ytIcon from "../assets/yt1.png";
import demoIcon from "../assets/view demo.png";
import vizwalkIcon from "../assets/Viz logo.png";
import openIcon from "../assets/a1.png";
import maximizeIcon from "../assets/full-screen.png";

// ✅ Use your in-house server icons
import indiaIcon from "../assets/india.png";
import usIcon from "../assets/usa.png";

import downloadAllIcon from "../assets/download.png"; // ✅ change to your local icon file
import calendarIcon from "../assets/calendar.png"; // ✅ change filename to your actual icon
import refreshIcon from "../assets/refresh.png";

const GDRIVE_API_URL =
  "https://script.google.com/macros/s/AKfycbxcVqr7exlAGvAVSh672rB_oG7FdL0W0ymkRb_6L7A8awu7gqYDInR_6FLczLNkpr0B/exec";
const SHEET_ID = "180yy7lM0CCtiAtSr87uEm3lewU-pIdvLMGl6RXBvf8o";
const DEFAULT_GID = "1024074012"; // Featured Projects fallback

function getQuery(key, def = "") {
  const u = new URL(window.location.href);
  return u.searchParams.get(key) || def;
}

const GID = getQuery("gid", DEFAULT_GID); // ✅ uses the right sheet gid

function parseCSV(text) {
  if (!text) return [];
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [],
    field = "",
    inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
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
  String(s || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const headerMap = (headers) => {
  const m = {};
  (headers || []).forEach((h, i) => (m[norm(h)] = i));
  return m;
};

const safeGet = (row, idx, fallback = "") =>
  idx != null && idx < row.length && row[idx] != null
    ? String(row[idx]).trim()
    : fallback;

const COLS = {
  status: ["status"],
  server: ["server"],
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
    "Thumbnail_URL",
    "image_url",
    "image url",
    "thumbnail",
    "image",
    "thumb",
  ],
  youtube: ["walkthrough link", "youtube link", "youtube"],
  demo: ["demo link", "demo", "demo video link"],
};

const idxOf = (headers, keys) => {
  const map = headerMap(headers);
  for (const k of keys) {
    const i = map[norm(k)];
    if (i != null) return i;
  }
  return null;
};

function normalizeServer(v = "") {
  const s = String(v || "").trim().toLowerCase();
  if (s.startsWith("us") || s.includes("united")) return "us";
  if (s.startsWith("in") || s.includes("india")) return "india";
  return "india";
}

function formatSqft(n = "") {
  const s = String(n).replace(/,/g, "").trim();
  const val = Number(s);
  if (Number.isFinite(val) && val > 0) return `${val.toLocaleString()} sqft`;
  return n || "";
}

function prettyDate(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "Date";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mn = String(d.getMinutes()).padStart(2, "0");
  const wk = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  return `${dd}/${mm} ${wk} ${hh}:${mn}`;
}

/** ====== IMAGE (Drive fallback) ====== */
function ImageWithFallback({ src, alt, className, cacheBustKey = "" }) {
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
          `https://lh3.googleusercontent.com/d/${id}=w1600-h1000-no`,
          `https://drive.google.com/uc?export=view&id=${id}`,
          `https://drive.google.com/thumbnail?id=${id}&sz=w1600-h1000`,
          src,
        ]
      : [src || ""];

  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [src, cacheBustKey]);

  const onError = () => setIdx((i) => (i < candidates.length - 1 ? i + 1 : -1));

  if (!src || idx === -1) {
    return (
      <img
        src={placeholderImg}
        alt={alt || "preview"}
        className={className}
        loading="lazy"
      />
    );
  }

  const currentBase = candidates[idx] || "";
  const current = currentBase
    ? `${currentBase}${currentBase.includes("?") ? "&" : "?"}cb=${cacheBustKey || ""}`
    : "";

  return (
    <img
      src={current}
      alt={alt || "preview"}
      className={className}
      loading="lazy"
      onError={onError}
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
    />
  );
}

const TABS = [{ key: "screenshots", label: "Screenshots", disabled: false }];

/** ====== MERGE keep old add new ====== */
function mergeGroups(prev = [], next = []) {
  const map = new Map((prev || []).map((g) => [g.group || g.ts || "", g]));

  for (const ng of next || []) {
    const key = ng.group || ng.ts || "";
    const pg = map.get(key);

    if (!pg) {
      map.set(key, ng);
      continue;
    }

    const seen = new Set((pg.items || []).map((it) => it.id));
    const mergedItems = [...(pg.items || [])];

    for (const it of ng.items || []) {
      if (it?.id && !seen.has(it.id)) {
        mergedItems.push(it);
        seen.add(it.id);
      }
    }

    mergedItems.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
    map.set(key, { ...pg, ...ng, items: mergedItems });
  }

  const merged = Array.from(map.values());
  merged.sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
  return merged;
}

export default function ScreenshotGallery() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("screenshots");
  const { user, signOut } = useAuth();

  const [loadingHeader, setLoadingHeader] = useState(true);
  const [headerItem, setHeaderItem] = useState(null);

  const [screenshotsGroups, setScreenshotsGroups] = useState([]);
  const [initialLoadingShots, setInitialLoadingShots] = useState(false);
  const [isRefreshingShots, setIsRefreshingShots] = useState(false);

  // ✅ only changes when you click Refresh (so images don’t “flash” every render)
  const [refreshKey, setRefreshKey] = useState(String(Date.now()));

  /** ====== QUERY PARAMS ====== */
  const buildQuery = getQuery("build", "Build");
  const verQuery = getQuery("ver", "");
  const thumbQuery = getQuery("thumb", "");
  const serverQuery = normalizeServer(getQuery("server", "india"));
  const catQuery = getQuery("cat", "Corporate Design");
  const areaQuery = getQuery("area", "");

  /** ====== DERIVED BUILD KEY ====== */
  const buildName = headerItem?.buildName || buildQuery;
  const version = headerItem?.buildVersion || verQuery || "";
  const buildBase = (buildName || "").trim();
  const buildKey = version ? `${buildBase} ${version}` : buildBase;

  /** ====== HEADER DATA ====== */
  useEffect(() => {
    (async () => {
      setLoadingHeader(true);
      try {
        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&id=${SHEET_ID}&gid=${GID}`;
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
        const iDemo = idxOf(headers, COLS.demo);
        const iVizdomId = idxOf(headers, COLS.vizdomId);

        const items = body
          .map((r) => {
            const status = norm(safeGet(r, iStatus, "Active"));
            if (status !== "active") return null;
            return {
              server: normalizeServer(safeGet(r, iServer, "")),
              sbu: safeGet(r, iSBU),
              projectName: safeGet(r, iProjectName),
              buildName: safeGet(r, iBuildName),
              buildVersion: safeGet(r, iBuildVersion),
              areaSqft: safeGet(r, iAreaSqft),
              industry: safeGet(r, iIndustry),
              designStyle: safeGet(r, iDesignStyle),
              thumb: safeGet(r, iImage),
              youtube: safeGet(r, iYouTube),
              demo: safeGet(r, iDemo),
              vizdomId: safeGet(r, iVizdomId),
            };
          })
          .filter(Boolean);

        const qBuild = norm(buildQuery);
        const qVer = norm(verQuery);

        let match = null;
        if (qVer) {
          match =
            items.find(
              (x) =>
                (norm(x.buildName) === qBuild || norm(x.projectName) === qBuild) &&
                norm(x.buildVersion || "") === qVer
            ) ||
            items.find((x) => norm(x.buildName) === qBuild) ||
            items.find((x) => norm(x.projectName) === qBuild) ||
            items[0];
        } else {
          match =
            items.find((x) => norm(x.buildName) === qBuild) ||
            items.find((x) => norm(x.projectName) === qBuild) ||
            items[0];
        }

        setHeaderItem(match || null);
      } catch (err) {
        console.error(err);
        setHeaderItem(null);
      } finally {
        setLoadingHeader(false);
      }
    })();
  }, [buildQuery, verQuery, GID]);

  const hasAnyScreenshots = useMemo(
    () => (screenshotsGroups || []).some((g) => (g?.items || []).length > 0),
    [screenshotsGroups]
  );

  /** ====== SCREENSHOTS FETCH (SAFE) ====== */
  const fetchScreenshots = useCallback(
    async ({ background = false } = {}) => {
      if (!buildKey) return;

      if (!background) setInitialLoadingShots(!hasAnyScreenshots);
      if (background) setIsRefreshingShots(true);

      try {
        const url = new URL(GDRIVE_API_URL);
        url.searchParams.set("action", "listscreenshots");
        url.searchParams.set("build", buildKey);

        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = await res.json();

        if (json?.ok) {
          setScreenshotsGroups((prev) => mergeGroups(prev, json.groups || []));
        } else {
          console.warn("listscreenshots error", json);
          if (!background && !hasAnyScreenshots) setScreenshotsGroups([]);
        }
      } catch (err) {
        console.error("listscreenshots fetch error", err);
        if (!background && !hasAnyScreenshots) setScreenshotsGroups([]);
      } finally {
        setInitialLoadingShots(false);
        setIsRefreshingShots(false);
      }
    },
    [buildKey, hasAnyScreenshots]
  );

  useEffect(() => {
    fetchScreenshots({ background: false });
  }, [fetchScreenshots]);

  // Auto-refresh every 5s in background
  useEffect(() => {
    const interval = setInterval(() => fetchScreenshots({ background: true }), 5000);
    return () => clearInterval(interval);
  }, [fetchScreenshots]);

  /** ====== ACTIONS ====== */
  const openImage = (url) => {
    if (!url) return;
    window.location.assign(url); // ✅ same tab
  };

  const dl = (url) => {
    if (!url) return;
    const downloadUrl = url.replace("export=view", "export=download");
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = downloadUrl;
    document.body.appendChild(iframe);
    setTimeout(() => document.body.removeChild(iframe), 60000);
  };

  // ✅ Vizdom (external) same tab
  const handleOpenVizdom = () => {
    const id = String(headerItem?.vizdomId || "").trim();
    if (!id) return;
    const url = `https://vizdom.flipspaces.app/user/project/${encodeURIComponent(id)}`;
    window.location.assign(url);
  };

  const openVizwalk = () => {
    if (!headerItem) return;

    const bust = Date.now();
    const projectLabel = headerItem.projectName || headerItem.buildName || "project";
    const sessionId = `${projectLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().replace(/[:.]/g, "-")}`;

    const id = projectLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // forward gid to Experience
    const gidFromUrl = getQuery("gid", DEFAULT_GID);

    const params = new URLSearchParams({
      project: id,
      s: bust,
      session: sessionId,
      build: headerItem.buildName || headerItem.projectName || "Build",
      ver: headerItem.buildVersion || "",
      gid: String(gidFromUrl),
    });

    window.open(`/experience?${params.toString()}`, "_blank", "noopener,noreferrer");
    // navigate(`/experience?${params.toString()}`);
  };

  const handleRefresh = async () => {
    setRefreshKey(String(Date.now()));
    await fetchScreenshots({ background: true });
  };

  const category = headerItem?.designStyle || headerItem?.industry || catQuery;
  const server = headerItem?.server || serverQuery;
  const serverLabel = server === "us" ? "US Server" : "India Server";
  const areaDisplay = headerItem?.areaSqft
    ? formatSqft(headerItem.areaSqft)
    : areaQuery
    ? formatSqft(areaQuery)
    : "";

  const heroImg = thumbQuery || headerItem?.thumb || "";

  return (
    <div className="sg-page">
      <LandingNavbar user={user} signOut={signOut} />

      <div className="sg-container">
        {/* ✅ Back: uses stored back url if available, else fallback */}
        <button
          className="sg-back"
          type="button"
          onClick={() => {
            const backUrl = sessionStorage.getItem("SG_BACK_URL");

            if (backUrl) {
              window.location.assign(backUrl); // ✅ guaranteed
              return;
            }

            if (window.history.state && window.history.state.idx > 0) {
              navigate(-1);
              return;
            }

            navigate("/projects");
          }}
        >
          <img className="sg-backIcon" src={backIcon} alt="" />
          <span>Back to Projects</span>
        </button>

        <div className="sg-topGrid">
          <div className="sg-left">
            {loadingHeader ? (
              <div className="sg-loading">Loading…</div>
            ) : (
              <>
                <div className="sg-titleRow">
                  <h1 className="sg-title">{buildName || "Project"}</h1>

                  <button
                    className="sg-vizdomBtn"
                    type="button"
                    onClick={handleOpenVizdom}
                    disabled={!headerItem?.vizdomId}
                    title={!headerItem?.vizdomId ? "Vizdom ID missing in sheet" : ""}
                  >
                    Go to Vizdom
                    <img className="sg-vizdomIcon" src={openIcon} alt="" />
                  </button>
                </div>

                <div className="sg-chips sg-chips-figma">
                  <div className="sg-subText">
                    <span>{category}</span>
                    <span className="sg-subSep">|</span>
                    <span>{areaDisplay || "—"}</span>
                  </div>

                  <div className="sg-serverPill">
                    <img
                      className="sg-flagImg"
                      src={server === "us" ? usIcon : indiaIcon}
                      alt={server === "us" ? "US" : "IN"}
                    />
                    {serverLabel}
                  </div>
                </div>

                <div className="sg-actions">
                  <button
                    type="button"
                    className="sg-action"
                    disabled={!headerItem?.youtube}
                    onClick={() =>
                      headerItem?.youtube && window.location.assign(headerItem.youtube)
                    }
                  >
                    <span className="sg-actionIconWrap">
                      <img className="sg-actionIcon" src={ytIcon} alt="" />
                    </span>
                    <span className="sg-actionText">
                      <span className="sg-actionTitle">Walkthrough Video</span>
                      <span className="sg-actionSub">
                        A visual Showcase walkthorugh Video for the project
                      </span>
                    </span>
                  </button>

                  {headerItem?.demo ? (
                    <button
                      type="button"
                      className="sg-action"
                      onClick={() => window.location.assign(headerItem.demo)}
                    >
                      <span className="sg-actionIconWrap">
                        <img className="sg-actionIcon" src={demoIcon} alt="" />
                      </span>
                      <span className="sg-actionText">
                        <span className="sg-actionTitle">Demo Video</span>
                        <span className="sg-actionSub">
                          A Tech showcase video for the project
                        </span>
                      </span>
                    </button>
                  ) : null}

                  <button type="button" className="sg-action" onClick={openVizwalk}>
                    <span className="sg-actionIconWrap">
                      <img className="sg-actionIcon" src={vizwalkIcon} alt="" />
                    </span>
                    <span className="sg-actionText">
                      <span className="sg-actionTitle">Open Vizwalk</span>
                      <span className="sg-actionSub">View VizWalk in Action</span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="sg-hero">
            <ImageWithFallback
              src={heroImg}
              alt={buildName}
              className="sg-heroImg"
              cacheBustKey={refreshKey}
            />
          </div>
        </div>

        <div className="sg-panel">
          <div className="sg-panelTop">
            <div className="sg-tabs">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`sg-tab ${activeTab === t.key ? "isActive" : ""}`}
                  disabled={t.disabled}
                  onClick={() => !t.disabled && setActiveTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="sg-refreshWrap">
              <button
                className={`sg-refresh ${isRefreshingShots ? "isRefreshing" : ""}`}
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshingShots}
              >
                <img
                  src={refreshIcon}
                  alt=""
                  className={`sg-refreshIcon ${isRefreshingShots ? "spin" : ""}`}
                  aria-hidden="true"
                />
                <span>{isRefreshingShots ? "Refreshing" : "Refresh"}</span>
              </button>
            </div>
          </div>

          <div className="sg-panelBody">
            {!hasAnyScreenshots && initialLoadingShots ? (
              <div className="sg-empty">Loading screenshots…</div>
            ) : !hasAnyScreenshots ? (
              <div className="sg-empty">No screenshots available yet</div>
            ) : (
              <div className="sg-groups">
                {screenshotsGroups.map((group, idx) => {
                  const items = group.items || [];
                  if (!items.length) return null;

                  return (
                    <div className="sg-group" key={group.group || idx}>
                      <div className="sg-groupHeader">
                        <div className="sg-groupLeft">
                          <img className="sg-calIcon" src={calendarIcon} alt="" aria-hidden="true" />
                          <span className="sg-date">
                            {prettyDate(group.ts || group.group)}
                          </span>
                          <span className="sg-count">
                            {items.length} {items.length === 1 ? "image" : "images"}
                          </span>
                        </div>

                        <button
                          type="button"
                          className="sg-downloadAll"
                          onClick={() => items.forEach((img) => dl(img.url))}
                        >
                          <img className="sg-downloadAllIcon" src={downloadAllIcon} alt="" />
                          Download All
                        </button>
                      </div>

                      <div className="sg-grid">
                        {items.map((img, i) => (
                          <div
                            key={(img.id || img.url || "") + i}
                            className="sg-shot"
                            onClick={() => openImage(img.url)}
                            role="button"
                            tabIndex={0}
                          >
                            <ImageWithFallback
                              src={img.url}
                              alt="Screenshot"
                              className="sg-shotImg"
                              cacheBustKey={refreshKey}
                            />

                            <div className="sg-shotActions">
                              <button
                                type="button"
                                className="sg-shotBtn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openImage(img.url);
                                }}
                                title="Maximize"
                              >
                                <img src={maximizeIcon} alt="" />
                              </button>

                              <button
                                type="button"
                                className="sg-shotBtn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  dl(img.url);
                                }}
                                title="Download"
                              >
                                <img src={downloadIcon} alt="" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div style={{ height: 40 }} />
      </div>

      <Footer />
    </div>
  );
}