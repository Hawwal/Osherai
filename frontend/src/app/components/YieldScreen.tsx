import { TrendingUp, Zap, ChevronRight, Info, Lock } from "lucide-react";

export function YieldScreen({ comingSoon = false }: { comingSoon?: boolean }) {
  return (
    <div className="flex flex-col h-full overflow-y-auto pb-28" style={{ background: "#f5f5fb", scrollbarWidth: "none" }}>
      {comingSoon && <div className="mx-5 mt-4 rounded-2xl px-4 py-3" style={{ background: "#fff3dc", color: "#b36a00", fontSize: "0.78rem", fontWeight: 800, border: "1px solid rgba(179,106,0,0.14)" }}>V2 feature · Coming soon</div>}
      <div className="px-5 pt-12 pb-5">
        <h1 className="font-display" style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0d0d14", letterSpacing: "-0.02em", lineHeight: 1.15 }}>
          Yield Comes<br />After Discipline
        </h1>
        <p style={{ fontSize: "0.85rem", color: "#9a9ab8", marginTop: 6 }}>First, build the habit. Later, eligible idle savings can earn yield only after explicit opt-in.</p>
      </div>

      {/* Hero yield card */}
      <div className="mx-4 mb-5 rounded-3xl overflow-hidden" style={{ background: "#171717", boxShadow: "0 8px 28px rgba(23,23,23,0.25)" }}>
        <div style={{ padding: "22px 22px 18px", position: "relative" }}>
          <div style={{ position: "absolute", top: -20, right: -20, width: 120, height: 120, borderRadius: "50%", background: "rgba(204,204,247,0.07)" }} />

          <p style={{ fontSize: "0.68rem", color: "rgba(204,204,247,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4, position: "relative", zIndex: 1 }}>V2 Preview</p>
          <div className="flex items-end gap-2 mb-5 relative z-10">
            <p className="font-display" style={{ fontSize: "3rem", fontWeight: 800, color: "#fff", lineHeight: 1, letterSpacing: "-0.03em" }}>Off</p>
            <p className="font-display" style={{ fontSize: "1.1rem", fontWeight: 700, color: "#CCCCF7", marginBottom: 8 }}>until enabled</p>
            <div className="flex items-center gap-1 ml-1 mb-3" style={{ background: "rgba(76,175,117,0.2)", padding: "3px 8px", borderRadius: 6 }}>
              <TrendingUp size={11} color="#4caf75" />
              <span style={{ fontSize: "0.7rem", color: "#4caf75", fontWeight: 700 }}>Coming soon</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 relative z-10">
            {[
              { l: "Habit First", v: "Goals" },
              { l: "Yield Later", v: "Opt-in" },
            ].map(({ l, v }) => (
              <div key={l} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 12, padding: "10px 14px" }}>
                <p style={{ fontSize: "0.62rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{l}</p>
                <p className="font-display" style={{ fontSize: "1rem", fontWeight: 700, color: "#fff" }}>{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <button className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2" style={{ background: "#CCCCF7", color: "#171717", fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: "0.95rem" }}>
            <Zap size={16} fill="#171717" /> Coming Soon
          </button>
        </div>
      </div>

      {/* Opportunities */}
      <div className="px-5 mb-4">
        <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "#9a9ab8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Opportunities</p>
        <div className="flex flex-col gap-3">
          {[
            { title: "Stable Savings Yield Preview", apy: "Preview", risk: "Risk review", desc: "Optional yield path for idle savings after user opt-in and risk review.", tag: "Preview", tagC: "#2d7a47", tagBg: "#e8f5ec" },
            { title: "Yield Opportunity Preview", apy: "Preview", risk: "Risk review", desc: "Higher-return products require extra risk explanation and user approval.", tag: "Preview", tagC: "#4040b0", tagBg: "#e8e8ff" },
          ].map((op) => (
            <div key={op.title} className="rounded-2xl overflow-hidden" style={{ background: "#fff", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ fontSize: "0.65rem", fontWeight: 700, color: op.tagC, background: op.tagBg, padding: "3px 7px", borderRadius: 5 }}>{op.tag}</span>
                      <span style={{ fontSize: "0.65rem", color: "#b0b0c8" }}>{op.risk}</span>
                    </div>
                    <p className="font-display" style={{ fontWeight: 700, fontSize: "0.95rem", color: "#0d0d14", letterSpacing: "-0.01em" }}>{op.title}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: "0.62rem", color: "#b0b0c8", textTransform: "uppercase" }}>Status</p>
                    <p className="font-display" style={{ fontSize: "1.4rem", fontWeight: 800, color: "#2d7a47", lineHeight: 1 }}>{op.apy}</p>
                  </div>
                </div>
                <p style={{ fontSize: "0.82rem", color: "#6b6b8a", lineHeight: 1.55 }}>{op.desc}</p>
              </div>
              <div className="px-4 py-3 flex justify-end" style={{ borderTop: "1px solid rgba(0,0,0,0.05)", background: "#fafafa" }}>
                <button className="flex items-center gap-1" style={{ fontSize: "0.8rem", fontWeight: 700, color: "#3d3d6e" }}>
                  Learn more <ChevronRight size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Education note */}
      <div className="mx-5 rounded-2xl p-4 flex gap-3" style={{ background: "#fff", border: "1px solid rgba(204,204,247,0.5)" }}>
        <div style={{ width: 28, height: 28, borderRadius: 9, background: "#f0f0ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Info size={13} color="#9898e8" />
        </div>
        <p style={{ fontSize: "0.8rem", color: "#5a5a8a", lineHeight: 1.6 }}>
          Yield is not active in v1. Osher will never move funds into yield without explicit opt-in, clear risk explanation, and wallet approval.
        </p>
      </div>

      <div className="flex items-center justify-center gap-1.5 mt-4 mx-5">
        <Lock size={12} color="#b0b0c8" />
        <p style={{ fontSize: "0.72rem", color: "#b0b0c8" }}>Non-custodial · Opt-in only · Your keys, your funds</p>
      </div>
    </div>
  );
}
