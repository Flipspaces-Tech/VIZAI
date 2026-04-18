import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { isEmailAllowed, resetAllowlistCache } from "./allowlist";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ Browser-level redirect that avoids back/forward loop
  const forceToLogin = (reason = "revoked") => {
    const next = encodeURIComponent(
      window.location.pathname + window.location.search
    );
    window.location.replace(`/login?reason=${reason}&next=${next}`);
  };

  useEffect(() => {
    let alive = true;

    // --- initial session load ---
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      const s = data.session || null;

      // ✅ enforce allowlist for any existing session
      const email = s?.user?.email || "";
      if (s) {
        resetAllowlistCache(); // ensure freshest allowlist
        const ok = await isEmailAllowed(email);

        if (!ok) {
          await supabase.auth.signOut();
          setSession(null);
          setLoading(false);
          forceToLogin("revoked"); // ✅ hard redirect
          return;
        }
      }

      setSession(s);
      setLoading(false);
    })();

    // --- session changes ---
    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        const email = newSession?.user?.email || "";

        if (newSession) {
          resetAllowlistCache(); // keep it fresh
          const ok = await isEmailAllowed(email);

          if (!ok) {
            await supabase.auth.signOut();
            setSession(null);
            forceToLogin("revoked"); // ✅ hard redirect
            return;
          }
        }

        setSession(newSession);
      }
    );

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const value = useMemo(() => {
    return {
      session,
      user: session?.user || null,
      loading,

      // A) Send OTP only if allowed
      async sendOtp(email) {
        resetAllowlistCache();
        const ok = await isEmailAllowed(email);

        if (!ok) return { ok: false, error: "Not allowed to access this app." };

        const { error } = await supabase.auth.signInWithOtp({ email });
        return error ? { ok: false, error: error.message } : { ok: true };
      },

      // B) Verify OTP only if allowed
      async verifyOtp(email, token) {
        resetAllowlistCache();
        const ok = await isEmailAllowed(email);

        if (!ok) return { ok: false, error: "Not allowed to access this app." };

        const { data, error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: "email",
        });

        return error
          ? { ok: false, error: error.message }
          : { ok: true, session: data.session };
      },

      // ✅ Logout should also hard redirect to avoid history weirdness
      async signOut() {
        await supabase.auth.signOut();
        forceToLogin("logout");
      },
    };
  }, [session, loading]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
