import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import "./VideoModal.css";
import yt1 from "../assets/yt1.png";
import demoIcon from "../assets/view demo.png";
import driveIcon from "../assets/drive.png";


function getYoutubeEmbedData(rawUrl = "") {
  const input = String(rawUrl || "").trim();
  if (!input) return null;

  try {
    let url = input;

    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();

    let videoId = "";
    let playlistId = "";

    if (host === "youtu.be") {
      videoId = u.pathname.split("/").filter(Boolean)[0] || "";
    } else if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com"
    ) {
      if (u.pathname === "/watch") {
        videoId = u.searchParams.get("v") || "";
        playlistId = u.searchParams.get("list") || "";
      } else if (u.pathname === "/playlist") {
        playlistId = u.searchParams.get("list") || "";
      } else if (u.pathname.startsWith("/embed/")) {
        videoId = u.pathname.split("/embed/")[1]?.split("/")[0] || "";
      } else if (u.pathname.startsWith("/shorts/")) {
        videoId = u.pathname.split("/shorts/")[1]?.split("/")[0] || "";
      } else if (u.pathname.startsWith("/live/")) {
        videoId = u.pathname.split("/live/")[1]?.split("/")[0] || "";
      }
    }

    if (!videoId && !playlistId) {
      const videoMatch = input.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([A-Za-z0-9_-]{6,})/
      );
      const playlistMatch = input.match(/[?&]list=([A-Za-z0-9_-]+)/);

      videoId = videoMatch?.[1] || "";
      playlistId = playlistMatch?.[1] || "";
    }

    if (videoId) {
      return {
        kind: "youtube-video",
        embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`,
      };
    }

    if (playlistId) {
      return {
        kind: "youtube-playlist",
        embedUrl: `https://www.youtube.com/embed/videoseries?list=${playlistId}&autoplay=1&rel=0`,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function extractDriveFileId(rawUrl = "") {
  const input = String(rawUrl || "").trim();
  if (!input) return null;

  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /thumbnail\?id=([a-zA-Z0-9_-]+)/,
    /drive\.usercontent\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function getDriveEmbedData(rawUrl = "") {
  const input = String(rawUrl || "").trim();
  if (!input) return null;

  const fileId = extractDriveFileId(input);

  if (fileId) {
    return {
      kind: "drive-file",
      embedUrl: `https://drive.google.com/file/d/${fileId}/preview`,
    };
  }

  if (/^https:\/\/drive\.google\.com\/file\/d\/[a-zA-Z0-9_-]+\/preview/i.test(input)) {
    return {
      kind: "drive-file",
      embedUrl: input,
    };
  }

  return null;
}

function resolveEmbedData(videoUrl = "", type = "youtube") {
  const safeType = String(type || "").toLowerCase();

  if (safeType === "drive") {
    return getDriveEmbedData(videoUrl);
  }

  if (safeType === "youtube") {
    return getYoutubeEmbedData(videoUrl);
  }

  if (safeType === "demo") {
    return getDriveEmbedData(videoUrl) || getYoutubeEmbedData(videoUrl) || {
      kind: "generic",
      embedUrl: String(videoUrl || "").trim(),
    };
  }

  return (
    getDriveEmbedData(videoUrl) ||
    getYoutubeEmbedData(videoUrl) || {
      kind: "generic",
      embedUrl: String(videoUrl || "").trim(),
    }
  );
}

export default function VideoModal({
  isOpen,
  onClose,
  videoUrl,
  title = "Project Walkthrough",
  subtitle = "Offline-ready project walkthrough",
  type = "youtube",
}) {
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const embedData = resolveEmbedData(videoUrl, type);
  const embedUrl = embedData?.embedUrl || "";

  const headerIcon =
  type === "youtube"
    ? yt1
    : type === "drive"
    ? driveIcon
    : demoIcon;

  return ReactDOM.createPortal(
    <div className="videoModalOverlay" onClick={onClose}>
      <div
        className="videoModalCard"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="videoModalHeader">
          <div className="videoModalTitleWrap">
            <div className="videoModalHeaderIconWrap" aria-hidden="true">
              <img
                src={headerIcon}
                alt=""
                className="videoModalHeaderIconImg"
              />
            </div>

            <div className="videoModalTextWrap">
              <h2 className="videoModalTitle">{title}</h2>
              <p className="videoModalSubtitle">{subtitle}</p>
            </div>
          </div>

          <button
            type="button"
            className="videoModalClose"
            onClick={onClose}
            aria-label="Close video"
          >
            ×
          </button>
        </div>

        <div className="videoModalBody">
          {embedUrl ? (
            <iframe
              className="videoModalIframe"
              src={embedUrl}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="videoModalFallback">
              {type === "drive"
                ? "Invalid Google Drive link"
                : type === "youtube"
                ? "Invalid YouTube link"
                : "Invalid video link"}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}