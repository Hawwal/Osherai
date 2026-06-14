import { Users, Plus, Crown, ChevronRight, TrendingUp } from "lucide-react";

const GROUPS = [
  { name: "Lagos Savers 💪", members: 8, target: "₦2,000,000", raised: "₦1,340,000", pct: 67, myPct: 12.5, emoji: "🏙️", status: "Active" },
  { name: "Afrobeats Trip ✈️", members: 4, target: "$2,000", raised: "$1,120", pct: 56, myPct: 25, emoji: "🎶", status: "Active" },
];

export function SocialScreen({ comingSoon = false }: { comingSoon?: boolean }) {
  return (
    <div className="flex flex-col h-full overflow-y-auto pb-28" style={{ background: "#f5f5fb", scrollbarWidth: "none" }}>
      {comingSoon && <div className="mx-5 mt-4 rounded-2xl px-4 py-3" style={{ background: "#fff3dc", color: "#b36a00", fontSize: "0.78rem", fontWeight: 800, border: "1px solid rgba(179,106,0,0.14)" }}>V2 feature · Coming soon</div>}
      <div className="px-5 pt-12 pb-5 flex items-center justify-between">
        <div>
          <h1 className="font-display" style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0d0d14", letterSpacing: "-0.02em" }}>Group Savings</h1>
          <p style={{ fontSize: "0.82rem", color: "#9a9ab8", marginTop: 2 }}>Save together, reach goals faster.</p>
        </div>
        <button className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl" style={{ background: "#171717", color: "#fff", fontWeight: 700, fontSize: "0.8rem", boxShadow: "0 3px 12px rgba(23,23,23,0.22)" }}>
          <Plus size={14} /> Create
        </button>
      </div>

      {/* Groups */}
      <div className="px-5 mb-5">
        <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "#9a9ab8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>My Groups</p>
        <div className="flex flex-col gap-4">
          {GROUPS.map((g) => (
            <div key={g.name} className="rounded-3xl overflow-hidden" style={{ background: "#fff", boxShadow: "0 3px 14px rgba(0,0,0,0.07)" }}>
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div style={{ width: 48, height: 48, borderRadius: 16, background: "#f5f5fb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem" }}>
                      {g.emoji}
                    </div>
                    <div>
                      <p className="font-display" style={{ fontWeight: 700, fontSize: "1rem", color: "#0d0d14", letterSpacing: "-0.01em" }}>{g.name}</p>
                      <div className="flex items-center gap-1.5">
                        <Users size={11} color="#b0b0c8" />
                        <span style={{ fontSize: "0.72rem", color: "#9a9ab8" }}>{g.members} members</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Crown size={14} color="#f5c842" />
                    <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#2d7a47", background: "#e8f5ec", padding: "3px 8px", borderRadius: 6 }}>{g.status}</span>
                  </div>
                </div>

                {/* Progress */}
                <div className="mb-3">
                  <div className="flex justify-between mb-1.5">
                    <span style={{ fontSize: "0.72rem", color: "#6b6b8a" }}>Group raised: <span style={{ fontWeight: 700, color: "#0d0d14", fontFamily: "'DM Mono', monospace" }}>{g.raised}</span></span>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#5a5a8a", fontFamily: "'DM Mono', monospace" }}>{g.pct}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: "#f0f0f9", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${g.pct}%`, borderRadius: 99, background: "linear-gradient(90deg, #CCCCF7, #9898e8)" }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div style={{ background: "#f5f5fb", borderRadius: 12, padding: "9px 12px" }}>
                    <p style={{ fontSize: "0.6rem", color: "#b0b0c8", textTransform: "uppercase", letterSpacing: "0.08em" }}>Target</p>
                    <p className="font-display" style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0d0d14" }}>{g.target}</p>
                  </div>
                  <div style={{ background: "#f0f0ff", borderRadius: 12, padding: "9px 12px" }}>
                    <p style={{ fontSize: "0.6rem", color: "#9898e8", textTransform: "uppercase", letterSpacing: "0.08em" }}>Your share</p>
                    <p className="font-display" style={{ fontSize: "0.85rem", fontWeight: 700, color: "#4040b0" }}>{g.myPct}%</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between px-5 py-3.5" style={{ borderTop: "1px solid rgba(0,0,0,0.05)", background: "#fafafa" }}>
                <div className="flex items-center gap-1.5">
                  <TrendingUp size={12} color="#2d7a47" />
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#2d7a47" }}>{g.pct}% funded</span>
                </div>
                <button className="flex items-center gap-1" style={{ fontSize: "0.8rem", fontWeight: 700, color: "#3d3d6e" }}>
                  Contribute <ChevronRight size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="px-5">
        <button className="w-full py-4 rounded-2xl flex items-center justify-center gap-2" style={{ background: "#CCCCF7", color: "#171717", fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: "0.95rem" }}>
          <Users size={18} /> Create a Group Goal
        </button>
      </div>
    </div>
  );
}
