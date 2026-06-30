import { useEffect, useState } from "react";
import { ArrowRight, Mail, Phone, ChevronLeft } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import osherLogo from "../../imports/Osher_wallet_logo.png";
import { AuthMethod, AuthProfile, startSupabaseOtp, verifySupabaseOtp } from "../lib/osher";

interface Props {
  onAuth: (profile: AuthProfile) => void;
}

export function AuthScreen({ onAuth }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [method, setMethod] = useState<AuthMethod>("email");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const OTP_LENGTH = 8;
  const emptyOtp = () => Array(OTP_LENGTH).fill("");
  const [otp, setOtp] = useState<string[]>(() => emptyOtp());
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    const hash = window.location.hash || "";
    if (!hash.includes("error=")) return;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const description = params.get("error_description");
    setStatus(description ? decodeURIComponent(description.replace(/\+/g, " ")) : "The email link could not be verified. Request a fresh code below.");
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const handleOtpChange = (idx: number, val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (digits.length > 1) {
      const next = emptyOtp();
      digits.split("").forEach((digit, i) => {
        if (idx + i < OTP_LENGTH) next[idx + i] = digit;
      });
      setOtp(current => {
        const merged = [...current];
        next.forEach((digit, i) => {
          if (digit) merged[i] = digit;
        });
        return merged;
      });
      const focusIndex = Math.min(OTP_LENGTH - 1, idx + digits.length);
      document.getElementById(`otp-${focusIndex}`)?.focus();
      return;
    }
    const next = [...otp];
    next[idx] = digits;
    setOtp(next);
    if (digits && idx < OTP_LENGTH - 1) {
      const el = document.getElementById(`otp-${idx + 1}`);
      el?.focus();
    }
  };

  const profile = (): AuthProfile => ({
    name: name.trim(),
    contact: value.trim(),
    method,
  });

  const sendOtp = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const result = await startSupabaseOtp(profile());
      setOtpSent(true);
      setResendCooldown(45);
      setStatus(result.demo ? "Supabase is not configured on this server yet. Use any 8-digit code for local testing." : "Verification code sent. Enter the 8-digit code from your email.");
    } catch (err: any) {
      setStatus(err?.message || "Could not send verification code.");
    } finally {
      setBusy(false);
    }
  };

  const resendOtp = async () => {
    if (busy || resendCooldown > 0) return;
    setOtp(emptyOtp());
    await sendOtp();
  };

  const verifyOtp = async () => {
    const code = otp.join("");
    if (code.length < OTP_LENGTH || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const result = await verifySupabaseOtp({ ...profile(), otp: code });
      onAuth(result.user || profile());
    } catch (err: any) {
      setStatus(err?.message || "Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top bar */}
      <div className="px-5 pt-12 pb-4">
        <div className="flex items-center gap-3 mb-6">
          {otpSent && (
            <button onClick={() => setOtpSent(false)} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#f0f0f9" }}>
              <ChevronLeft size={18} color="#0d0d14" />
            </button>
          )}
          {/* Logo */}
          <div style={{ width: 38, height: 38, borderRadius: 12, overflow: "hidden", background: "#f5f5fb", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 6px rgba(0,0,0,0.1)", flexShrink: 0 }}>
            <ImageWithFallback src={osherLogo} alt="Osher AI" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <span className="font-display" style={{ fontSize: "0.9rem", fontWeight: 700, color: "#0d0d14", letterSpacing: "-0.01em" }}>Osher AI</span>
        </div>
        <h1 className="font-display" style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0d0d14", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          {otpSent ? "Check your " + (method === "email" ? "email" : "phone") : mode === "signup" ? "Create account" : "Welcome back"}
        </h1>
        <p style={{ color: "#6b6b8a", marginTop: 5, fontSize: "0.875rem", lineHeight: 1.5 }}>
          {otpSent
            ? `Enter the 8-digit code sent to ${value || (method === "email" ? "your email" : "your phone")}.`
            : mode === "signup"
            ? "Join thousands saving smarter with Osher AI."
            : "Sign in to continue your savings journey."}
        </p>
      </div>

      <div className="flex-1 px-5 py-2 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {!otpSent ? (
          <>
            {/* Mode toggle */}
            <div className="rounded-2xl p-1 mb-7" style={{ background: "#f0f0f9" }}>
              <div className="flex">
                {(["signup", "login"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className="flex-1 py-3 rounded-xl transition-all"
                    style={{
                      background: mode === m ? "#fff" : "transparent",
                      color: mode === m ? "#0d0d14" : "#9a9ab8",
                      fontWeight: 700,
                      fontSize: "0.9rem",
                      boxShadow: mode === m ? "0 1px 6px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    {m === "signup" ? "Sign Up" : "Log In"}
                  </button>
                ))}
              </div>
            </div>

            {/* Method pills */}
            <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "#9a9ab8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Sign in with</p>
            <div className="flex gap-3 mb-6">
              {(["email", "phone"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl border transition-all flex-1 justify-center"
                  style={{
                    borderColor: method === m ? "#171717" : "rgba(0,0,0,0.08)",
                    background: method === m ? "#171717" : "#fff",
                    color: method === m ? "#fff" : "#6b6b8a",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    boxShadow: method === m ? "0 4px 16px rgba(23,23,23,0.2)" : "none",
                  }}
                >
                  {m === "email" ? <Mail size={16} /> : <Phone size={16} />}
                  {m === "email" ? "Email" : "Phone"}
                </button>
              ))}
            </div>

            {/* Input */}
            {mode === "signup" && (
              <div className="mb-5">
                <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#9a9ab8", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
                  Your name
                </label>
                <div className="rounded-2xl border px-4 py-4" style={{ borderColor: "rgba(0,0,0,0.1)", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                  <input
                    className="w-full outline-none bg-transparent"
                    type="text"
                    placeholder="What should Osher call you?"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ fontSize: "1rem", color: "#0d0d14", fontFamily: "inherit" }}
                  />
                </div>
              </div>
            )}

            <div className="mb-6">
              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#9a9ab8", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
                {method === "email" ? "Email address" : "Phone number"}
              </label>
              <div className="rounded-2xl border px-4 py-4" style={{ borderColor: "rgba(0,0,0,0.1)", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                <input
                  className="w-full outline-none bg-transparent"
                  type={method === "email" ? "email" : "tel"}
                  placeholder={method === "email" ? "you@example.com" : "+234 800 000 0000"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  style={{ fontSize: "1rem", color: "#0d0d14", fontFamily: "inherit" }}
                />
              </div>
            </div>

            <button
              onClick={sendOtp}
              className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5"
              style={{
                background: "#171717", color: "#fff", fontWeight: 700, fontSize: "1rem",
                fontFamily: "'Bricolage Grotesque', sans-serif",
                opacity: value.trim() && !busy ? 1 : 0.45,
                boxShadow: value.trim() ? "0 6px 24px rgba(23,23,23,0.25)" : "none",
              }}
            >
              {busy ? "Sending..." : "Send verification code"} <ArrowRight size={18} />
            </button>
            {status && <p style={{ fontSize: "0.78rem", color: status.includes("Could") ? "#c0392b" : "#6b6b8a", marginTop: 12, textAlign: "center", lineHeight: 1.45 }}>{status}</p>}
          </>
        ) : (
          <>
            {/* OTP boxes */}
            <div className="mb-8">
              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#9a9ab8", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 14 }}>
                Verification code
              </label>
              <div className="flex gap-2.5 justify-between">
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    id={`otp-${idx}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    className="rounded-2xl text-center outline-none"
                    style={{
                      width: "11.5%",
                      aspectRatio: "1",
                      fontSize: "1.15rem",
                      fontWeight: 800,
                      color: "#0d0d14",
                      background: digit ? "#CCCCF7" : "#fff",
                      border: `1.5px solid ${digit ? "#9898e8" : "rgba(0,0,0,0.1)"}`,
                      transition: "all 0.15s",
                      fontFamily: "'DM Mono', monospace",
                    }}
                  />
                ))}
              </div>
              <button
                onClick={resendOtp}
                disabled={busy || resendCooldown > 0}
                className="w-full"
                style={{ fontSize: "0.8rem", color: busy || resendCooldown > 0 ? "#9a9ab8" : "#171717", marginTop: 12, textAlign: "center", fontWeight: 700 }}
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Didn't receive it? Resend code"}
              </button>
            </div>

            <button
              onClick={verifyOtp}
              className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5"
              style={{
                background: "#171717", color: "#fff", fontWeight: 700, fontSize: "1rem",
                fontFamily: "'Bricolage Grotesque', sans-serif",
                opacity: otp.join("").length === OTP_LENGTH && !busy ? 1 : 0.45,
                boxShadow: otp.join("").length === OTP_LENGTH ? "0 6px 24px rgba(23,23,23,0.25)" : "none",
              }}
            >
              {busy ? "Verifying..." : "Verify & Continue"} <ArrowRight size={18} />
            </button>
            {status && <p style={{ fontSize: "0.78rem", color: /failed|invalid|expired|could/i.test(status) ? "#c0392b" : "#6b6b8a", marginTop: 12, textAlign: "center", lineHeight: 1.45 }}>{status}</p>}
          </>
        )}
      </div>

      <p style={{ textAlign: "center", padding: "16px", fontSize: "0.78rem", color: "#b0b0c8", lineHeight: 1.5 }}>
        By continuing, you agree to our{" "}
        <span style={{ color: "#171717", fontWeight: 600 }}>Terms of Service</span> and{" "}
        <span style={{ color: "#171717", fontWeight: 600 }}>Privacy Policy</span>
      </p>
    </div>
  );
}
