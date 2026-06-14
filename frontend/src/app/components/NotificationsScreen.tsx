import { ArrowLeft, TrendingUp, Sparkles, AlertCircle, Target, Bell } from "lucide-react";

interface Props {
  onBack: () => void;
}

const NOTIFS = [
  { type: "success", icon: <TrendingUp size={15} color="#2d7a47" />, ibg: "#e8f5ec", title: "Ahead of schedule! 🎉", body: "You've saved ₦10,000 more than your weekly target. You're on fire.", time: "2h ago", unread: true },
  { type: "ai", icon: <Sparkles size={15} color="#9898e8" />, ibg: "#f0f0ff", title: "Agent saved $2.40 today", body: "Your savings agent executed round-ups and accrued interest automatically.", time: "4h ago", unread: true },
  { type: "warn", icon: <AlertCircle size={15} color="#b36a00" />, ibg: "#fff3dc", title: "3 weeks to your goal", body: "Only 3 weeks remain on your Rent Fund. Top up ₦5,000 extra this week to stay safe.", time: "Yesterday", unread: false },
  { type: "ai", icon: <Sparkles size={15} color="#9898e8" />, ibg: "#f0f0ff", title: "New personal record 🏆", body: "You saved over ₦200,000 this month — your highest monthly savings ever.", time: "2 days ago", unread: false },
  { type: "info", icon: <Target size={15} color="#5a5a8a" />, ibg: "#f5f5fb", title: "Weekly summary", body: "₦20,833 deposited · 0 withdrawals · 1 round-up triggered · 6-week streak extended.", time: "3 days ago", unread: false },
  { type: "warn", icon: <AlertCircle size={15} color="#b36a00" />, ibg: "#fff3dc", title: "Travel Fund needs attention", body: "Your Travel Fund is 8% behind schedule. Add ₦3,600 this week to close the gap.", time: "4 days ago", unread: false },
];

export function NotificationsScreen({ onBack }: Props) {
  const unread = NOTIFS.filter((n) => n.unread).length;

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-24" style={{ background: "#f5f5fb", scrollbarWidth: "none" }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-5 flex items-center gap-3">
        <button onClick={onBack} style={{ width: 38, height: 38, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 6px rgba(0,0,0,0.08)" }}>
          <ArrowLeft size={17} color="#0d0d14" />
        </button>
        <div className="flex-1">
          <h1 className="font-display" style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0d0d14", letterSpacing: "-0.01em" }}>Notifications</h1>
          {unread > 0 && <p style={{ fontSize: "0.75rem", color: "#9a9ab8" }}>{unread} new</p>}
        </div>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
          <Bell size={16} color="#6b6b8a" />
        </div>
      </div>

      <div className="px-4 flex flex-col gap-2.5">
        {unread > 0 && (
          <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "#b0b0c8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>New</p>
        )}

        {NOTIFS.map((n, i) => {
          const isFirstRead = !n.unread && (i === 0 || NOTIFS[i - 1].unread);
          return (
            <div key={i}>
              {isFirstRead && (
                <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "#b0b0c8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, marginTop: 6 }}>Earlier</p>
              )}
              <div
                className="rounded-2xl p-4 flex gap-3"
                style={{
                  background: n.unread ? "#fff" : "rgba(255,255,255,0.65)",
                  boxShadow: n.unread ? "0 2px 12px rgba(0,0,0,0.07)" : "none",
                  border: n.unread ? "1px solid rgba(204,204,247,0.5)" : "1px solid rgba(0,0,0,0.04)",
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 11, background: n.ibg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                  {n.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <p className="font-display" style={{ fontWeight: 700, fontSize: "0.875rem", color: "#0d0d14", lineHeight: 1.25, letterSpacing: "-0.01em" }}>{n.title}</p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {n.unread && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#CCCCF7", display: "inline-block", border: "1.5px solid #9898e8" }} />}
                      <span style={{ fontSize: "0.65rem", color: "#b0b0c8" }}>{n.time}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "#6b6b8a", lineHeight: 1.55 }}>{n.body}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
