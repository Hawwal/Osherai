import { useEffect, useState } from "react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import osherLogo from "../../imports/Osher_wallet_logo.png";

interface Props {
  onDone: () => void;
}

export function SplashScreen({ onDone }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 80);
    const t2 = setTimeout(onDone, 2900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  return (
    <div
      className="flex flex-col items-center justify-center h-full relative overflow-hidden"
      style={{ background: "#CCCCF7" }}
    >
      {/* Decorative background blobs */}
      <div style={{ position: "absolute", top: -90, right: -90, width: 300, height: 300, borderRadius: "50%", background: "rgba(255,255,255,0.2)" }} />
      <div style={{ position: "absolute", bottom: -70, left: -70, width: 240, height: 240, borderRadius: "50%", background: "rgba(255,255,255,0.13)" }} />
      <div style={{ position: "absolute", top: "38%", left: -48, width: 130, height: 130, borderRadius: "50%", background: "rgba(255,255,255,0.09)" }} />
      <div style={{ position: "absolute", bottom: "28%", right: -24, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.11)" }} />

      {/* Main content */}
      <div
        className="flex flex-col items-center gap-7 relative z-10"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(24px)",
          transition: "opacity 0.75s cubic-bezier(0.22,1,0.36,1), transform 0.75s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 28,
            overflow: "hidden",
            boxShadow: "0 20px 48px rgba(23,23,23,0.22), 0 4px 16px rgba(23,23,23,0.12)",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ImageWithFallback
            src={osherLogo}
            alt="Osher AI logo"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>

        {/* Brand text */}
        <div className="flex flex-col items-center gap-1.5">
          <h1
            className="font-display"
            style={{
              fontSize: "2.6rem",
              fontWeight: 800,
              color: "#171717",
              letterSpacing: "-0.03em",
              lineHeight: 1,
            }}
          >
            Osher AI
          </h1>
          <p
            style={{
              fontSize: "0.68rem",
              color: "#171717",
              opacity: 0.4,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            by Osher Finance
          </p>
        </div>

        {/* Taglines */}
        <div
          className="flex flex-col items-center gap-1"
          style={{
            opacity: visible ? 1 : 0,
            transition: "opacity 0.6s ease 0.3s",
          }}
        >
          <p
            className="font-display"
            style={{
              fontSize: "1.15rem",
              fontWeight: 600,
              color: "#171717",
              letterSpacing: "-0.015em",
            }}
          >
            Your AI Savings Coach
          </p>
          <p style={{ fontSize: "0.875rem", color: "#3d3d6e", fontWeight: 400 }}>
            Save smarter. Reach goals faster.
          </p>
        </div>
      </div>

      {/* Loading dots */}
      <div
        style={{
          position: "absolute",
          bottom: 52,
          display: "flex",
          gap: 7,
          opacity: visible ? 1 : 0,
          transition: "opacity 0.5s ease 0.5s",
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: i === 1 ? 22 : 7,
              height: 7,
              borderRadius: 4,
              background: "#171717",
              opacity: 0.3,
              animation: `splashDot 1.5s ${i * 0.18}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes splashDot {
          0%, 80%, 100% { opacity: 0.18; transform: scaleY(0.75); }
          40% { opacity: 0.65; transform: scaleY(1.2); }
        }
      `}</style>
    </div>
  );
}
