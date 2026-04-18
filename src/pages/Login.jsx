// src/pages/Login.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useLocation, useNavigate } from "react-router-dom";
import "./login.css";

import loginBg from "../assets/bg_3.jpg";
import vizwalkLogo from "../assets/L1.png";

import logoMark from "../assets/Viz logo.png";     // left icon (V)
import logoWord from "../assets/Viz logo_01.png";     // right text (vizwalk + powered by...)


function sanitizeNext(nextRaw) {
  if (!nextRaw) return "/";
  if (nextRaw.startsWith("http://") || nextRaw.startsWith("https://")) return "/";
  if (!nextRaw.startsWith("/")) return "/";
  return nextRaw;
}

export default function Login() {
  const { sendOtp, verifyOtp, session } = useAuth();

  const [step, setStep] = useState("email"); // email | otp
  const [email, setEmail] = useState("");
  const [remember, setRemember] = useState(true);

  // ✅ 6-digit OTP with paste support
  const OTP_LEN = 6;
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LEN).fill(""));
  const otpRefs = useRef([]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Verified UI
  const [verifiedUI, setVerifiedUI] = useState(false);
  const [holdRedirect, setHoldRedirect] = useState(false);

  const nav = useNavigate();
  const loc = useLocation();

  const next = useMemo(() => {
    const qpNext = new URLSearchParams(loc.search).get("next");
    const stateNext = loc.state?.from
      ? loc.state.from.pathname + (loc.state.from.search || "")
      : null;

    return sanitizeNext(qpNext || stateNext || "/");
  }, [loc.search, loc.state]);

  // ✅ Redirect only when not holding (so verified screen stays visible)
  useEffect(() => {
    if (session && !holdRedirect) nav(next, { replace: true });
  }, [session, holdRedirect, nav, next]);

  // ✅ safe absolute url for background
  const bgUrl = String(loginBg || "");
  const bgAbs = bgUrl.startsWith("/") ? bgUrl : `/${bgUrl}`;

  const onSend = async () => {
    const e = email.trim();
    if (!e) return;

    setBusy(true);
    setMsg("");
    setVerifiedUI(false);
    setHoldRedirect(false);

    const res = await sendOtp(e);

    setBusy(false);

    if (res.ok) {
      setStep("otp");
      setMsg("");
      setOtpDigits(Array(OTP_LEN).fill(""));
      setTimeout(() => otpRefs.current?.[0]?.focus?.(), 50);
    } else {
      setStep("email");
      setMsg(res.error || "Could not send OTP.");
    }
  };

  const otpValue = otpDigits.join("");

  const applyOtpString = (raw) => {
    const digits = String(raw || "").replace(/\D/g, "").slice(0, OTP_LEN);
    if (!digits) return;

    const nextArr = Array(OTP_LEN).fill("");
    for (let i = 0; i < digits.length; i++) nextArr[i] = digits[i];
    setOtpDigits(nextArr);

    const focusIndex = Math.min(digits.length, OTP_LEN - 1);
    setTimeout(() => otpRefs.current?.[focusIndex]?.focus?.(), 0);
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData("text") || "";
    applyOtpString(text);
  };

  const handleOtpChange = (idx, val) => {
    const digit = (val || "").replace(/\D/g, "").slice(-1);

    const nextArr = [...otpDigits];
    nextArr[idx] = digit;
    setOtpDigits(nextArr);

    if (digit && idx < OTP_LEN - 1) otpRefs.current[idx + 1]?.focus?.();
  };

  const handleOtpKeyDown = (idx, e) => {
    if (e.key === "Backspace") {
      if (otpDigits[idx]) {
        const nextArr = [...otpDigits];
        nextArr[idx] = "";
        setOtpDigits(nextArr);
      } else if (idx > 0) {
        otpRefs.current[idx - 1]?.focus?.();
      }
    }
    if (e.key === "ArrowLeft" && idx > 0) otpRefs.current[idx - 1]?.focus?.();
    if (e.key === "ArrowRight" && idx < OTP_LEN - 1) otpRefs.current[idx + 1]?.focus?.();
    if (e.key === "Enter") onVerify();
  };

  const onVerify = async () => {
    const e = email.trim();
    if (!e || otpValue.length !== OTP_LEN) return;

    setBusy(true);
    setMsg("");

    const res = await verifyOtp(e, otpValue);

    setBusy(false);

    if (!res.ok) {
      setMsg(res.error || "Invalid OTP");
      return;
    }

    // ✅ Show verified screen and delay redirect
    setVerifiedUI(true);
    setHoldRedirect(true);

    setTimeout(() => {
      nav(next, { replace: true });
    }, 900);
  };

  const showOtp = !verifiedUI && step === "otp";
  const showEmail = !verifiedUI && step === "email";

  return (
    <div className="vwAuthShell">
      <div className="vwAuthFrame">
        {/* LEFT IMAGE PANEL */}
        <div className="vwAuthLeft" style={{ backgroundImage: `url(${bgAbs})` }}>
          <div className="vwLeftAccent" aria-hidden="true" />
          
          <div className="vwSloganCard">
            <div className="vwSloganLine1">Bring</div>
            <div className="vwSloganLine2">Spaces</div>
            <div className="vwSloganLine3">To Life</div>
          </div>
          <div className="vwLeftAccent1" aria-hidden="true" />
        </div>

        {/* RIGHT FORM PANEL */}
        <div className="vwAuthRight">
          <div className="vwCornerLogo" aria-label="Vizwalk logo">
            <img className="vwCornerLogoMark" src={logoMark} alt="" />
            <img className="vwCornerLogoWord" src={logoWord} alt="vizwalk" />
          </div>


          <div className="vwFormWrap">
            {verifiedUI ? (
              <div className="vwVerifiedSimple">
                <div className="vwVerifiedTitle">Verified!</div>
                <div className="vwVerifiedSub">Redirecting you to the dashboard…</div>
                <div className="vwVerifiedSpinnerDark" aria-label="Loading" />
              </div>
            ) : showOtp ? (
              <>
                <div className="vwRightTitle">OTP</div>

                <label className="vwFieldLabel">Enter OTP</label>

                <div className="vwOtpRow vwOtpRow--light">
                  {otpDigits.map((d, idx) => (
                    <input
                      key={idx}
                      ref={(el) => (otpRefs.current[idx] = el)}
                      className="vwOtpBox vwOtpBox--light"
                      value={d}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      onPaste={handleOtpPaste}
                      inputMode="numeric"
                      maxLength={1}
                    />
                  ))}
                </div>

                <div className="vwOtpMeta">
                  <span className="vwOtpTimer">00:30 sec</span>
                  <button className="vwLinkBtn" disabled={busy} onClick={onSend}>
                    Resend
                  </button>
                </div>

                <button
                  className="vwCta vwCta--light"
                  disabled={busy || otpValue.length !== OTP_LEN}
                  onClick={onVerify}
                >
                  {busy ? "Signing in…" : "Signin"}
                </button>

                {msg ? <div className="vwMsg vwMsg--dark">{msg}</div> : null}
              </>
            ) : (
              <>
                <div className="vwRightTitle">Signin</div>

                <label className="vwFieldLabel">Enter your Flipspaces ID</label>

                <input
                  className="vwInput vwInput--light"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example.abc@flipspaces.com"
                  autoComplete="email"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!busy && email.trim()) onSend();
                    }
                  }}
                />

                <label className="vwRememberLight">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <span>Remember Me</span>
                </label>

                <button
                  className="vwCta vwCta--light"
                  disabled={busy || !email.trim()}
                  onClick={onSend}
                >
                  {busy ? "Sending…" : "Send OTP"}
                </button>

                <div className="vwHint vwHint--dark">
                  We’ll send a verification code to your email
                </div>

                {msg ? <div className="vwMsg vwMsg--dark">{msg}</div> : null}
              </>
            )}
          </div>

          <div className="vwTerms vwTerms--dark">
            By continuing you agree to our{" "}
            <span className="vwTermLink vwTermLink--dark">Terms of Service</span>{" "}
            and{" "}
            <span className="vwTermLink vwTermLink--dark">Privacy Policy</span>
          </div>
        </div>
      </div>
    </div>
  );
}
