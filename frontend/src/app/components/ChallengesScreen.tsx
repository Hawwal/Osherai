import { useState } from "react";
import { Trophy, Flame, Star, Zap, ChevronRight } from "lucide-react";

const CHALLENGES = [
  { icon: "📅", title: "30 Day Challenge", desc: "Save a fixed amount every day for 30 consecutive days. Build the habit.", duration: "30 days", reward: "Silver Saver badge", progress: 14, total: 30, active: true },
  { icon: "📆", title: "52 Week Challenge", desc: "Week 1: ₦100. Week 2: ₦200. By week 52: ₦137,800 total saved!", duration: "52 weeks", reward: "Gold Achiever badge", progress: 6, total: 52, active: false },
  { icon: "⚡", title: "Custom Challenge", desc: "Set your own amount, frequency, and timeline. Fully personalized.", duration: "You decide", reward: "Custom badge", progress: 0, total: 0, active: false },
];

const BADGES = [
  { icon: "🔥", name: "6-Week Streak", earned: true },
  { icon: "💰", name: "First ₦100K", earned: true },
  { icon: "🎯", name: "Goal Setter", earned: true },
  { icon: "⚡", name: "Auto-Saver", earned: true },
  { icon: "🥈", name: "Silver Saver", earned: false },
  { icon: "🏆", name: "Gold Achiever", earned: false },
  { icon: "💎", name: "Diamond Saver", earned: false },
  { icon: "⭐", name: "All-Star", earned: false },
  { icon: "🌟", name: "Year Saver", earned: false },
];

export function ChallengesScreen({ comingSoon = false }: { comingSoon?: boolean }) {
  const [tab, setTab] = useState<"challenges" | "badges">("challenges");

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-28" style={{ background: "#f5f5fb", scrollbarWidth: "none" }}>
      {comingSoon && <div className="mx-5 mt-4 rounded-2xl px-4 py-3" style={{ background: "#fff3dc", color: "#b36a00", fontSize: "0.78rem", fontWeight: 800, border: "1px solid rgba(179,106,0,0.14)" }}>V2 feature · Coming soon</div>}
      <div className="px-5 pt-12 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <Trophy size={16} color="#f5c842" />
          <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#b36a00", textTransform: "uppercase", letterSpacing: "0.1em" }}>Gamified Saving</span>
        </div>
        <h1 className="font-display" style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0d0d14", letterSpacing: "-0.02em" }}>Challenges</h1>
        <p style={{ fontSize: "0.82rem", color: "#9a9ab8", marginTop: 3 }}>Turn saving into a streak you're proud of.</p>
      </div>

      {/* Tab toggle */}
      <div className="px-5 mb-5">
        <div className="rounded-2xl p-1" style={{ background: "#fff", boxShadow: "0 1px 5px rgba(0,0,0,0.06)" }}>
          <div className="flex">
            {(["challenges", "badges"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-2.5 rounded-xl transition-all"
                style={{
                  background: tab === t ? "#171717" : "transparent",
                  color: tab === t ? "#fff" : "#9a9ab8",
                  fontWeight: 700,
                  fontSize: "0.875rem",
                  boxShadow: tab === t ? "0 2px 10px rgba(23,23,23,0.2)" : "none",
                }}
              >
                {t === "challenges" ? "⚡ Challenges" : "🏅 Badges"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "challenges" ? (
        <div className="px-5 flex flex-col gap-4">
          {CHALLENGES.map((c) => (
            <div key={c.title} className="rounded-3xl overflow-hidden" style={{ background: "#fff", boxShadow: "0 3px 12px rgba(0,0,0,0.06)" }}>
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div style={{ width: 48, height: 48, borderRadius: 16, background: "#f5f5fb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem" }}>
                      {c.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-display" style={{ fontWeight: 700, fontSize: "1rem", color: "#0d0d14", letterSpacing: "-0.01em" }}>{c.title}</p>
                        {c.active && (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "#fff8ed" }}>
                            <Flame size={10} color="#b36a00" />
                            <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#b36a00" }}>Active</span>
                          </div>
                        )}
                      </div>
                      <p style={{ fontSize: "0.72rem", color: "#9a9ab8", marginTop: 1 }}>{c.duration}</p>
                    </div>
                  </div>
                </div>

                <p style={{ fontSize: "0.85rem", color: "#6b6b8a", lineHeight: 1.6, marginBottom: c.active ? 14 : 12 }}>{c.desc}</p>

                {c.active && c.total > 0 && (
                  <div className="mb-3">
                    <div className="flex justify-between mb-1.5">
                      <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#0d0d14" }}>Day {c.progress} of {c.total}</span>
                      <span style={{ fontSize: "0.72rem", fontFamily: "'DM Mono', monospace", color: "#9a9ab8" }}>{Math.round(c.progress / c.total * 100)}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: "#f0f0f9", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${c.progress / c.total * 100}%`, borderRadius: 99, background: "linear-gradient(90deg, #CCCCF7, #9898e8)" }} />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  <Star size={12} color="#f5c842" fill="#f5c842" />
                  <span style={{ fontSize: "0.75rem", color: "#6b6b8a" }}>Reward: <span style={{ fontWeight: 600, color: "#3d3d6e" }}>{c.reward}</span></span>
                </div>
              </div>

              <div className="px-5 py-3.5" style={{ borderTop: "1px solid rgba(0,0,0,0.05)", background: "#fafafa" }}>
                <button className="w-full py-2.5 rounded-xl flex items-center justify-center gap-1.5" style={{
                  background: c.active ? "#e8f5ec" : "#171717",
                  color: c.active ? "#2d7a47" : "#fff",
                  fontWeight: 700,
                  fontSize: "0.875rem",
                  boxShadow: c.active ? "none" : "0 3px 10px rgba(23,23,23,0.2)",
                }}>
                  {c.active ? "View Progress" : c.total === 0 ? <><Zap size={14} /> Create Custom Challenge</> : "Join Challenge"}
                  {!c.active && <ChevronRight size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5">
          <div className="grid grid-cols-3 gap-3">
            {BADGES.map((b) => (
              <div
                key={b.name}
                className="rounded-2xl p-3.5 flex flex-col items-center gap-2"
                style={{ background: b.earned ? "#fff" : "rgba(255,255,255,0.5)", boxShadow: b.earned ? "0 2px 8px rgba(0,0,0,0.07)" : "none", opacity: b.earned ? 1 : 0.55 }}
              >
                <span style={{ fontSize: "2rem", filter: b.earned ? "none" : "grayscale(1)" }}>{b.icon}</span>
                <p style={{ fontSize: "0.68rem", fontWeight: 600, color: b.earned ? "#0d0d14" : "#b0b0c8", textAlign: "center", lineHeight: 1.3 }}>{b.name}</p>
                {b.earned && (
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#e8f5ec", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="9" height="9" viewBox="0 0 9 9"><path d="M1.5 4.5l2 2 4-4" stroke="#2d7a47" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
