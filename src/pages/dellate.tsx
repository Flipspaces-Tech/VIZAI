// src/pages/experience/Experience.jsx
import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";

// ====== Apps Script Web App (must end with /exec) ======
const GDRIVE_API_URL =
  "https://script.google.com/macros/s/AKfycbxcVqr7exlAGvAVSh672rB_oG7FdL0W0ymkRb_6L7A8awu7gqYDInR_6FLczLNkpr0B/exec";

function getQuery(key, def = "") {
  const u = new URL(window.location.href);
  return u.searchParams.get(key) || def;
}

// ✅ phase-specific text (defaults match your dashboard)
const LOADER_TEXT = {
  connecting: getQuery("msg1", "Starting connection to Vizwalk server, please wait"),
  launching: getQuery("msg2", "Almost there, hold tight—awesomeness loading"),
  finalizing: getQuery("msg3", "Sharpening pixels and buffing the details…"),
};

// ---------- Helpers for robust boolean + early message handling ----------
const toBool = (v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "on";
  }
  return !!v;
};

// If UE tells us desired hover before UIControlApp is ready, store it and apply later
let pendingHoverEnabled = null;

// ---------- Apps Script fetch + resolver (with strong diagnostics) ----------
async function getJsonVerbose(url, params = {}) {
  const u = new URL(url);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      u.searchParams.set(k, String(v));
    }
  });

  let resp, text;
  try {
    resp = await fetch(u.toString(), { method: "GET" });
  } catch (e) {
    throw new Error(`Network error to ${u}: ${e?.message || e}`);
  }

  try {
    const data = await resp.clone().json();
    if (!resp.ok || data?.ok === false) {
      // bubble Apps Script error string if present
      throw new Error(data?.error || `HTTP ${resp.status}`);
    }
    return data;
  } catch {
    text = await resp.text().catch(() => "");
    throw new Error(
      `Expected JSON from Apps Script but got: ${text?.slice(0, 300) || "(no body)"} (HTTP ${resp?.status})`
    );
  }
}

// ✅ Resolve appId:
// 1) URL ?appId=... (highest priority)
// 2) Google Sheet via Apps Script: action=getappid&build=<build>&ver=<ver>&gid=<gid>&tab=<tab>
// 3) Last-resort hardcoded fallback
async function resolveAppId(buildName, buildVersion) {
  const urlOverride = getQuery("appId", "").trim();
  if (urlOverride) return urlOverride;

  // ✅ IMPORTANT: forward gid/tab if present (so Experience uses same sheet source)
  const gid = getQuery("gid", "").trim(); // e.g. 738570445 or 1024074012
  const tab = getQuery("tab", "").trim(); // optional

  const data = await getJsonVerbose(GDRIVE_API_URL, {
    action: "getappid",
    build: buildName,
    ver: buildVersion || "",
    gid, // ✅ forward
    tab, // ✅ forward (optional)
  });

  if (data?.appId && typeof data.appId === "string") return data.appId;
  throw new Error("No appId in response JSON");
}

/** =============== 3-phase loader overlay (PNG/GIF; with corner text) =============== */
function LoaderOverlay({ phase }) {
  // call hooks unconditionally
  const imgRef = React.useRef(null);
  const [scaleX, setScaleX] = React.useState(1);
  const [scaleY, setScaleY] = React.useState(1);

  const recalc = React.useCallback(() => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const viewAR = vw / vh;
    const imgAR = img.naturalWidth / img.naturalHeight;

    const neededScaleX = viewAR > imgAR ? viewAR / imgAR : 1;
    setScaleX(neededScaleX);

    // If you later want Y scaling logic, you can add it here.
    // Keeping your existing state in place so nothing breaks.
    setScaleY(1);
  }, []);

  React.useEffect(() => {
    const onResize = () => recalc();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [recalc]);

  // decide visibility AFTER hooks
  const show = !!phase && phase !== "ready";
  if (!show) return null;

  const src =
    phase === "connecting"
      ? "/gifs/conn.png"
      : phase === "launching"
      ? "/gifs/conn.png"
      : "/gifs/conn.png";

  return (
    <div
      id="sp-loader"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        overflow: "hidden",
      }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={phase}
        onLoad={recalc}
        style={{
          width: "100%",
          height: "100%",
          
          transform: `scaleX(${scaleX}),scaleY(${scaleY})`,
          transformOrigin: "center",
          display: "block",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "fixed",
          top: "40px",
          left: "50px",
          maxWidth: "40vw",
          color: "#fff",
          padding: "10px 14px",
          borderRadius: "10px",
          fontSize: "24px",
          lineHeight: 1.35,
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
        }}
      >
        {LOADER_TEXT[phase] || ""}
      </div>
    </div>
  );
}

// --- Upload EC2 screenshot URL to Apps Script → Drive ---
async function uploadScreenshotUrlToDrive(imageUrl, buildName, sessionId) {
  if (!GDRIVE_API_URL) return;

  try {
    console.log("Uploading screenshot URL to Drive:", imageUrl);

    const form = new FormData();
    form.append("action", "saveScreenshotUrl");
    form.append("buildName", buildName);
    form.append("sessionId", sessionId);
    form.append("imageUrl", imageUrl);

    const res = await fetch(GDRIVE_API_URL, {
      method: "POST",
      body: form, // <-- NO headers, browser sets multipart/form-data
    });

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      console.log("No JSON response (ok for now)", e);
    }

    console.log("Drive upload result:", data);
    return data;
  } catch (err) {
    console.error("uploadScreenshotUrlToDrive error", err);
    return null;
  }
}

/** ======================================================================== */

// SDK singletons; will be dropped on unmount
let PixelStreamingApp;
let PixelStreamingUiApp;
let UIControlApp;

export default function Experience() {
  const videoWrapRef = useRef(null);
  const connectingRef = useRef(false);
  const mountedRef = useRef(false);

  const [hoverEnabled, setHoverEnabled] = useState(true);
  const [firstUploadDone, setFirstUploadDone] = useState(false);

  // Track real user interaction + queued sequence
  const userInteractedRef = useRef(false);
  const pendingSequenceRef = useRef(false);
  const sequenceRunningRef = useRef(false);

  // loader phase
  const [phase, setPhase] = useState("connecting");

  // debug banners (for appId resolution)
  const [appIdError, setAppIdError] = useState("");
  const [resolvedAppIdPreview, setResolvedAppIdPreview] = useState("");

  const sessionId = useMemo(() => getQuery("session", "session-" + Date.now()), []);

  // ===== QUERY PARAMS =====
  const buildName = useMemo(() => getQuery("build", "Build"), []);
  const buildVersion = useMemo(() => getQuery("ver", ""), []);

  // ===== DERIVED combined key =====
  const buildKey = useMemo(() => {
    return buildVersion ? `${buildName} ${buildVersion}` : buildName;
  }, [buildName, buildVersion]);

  // --- Helper: infer a clean filename from a URL or fall back to timestamp
  const filenameFromUrl = (url, fallbackExt = ".png") => {
    try {
      const u = new URL(url);
      const last = u.pathname.split("/").pop() || "";
      const clean = last.split("?")[0] || "";
      if (clean) return clean;
    } catch {}
    return `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}${fallbackExt}`;
  };

  // --- Helper: does a string look like a direct image URL?
  const looksLikeHttpImageUrl = (s) => {
    if (typeof s !== "string") return false;
    const str = s.trim();
    if (!/^https?:\/\//i.test(str)) return false;
    return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(str);
  };

  // --- Robust downloader with HTTP→HTTPS proxy support
  const isHttpInsecure = (url) => /^http:\/\//i.test(String(url || "").trim());

  const proxyHttpsDownload = (insecureUrl) => {
    const u = new URL(GDRIVE_API_URL);
    u.searchParams.set("action", "proxyget");
    u.searchParams.set("url", insecureUrl);
    u.searchParams.set("mode", "redirect"); // fast redirect mode
    const finalUrl = u.toString();
    console.log("Opening proxy:", finalUrl);
    window.open(finalUrl, "_blank", "noopener,noreferrer");
  };

  const downloadUrlSmart = useCallback(async (url, filenameHint) => {
    const name = filenameHint || filenameFromUrl(url);

    if (isHttpInsecure(url)) {
      proxyHttpsDownload(url);
      return true;
    }

    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      return true;
    } catch (e) {
      console.warn("CORS/Fetch failed, opening URL directly:", e);
      window.open(url, "_blank", "noopener,noreferrer");
      return false;
    }
  }, []);

  const downloadDataUrl = useCallback(async (dataUrl, filename) => {
    try {
      const res = await fetch(dataUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.warn("downloadDataUrl fallback open:", e);
      window.open(dataUrl, "_blank", "noopener,noreferrer");
    }
  }, []);

  const attachVideoAutoplaySafe = useCallback((rootEl) => {
    if (!videoWrapRef.current || !rootEl) return;

    videoWrapRef.current.innerHTML = "";
    videoWrapRef.current.append(rootEl);

    const videoEl = videoWrapRef.current.querySelector("video");
    if (!videoEl) return;

    videoEl.muted = true;
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.tabIndex = 0;

    const tryPlay = () => videoEl.play?.().catch(() => {});
    tryPlay();
    videoEl.addEventListener("canplay", tryPlay, { once: true });

    const onFirstFrame = () => {
      setPhase("ready");
      const overlay = document.getElementById("sp-loader");
      if (overlay) {
        overlay.style.opacity = "0";
        setTimeout(() => overlay.remove(), 380);
      }
    };
    videoEl.addEventListener("playing", onFirstFrame, { once: true });

    const unmuteOnce = () => {
      videoEl.muted = false;
      videoEl.removeEventListener("pointerdown", unmuteOnce);
    };
    videoEl.addEventListener("pointerdown", unmuteOnce, { once: true });
  }, []);

  // === Synthetic input helpers (I key + left click) ===
  const sendKeyI = useCallback(
    (type = "keydown") => {
      const target =
        videoWrapRef.current?.querySelector("canvas, video") ||
        videoWrapRef.current ||
        window;

      if (!target) return;

      const evt = new KeyboardEvent(type, {
        key: "i",
        code: "KeyI",
        keyCode: 73,
        which: 73,
        bubbles: true,
        cancelable: true,
      });

      target.dispatchEvent(evt);
    },
    [videoWrapRef]
  );

  const sendLeftClick = useCallback(() => {
    const target =
      videoWrapRef.current?.querySelector("canvas, video") ||
      videoWrapRef.current ||
      document.body;

    if (!target || !target.getBoundingClientRect) return;

    const rect = target.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const makeEvent = (type) =>
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: cx,
        clientY: cy,
        button: 0, // left button
        buttons: 1,
      });

    target.dispatchEvent(makeEvent("mousedown"));
    target.dispatchEvent(makeEvent("mouseup"));
    target.dispatchEvent(makeEvent("click"));
  }, [videoWrapRef]);

  const runIKeyClickSequence = useCallback(() => {
    if (sequenceRunningRef.current) return;
    sequenceRunningRef.current = true;

    // STEP 1: I (OPEN)
    sendKeyI("keydown");
    sendKeyI("keyup");

    // STEP 2: Left-click after a short delay
    setTimeout(() => {
      sendLeftClick();

      // STEP 3: I (CLOSE) after another delay
      setTimeout(() => {
        sendKeyI("keydown");
        sendKeyI("keyup");

        sequenceRunningRef.current = false;
      }, 100); // delay between click and second I
    }, 200); // delay between first I and click
  }, [sendKeyI, sendLeftClick]);

  // Extract last valid URL from glued strings like:
  // "http://ec2...amazonaws.comhttps://s3.../file.png"
  const extractBestImageUrl = (raw) => {
    if (typeof raw !== "string") return "";
    const s = raw.trim();
    if (!s) return "";

    // Split whenever a new http/https URL begins
    const parts = s
      .split(/(?=https?:\/\/)/g)
      .map((x) => x.trim())
      .filter(Boolean);

    // Prefer the last part that looks like an image
    for (let i = parts.length - 1; i >= 0; i--) {
      if (/\.(png|jpe?g|jpeg|webp|gif)(\?.*)?$/i.test(parts[i])) return parts[i];
    }

    // Otherwise, return the last URL-ish part
    return parts[parts.length - 1] || s;
  };

  const handleResponseApp = useCallback(
    async (response) => {
      try {
        console.log("Received unreal message:", response);

        const forwardImageUrl = async (url) => {
          const extracted = extractBestImageUrl(url).trim();
          console.log("forwardImageUrl raw:", url);
          console.log("forwardImageUrl extracted:", extracted);
          if (!extracted) return;

          await uploadScreenshotUrlToDrive(extracted, buildKey, sessionId);
        };

        // -------------------------------------------------
        // 0) Raw string payloads
        // -------------------------------------------------
        if (typeof response === "string") {
          // (a) plain URL string (EC2 screenshot, S3, etc.)
          if (looksLikeHttpImageUrl(response)) {
            await forwardImageUrl(response);
            return;
          }

          // (b) otherwise try to parse as JSON
          try {
            response = JSON.parse(response);
          } catch {
            // not JSON, nothing more to do
            return;
          }
        }

        const msg = response;
        if (!msg || typeof msg !== "object") return;

        // -------------------------------------------------
        // 1) Mouse cursor visibility
        // -------------------------------------------------
        if (Object.prototype.hasOwnProperty.call(msg, "showMouseCursor")) {
          const enabled = toBool(msg.showMouseCursor);

          setHoverEnabled(enabled);
          if (UIControlApp?.toggleHoveringMouse) {
            UIControlApp.toggleHoveringMouse(enabled);
          } else {
            pendingHoverEnabled = enabled;
          }

          // When UE sends {"showMouseCursor":"false"}
          if (enabled === false) {
            if (userInteractedRef.current) {
              runIKeyClickSequence();
            } else {
              // queue until first real click
              pendingSequenceRef.current = true;
            }
          }

          return;
        }

        if (msg.type === "showMouseCursor") {
          const enabled = toBool(msg.value);
          setHoverEnabled(enabled);
          if (UIControlApp?.toggleHoveringMouse) {
            UIControlApp.toggleHoveringMouse(enabled);
          } else {
            pendingHoverEnabled = enabled;
          }
          return;
        }

        // -------------------------------------------------
        // 2) Screenshot URL callback (savedScreenshotUrl)
        //    – can be EC2 http:// or data URL
        // -------------------------------------------------
        if (
          msg.type === "savedScreenshotUrl" ||
          typeof msg.savedScreenshotUrl === "string" ||
          typeof msg.value === "string"
        ) {
          const raw =
            (typeof msg.savedScreenshotUrl === "string" && msg.savedScreenshotUrl) ||
            (typeof msg.value === "string" && msg.value) ||
            "";

          if (raw) {
            const val = raw.trim();
            if (looksLikeHttpImageUrl(val)) {
              // EC2/S3 style URL
              await forwardImageUrl(val);
            } else {
              // data:image/...;base64,....
              const urlFilename = val.split("/").pop()?.split("?")[0] || filenameFromUrl(val);
              await downloadDataUrl(val, urlFilename);
            }
            return;
          }
        }

        // 2b) Fallback: raw savedScreenshotUrl field without type
        if (typeof msg.savedScreenshotUrl === "string") {
          const val = msg.savedScreenshotUrl.trim();
          if (looksLikeHttpImageUrl(val)) {
            await forwardImageUrl(val);
          } else {
            const urlFilename = val.split("/").pop()?.split("?")[0] || filenameFromUrl(val);
            await downloadDataUrl(val, urlFilename);
          }
          return;
        }

        // -------------------------------------------------
        // 3) Generic JSON fields that may contain an image URL
        // -------------------------------------------------
        const possibleUrl =
          (typeof msg.url === "string" && msg.url) ||
          (typeof msg.link === "string" && msg.link) ||
          (typeof msg.s3Url === "string" && msg.s3Url) ||
          (typeof msg.ec2Url === "string" && msg.ec2Url) ||
          (typeof msg.http === "string" && msg.http) ||
          (typeof msg.value === "string" && msg.value) ||
          "";

        if (looksLikeHttpImageUrl(possibleUrl)) {
          await forwardImageUrl(possibleUrl);
          return;
        }

        // -------------------------------------------------
        // 4) Raw image payloads (data URLs / base64)
        // -------------------------------------------------
        let data = msg.dataUrl || msg.base64 || msg.imageData || msg.png || msg.jpg;
        if (data) {
          if (typeof data === "string" && !data.startsWith("data:image/")) {
            data = "data:image/png;base64," + data;
          }

          const filename =
            msg.filename || `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
          await downloadDataUrl(data, filename);

          if (GDRIVE_API_URL && GDRIVE_API_URL.startsWith("http")) {
            const res = await fetch(GDRIVE_API_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                buildName: buildKey,
                sessionId,
                imageDataUrl: data,
                stamp: filename.replace(/\.png$/i, ""),
              }),
            })
              .then((r) => r.json())
              .catch(() => null);

            if (res?.ok && !firstUploadDone) {
              setFirstUploadDone(true);
              const galleryUrl = `${window.location.origin}/gallery?build=${encodeURIComponent(
                buildName
              )}&ver=${encodeURIComponent(buildVersion || "")}&session=${encodeURIComponent(sessionId)}`;

              window.open(galleryUrl, "_blank", "noopener,noreferrer");
            } else if (!res?.ok) {
              console.warn("Drive upload failed (dataUrl path):", res);
            }
          }
          return;
        }

        // -------------------------------------------------
        // (no known payload type)
        // -------------------------------------------------
      } catch (e) {
        console.error("handleResponseApp error:", e, response);
      }
    },
    [downloadDataUrl, downloadUrlSmart, buildName, buildVersion, sessionId, firstUploadDone, runIKeyClickSequence, buildKey]
  );

  const hardDisconnect = useCallback(() => {
    try {
      PixelStreamingApp?.removeResponseEventListener?.("handle_responses", handleResponseApp);
    } catch {}
    try {
      PixelStreamingUiApp?.stream?.disconnect?.();
    } catch {}
    try {
      PixelStreamingApp?.disconnect?.();
    } catch {}

    if (videoWrapRef.current) {
      try {
        const vid = videoWrapRef.current.querySelector("video");
        if (vid) {
          try {
            vid.pause();
          } catch {}
          try {
            vid.srcObject = null;
          } catch {}
          vid.removeAttribute("src");
          try {
            vid.load();
          } catch {}
        }
        videoWrapRef.current.innerHTML = "";
      } catch {}
    }

    setPhase("connecting");
    PixelStreamingApp = undefined;
    PixelStreamingUiApp = undefined;
    UIControlApp = undefined;
  }, [handleResponseApp]);

  const startPlay = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;

    // Always begin from a clean slate
    hardDisconnect();

    const { StreamPixelApplication } = await import("streampixelsdk");

    // Look up appId from sheet (same row as ?build=)
    let resolvedAppId = "68d3987ed64e846388bcf314"; // safe fallback
    try {
      const id = await resolveAppId(buildName, buildVersion);
      resolvedAppId = id || resolvedAppId;
      setResolvedAppIdPreview(resolvedAppId);
      setAppIdError(""); // clear old errors
    } catch (e) {
      const msg = e?.message || String(e);
      console.warn("AppId resolve error:", msg);
      setAppIdError(msg);
      setResolvedAppIdPreview(resolvedAppId + " (fallback)");
    }

    const init = await StreamPixelApplication({
      AutoConnect: true,
      appId: resolvedAppId,
      keyBoardInput: true,
    });

    const app = init?.appStream || init?.app || init?.stream;
    const ps = init?.pixelStreaming;
    const ui = init?.UIControl;

    if (!app || !ps) {
      console.error("Unexpected SDK shape", init);
      connectingRef.current = false;
      return;
    }

    PixelStreamingApp = ps;
    PixelStreamingUiApp = app;
    UIControlApp = ui;

    // Map SDK lifecycle -> loader phases
    app.onWebRtcConnecting = () => setPhase("connecting");
    app.onVideoInitialized = () => setPhase("launching");
    app.onWebRtcConnected = () => setPhase("finalizing");

    // Attach immediately
    attachVideoAutoplaySafe(app.rootElement);

    // Also attach when the SDK fires it
    app.onVideoInitialized = () => {
      setPhase("launching");
      attachVideoAutoplaySafe(app.rootElement);
    };

    // UE → Web messages
    ps.addResponseEventListener("handle_responses", handleResponseApp);
    console.log("added event listener to handle_responses");

    // 🔁 If UE already told us the desired hover state, apply it now
    if (pendingHoverEnabled !== null) {
      try {
        UIControlApp?.toggleHoveringMouse?.(pendingHoverEnabled);
      } catch {}
      try {
        setHoverEnabled(!!pendingHoverEnabled);
      } catch {}
      pendingHoverEnabled = null;
    }

    try {
      await app.connect?.();
    } catch {}

    connectingRef.current = false;
  }, [attachVideoAutoplaySafe, handleResponseApp, hardDisconnect, buildName, buildVersion]);

  const toggleMouseHover = useCallback(() => {
    setHoverEnabled((prev) => {
      const next = !prev;
      UIControlApp?.toggleHoveringMouse?.(next);
      return next;
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    startPlay();

    // Alt+0 toggle and Backspace OFF fallback
    const onKey = (e) => {
      if (e.code === "Digit0" && e.altKey && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        toggleMouseHover();
        return;
      }
      if (e.code === "Backspace" && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        setHoverEnabled(false);
        UIControlApp?.toggleHoveringMouse?.(false);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });

    // Track the first REAL user interaction; run queued sequence if needed
    const onPointerDown = (e) => {
      // ignore synthetic events; only real user clicks
      if (!e.isTrusted) return;

      if (!userInteractedRef.current) {
        userInteractedRef.current = true;
        if (pendingSequenceRef.current) {
          pendingSequenceRef.current = false;
          runIKeyClickSequence();
        }
      }
    };

    window.addEventListener("pointerdown", onPointerDown, { capture: true });

    // Resume video when tab becomes visible
    const onVis = () => {
      if (document.visibilityState === "visible") {
        const v = videoWrapRef.current?.querySelector("video");
        v?.play?.().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);

    // BFCache return
    const onPageShow = (e) => {
      if (e.persisted) startPlay();
    };
    window.addEventListener("pageshow", onPageShow);

    // Ensure teardown on hide/unload (helps iOS/Safari)
    const onPageHide = () => {
      hardDisconnect();
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
      hardDisconnect();
    };
  }, [startPlay, toggleMouseHover, hardDisconnect, runIKeyClickSequence]);

  return (
    <div className="experience-page">
      {/* Debug banners */}
      {appIdError && (
        <div
          style={{
            position: "fixed",
            top: 10,
            left: 10,
            right: 10,
            zIndex: 10000,
            background: "#2b1e1e",
            color: "#ffb3b3",
            padding: "10px 14px",
            border: "1px solid #a44",
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          <b>AppId lookup failed:</b> {appIdError}
        </div>
      )}

      {resolvedAppIdPreview && phase !== "ready" && (
        <div
          style={{
            position: "fixed",
            top: "50px",
            right: "50px",
            zIndex: 10000,
            color: "white",
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 12,
            transition: "opacity 300ms ease",
            opacity: phase === "ready" ? 0 : 1,
          }}
        >
          appId: {resolvedAppIdPreview}
        </div>
      )}

      {/* 3-phase loader overlay + corner text */}
      <LoaderOverlay phase={phase} />

      <div
        id="videoElement"
        ref={videoWrapRef}
        style={{
          backgroundColor: "#000",
          height: "100vh",
          position: "relative",
          willChange: "transform",
        }}
      />
    </div>
  );
}
