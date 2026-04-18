// src/components/GifLoader.jsx
import React from "react";

export default function GifLoader({ phase }) {
  const srcByPhase = {
    connecting:  "/gifs/connecting1.gif",
    launching:   "/gifs/launching.gif",
    finalizing:  "/gifs/finalizing.gif",
  };

  if (!phase || phase === "ready") return null;

  return (
    <div className="sp-loader">
      <img src={srcByPhase[phase]} alt={`${phase}...`} />
    </div>
  );
}
