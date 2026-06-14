import { useState } from "react";
import { ArrowRight, Send } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import osherLogo from "../../imports/Osher_wallet_logo.png";

interface Props {
  onContinue: () => void;
}

const EXAMPLES = [
  { emoji: "🏠", text: "Save ₦500,000 for rent by December." },
  { emoji: "🎓", text: "Help me save $200 for school fees." },
  { emoji: "🛡️", text: "I want an emergency fund." },
];

export function OnboardingScreen({ onContinue }: Props) {
  const [input, setInput] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [typing, setTyping] = useState(false);

  const triggerAI = (text: string) => {
    setInput(text);
    setAiReply("");
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setAiReply("Got it! To reach your goal, save ₦20,833 weekly. I'll remind you every Monday. 🎯");
    }, 1100);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header band */}
      <div
        className="relative px-6 pt-14 pb-10 overflow-hidden"
        style={{ background: "#CCCCF7" }}
      >
        <div style={{ position: "absolute", top: -50, right: -50, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,0.22)" }} />
        <div style={{ position: "absolute", bottom: -30, left: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.14)" }} />

        <div className="relative z-10">
          {/* Logo lockup */}
          <div className="flex items-center gap-2.5 mb-5">
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                overflow: "hidden",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 8px rgba(23,23,23,0.15)",
                flexShrink: 0,
              }}
            >
              <ImageWithFallback
                src={osherLogo}
                alt="Osher AI"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
            <span
              className="font-display"
              style={{ fontSize: "0.85rem", fontWeight: 700, color: "#171717", letterSpacing: "-0.01em" }}
            >
              Osher AI
            </span>
          </div>

          <h1
            className="font-display"
            style={{
              fontSize: "2rem",
              fontWeight: 800,
              color: "#171717",
              lineHeight: 1.1,
              letterSpacing: "-0.025em",
            }}
          >
            What are you<br />saving for?
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#4a4a7a", marginTop: 8, lineHeight: 1.5 }}>
            Describe your goal in plain language — your AI coach builds the plan.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5" style={{ scrollbarWidth: "none" }}>
        {/* Input area */}
        <div
          className="rounded-2xl border overflow-hidden mb-4"
          style={{ borderColor: "rgba(0,0,0,0.09)", background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
        >
          <textarea
            className="w-full resize-none outline-none px-4 pt-4 pb-2"
            rows={3}
            placeholder={`e.g. "Save ₦500,000 for rent by December"`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ fontSize: "0.95rem", color: "#0d0d14", fontFamily: "inherit", background: "transparent", lineHeight: 1.6 }}
          />
          <div className="flex items-center justify-between px-4 pb-3 pt-1">
            <span style={{ fontSize: "0.72rem", color: "#b0b0c8" }}>
              {input.length > 0 ? `${input.length} chars` : "Type your savings goal"}
            </span>
            <button
              onClick={() => input.trim() && triggerAI(input)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                borderRadius: 10,
                background: input.trim() ? "#171717" : "#e8e8f0",
                color: input.trim() ? "#fff" : "#9a9ab8",
                fontSize: "0.8rem", fontWeight: 600, transition: "all 0.2s",
              }}
            >
              <Send size={13} />
              Analyze
            </button>
          </div>
        </div>

        {/* Examples */}
        <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "#9a9ab8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
          Try an example
        </p>
        <div className="flex flex-col gap-2.5 mb-5">
          {EXAMPLES.map(({ emoji, text }) => (
            <button
              key={text}
              onClick={() => triggerAI(text)}
              className="flex items-center gap-3 text-left px-4 py-3.5 rounded-2xl border transition-all active:scale-98"
              style={{ background: "#fff", borderColor: "rgba(0,0,0,0.07)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
            >
              <span style={{ fontSize: "1.25rem", flexShrink: 0 }}>{emoji}</span>
              <span style={{ fontSize: "0.875rem", color: "#3d3d6e", fontWeight: 500, lineHeight: 1.4 }}>
                "{text}"
              </span>
            </button>
          ))}
        </div>

        {/* AI Response card */}
        {(typing || aiReply) && (
          <div
            className="rounded-2xl overflow-hidden mb-5"
            style={{ background: "#171717", boxShadow: "0 4px 20px rgba(23,23,23,0.22)" }}
          >
            <div
              className="flex items-center gap-2.5 px-4 py-3 border-b"
              style={{ borderColor: "rgba(255,255,255,0.08)" }}
            >
              {/* Logo as AI avatar */}
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  overflow: "hidden",
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <ImageWithFallback
                  src={osherLogo}
                  alt="Osher AI"
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              </div>
              <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "rgba(204,204,247,0.75)", letterSpacing: "0.06em" }}>
                OSHER AI
              </span>
            </div>
            <div className="px-4 py-4">
              {typing ? (
                <div className="flex gap-1.5 items-center py-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: 7, height: 7, borderRadius: "50%", background: "#CCCCF7",
                        animation: `typingBounce 0.9s ${i * 0.15}s infinite`,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: "0.95rem", color: "#fff", lineHeight: 1.65, fontWeight: 400 }}>
                  {aiReply}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="px-5 pb-8 pt-2">
        <button
          onClick={onContinue}
          className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 transition-all"
          style={{
            background: "#171717",
            color: "#fff",
            fontWeight: 700,
            fontSize: "1rem",
            fontFamily: "'Bricolage Grotesque', sans-serif",
            letterSpacing: "-0.01em",
            opacity: aiReply ? 1 : 0.5,
            boxShadow: aiReply ? "0 6px 24px rgba(23,23,23,0.25)" : "none",
          }}
        >
          Continue <ArrowRight size={18} strokeWidth={2.5} />
        </button>
      </div>

      <style>{`
        @keyframes typingBounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-5px); } }
      `}</style>
    </div>
  );
}
