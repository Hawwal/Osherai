import { Home, Target, BookOpen, User } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import osherLogo from "../../imports/Osher_wallet_logo.png";

type Tab = "home" | "goals" | "chat" | "tips" | "profile";

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "goals", label: "Goals" },
  { id: "chat", label: "AI Chat" },
  { id: "tips", label: "Tips" },
  { id: "profile", label: "Profile" },
];

const ICONS: Record<string, React.ElementType> = {
  home: Home,
  goals: Target,
  tips: BookOpen,
  profile: User,
};

export function BottomNav({ active, onChange }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        background: "rgba(255,255,255,0.97)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderTop: "1px solid rgba(0,0,0,0.07)",
        paddingBottom: "env(safe-area-inset-bottom, 6px)",
        zIndex: 100,
      }}
    >
      <div
        className="flex items-center"
        style={{ paddingTop: 6, paddingBottom: 4 }}
      >
        {TABS.map(({ id, label }) => {
          const isActive = active === id;
          const isChat = id === "chat";
          const Icon = ICONS[id];

          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className="flex-1 flex flex-col items-center"
              style={{ position: "relative", paddingTop: isChat ? 0 : 4, paddingBottom: 2 }}
            >
              {isChat ? (
                /* Elevated logo pill for AI Chat */
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 18,
                    overflow: "hidden",
                    background: isActive ? "#171717" : "#fff",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: -20,
                    boxShadow: isActive
                      ? "0 4px 18px rgba(23,23,23,0.32)"
                      : "0 3px 14px rgba(152,152,232,0.28), 0 0 0 2px rgba(204,204,247,0.6)",
                    transition: "all 0.22s cubic-bezier(0.22,1,0.36,1)",
                    border: isActive ? "2px solid #171717" : "2px solid rgba(204,204,247,0.8)",
                  }}
                >
                  <div style={{ width: "72%", height: "72%" }}>
                    <ImageWithFallback
                      src={osherLogo}
                      alt="Osher AI Chat"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        filter: isActive ? "brightness(0) invert(1)" : "none",
                        transition: "filter 0.22s ease",
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    width: 38,
                    height: 30,
                    borderRadius: 10,
                    background: isActive ? "#f0f0f9" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background 0.2s",
                  }}
                >
                  <Icon
                    size={20}
                    color={isActive ? "#171717" : "#b0b0c8"}
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                </div>
              )}

              <span
                style={{
                  fontSize: "0.57rem",
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? (isChat ? "#171717" : "#171717") : "#b0b0c8",
                  marginTop: isChat ? 3 : 2,
                  transition: "color 0.2s",
                  letterSpacing: "0.01em",
                }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
