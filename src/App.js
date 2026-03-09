import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";

import { AuthProvider } from "./auth/AuthProvider";
import RequireAuth from "./auth/RequireAuth";

import Landing from "./pages/Landing";
import ScreenshotGallery from "./pages/ScreenshotGallery";
import Login from "./pages/Login";
import DemoVideos from "./pages/DemoVideos.jsx";
import Learn from "./pages/Learn.jsx";
import Showcase from "./pages/Showcase.jsx";
import LiveProjects from "./pages/LiveProjects.jsx";

const Experience = lazy(() => import("./pages/Experience"));

function RegionGuard({ children }) {
  const { region } = useParams();
  const normalized = String(region || "").toLowerCase();

  if (normalized !== "in" && normalized !== "us") {
    return <Navigate to="/in" replace />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* default root */}
          <Route path="/" element={<Navigate to="/in" replace />} />

          {/* old URLs -> redirect to India by default */}
          <Route path="/showcase" element={<Navigate to="/in/showcase" replace />} />
          <Route path="/live-projects" element={<Navigate to="/in/live-projects" replace />} />
          <Route path="/experience" element={<Navigate to="/in/experience" replace />} />
          <Route path="/gallery" element={<Navigate to="/in/gallery" replace />} />
          <Route path="/demo-videos" element={<Navigate to="/in/demo-videos" replace />} />
          <Route path="/learn" element={<Navigate to="/in/learn" replace />} />

          {/* region routes */}
          <Route
            path="/:region"
            element={
              <RegionGuard>
                <RequireAuth>
                  <Landing />
                </RequireAuth>
              </RegionGuard>
            }
          />

          <Route
            path="/:region/showcase"
            element={
              <RegionGuard>
                <RequireAuth>
                  <Showcase />
                </RequireAuth>
              </RegionGuard>
            }
          />

          <Route
            path="/:region/live-projects"
            element={
              <RegionGuard>
                <RequireAuth>
                  <LiveProjects />
                </RequireAuth>
              </RegionGuard>
            }
          />

          <Route
            path="/:region/experience"
            element={
              <RegionGuard>
                <RequireAuth>
                  <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
                    <Experience />
                  </Suspense>
                </RequireAuth>
              </RegionGuard>
            }
          />

          <Route
            path="/:region/gallery"
            element={
              <RegionGuard>
                <RequireAuth>
                  <ScreenshotGallery />
                </RequireAuth>
              </RegionGuard>
            }
          />

          <Route
            path="/:region/demo-videos"
            element={
              <RegionGuard>
                <DemoVideos />
              </RegionGuard>
            }
          />

          <Route
            path="/:region/learn"
            element={
              <RegionGuard>
                <Learn />
              </RegionGuard>
            }
          />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}