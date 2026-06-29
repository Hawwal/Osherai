import { ArrowLeft, TrendingUp, Sparkles, AlertCircle, Target, Bell } from "lucide-react";
import { ActivityItem, SavingsGoal } from "../lib/osher";

interface Props {
  onBack: () => void;
  activity?: ActivityItem[];
  goals?: SavingsGoal[];
}

function timeAgo(value?: string) {
  const ts = value ? new Date(value).getTime() : Date.now();
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  const days = Math.floor(hrs / 24);
  return days + "d ago";
}

function iconFor(type?: string) {
  const raw = String(type || "").toLowerCase();
  if (raw.includes("deposit") || raw.includes("round")) return { icon: <TrendingUp size={15} color="#2d7a47" />, ibg: "#e8f5ec" };
  if (raw.includes("warn") || raw.includes("behind")) return { icon: <AlertCircle size={15} color="#b36a00" />, ibg: "#fff3dc" };
  if (raw.includes("goal")) return { icon: <Target size={15} color="#5a5a8a" />, ibg: "#f5f5fb" };
  return { icon: <Sparkles size={15} color="#9898e8" />, ibg: "#f0f0ff" };
}

export function NotificationsScreen({ onBack, activity = [], goals = [] }: Props) {
  const generated = activity.slice(0, 20).map((item, index) => {
    const icon = iconFor(item.type);
    return {
      ...icon,
      title: item.type ? item.type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Osher update",
      body: item.message || "Your savings activity was updated.",
      time: timeAgo(item.createdAt || item.created_at),
      unread: index < 2,
    };
  });

  const needsAttention = goals
    .filter(goal => goal.status === "active" && Number(goal.daysRemaining || 0) <= 14 && Number(goal.progressPercent || 0) < 100)
    .map(goal => ({
      ...iconFor("warn"),
      title: goal.name + " needs attention",
      body: `${Number(goal.daysRemaining || 0)} days left and ${Number(goal.progressPercent || 0).toFixed(0)}% saved. Consider a small top-up this week.`,
      time: "Now",
      unread: true,
    }));

  const notifications = [...needsAttention, ...generated];
  const unread = notifications.filter(n => n.unread).length;

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-24" style={{ background: "#f5f5fb", scrollbarWidth: "none" }}>
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
        {notifications.length === 0 && (
          <div className="rounded-2xl p-5" style={{ background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <p className="font-display" style={{ fontWeight: 800, color: "#0d0d14" }}>No notifications yet</p>
            <p style={{ fontSize: "0.84rem", color: "#6b6b8a", lineHeight: 1.55, marginTop: 6 }}>Goal updates, nudges, deposits, and round-ups will appear here.</p>
          </div>
        )}

        {notifications.map((n, i) => (
          <div key={i} className="rounded-2xl p-4 flex gap-3" style={{ background: n.unread ? "#fff" : "rgba(255,255,255,0.65)", boxShadow: n.unread ? "0 2px 12px rgba(0,0,0,0.07)" : "none", border: n.unread ? "1px solid rgba(204,204,247,0.5)" : "1px solid rgba(0,0,0,0.04)" }}>
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
        ))}
      </div>
    </div>
  );
}
