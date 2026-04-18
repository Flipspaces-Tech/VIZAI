import React, { createContext, useContext, useMemo, useState } from "react";
import VideoModal from "../components/VideoModal";

const VideoModalContext = createContext(null);

export function VideoModalProvider({ children }) {
  const [modalState, setModalState] = useState({
    isOpen: false,
    videoUrl: "",
    title: "",
    subtitle: "",
    type: "youtube",
  });

  const openVideo = (url, title = "", subtitle = "", options = {}) => {
    setModalState({
      isOpen: true,
      videoUrl: url || "",
      title: title || "",
      subtitle: subtitle || "",
      type: options?.type || "youtube",
    });
  };

  const closeVideo = () => {
    setModalState({
      isOpen: false,
      videoUrl: "",
      title: "",
      subtitle: "",
      type: "youtube",
    });
  };

  const value = useMemo(
    () => ({
      openVideo,
      closeVideo,
    }),
    []
  );

  return (
    <VideoModalContext.Provider value={value}>
      {children}

      <VideoModal
        isOpen={modalState.isOpen}
        onClose={closeVideo}
        videoUrl={modalState.videoUrl}
        title={modalState.title}
        subtitle={modalState.subtitle}
        type={modalState.type}
      />
    </VideoModalContext.Provider>
  );
}

export function useVideoModal() {
  const ctx = useContext(VideoModalContext);

  if (!ctx) {
    throw new Error("useVideoModal must be used inside VideoModalProvider");
  }

  return ctx;
}