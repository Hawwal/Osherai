import { useState } from "react";
import { ChevronRight, User, Wallet, Bell, Shield, DollarSign, HelpCircle, LogOut } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import osherLogo from "../../imports/Osher_wallet_logo.png";
import { AuthProfile, WalletInfo, loadStoredAuthProfile, shortAddress } from "../lib/osher";

interface Props {
  userName?: string;
  walletInfo?: WalletInfo;
  displayMode?: "local" | "usdt";
  onDisplayModeChange?: (mode: "local" | "usdt") => void;
  onDisconnect?: () => void;
  onProfileUpdate?: (profile: AuthProfile) => void;
  onOpenChat?: () => void;
}

export function ProfileScreen({ userName, walletInfo, displayMode, onDisplayModeChange, onDisconnect, onProfileUpdate, onOpenChat }: Props = {}) {
  const [usd, setUsd] = useState(displayMode === "usdt");
  const [notifications, setNotifications] = useState(true);
  const [securityLock, setSecurityLock] = useState(true);
  const [profile, setProfile] = useState<AuthProfile>(() => loadStoredAuthProfile());
  const displayName = userName || "there";
  const walletLabel = walletInfo?.address
    ? `${walletInfo.walletType === "minipay" ? "MiniPay" : "MetaMask"} · ${shortAddress(walletInfo.address)}`
    : "No wallet connected";
  const contact = profile.contact || "Contact not set";
  const updateProfile = () => {
    const nextName = window.prompt("Your name", displayName === "there" ? "" : displayName);
    if (nextName === null) return;
    const nextContact = window.prompt("Email or phone", profile.contact || "");
    if (nextContact === null) return;
    const next = { ...profile, name: nextName.trim(), contact: nextContact.trim() };
    setProfile(next);
    onProfileUpdate?.(next);
  };
  const copyWallet = async () => {
    if (!walletInfo?.address) {
      window.alert("Connect MiniPay or MetaMask first.");
      return;
    }
    await navigator.clipboard?.writeText(walletInfo.address).catch(() => null);
    window.alert("Wallet address copied.");
  };
  const toggleCurrency = () => {
    const nextMode = displayMode === "usdt" ? "local" : "usdt";
    setUsd(nextMode === "usdt");
    onDisplayModeChange?.(nextMode);
  };
  const sections = [
    {
      title: "Account",
      items: [
        { icon: <User size={16} />, bg: "#f0f0f9", ic: "#5a5a8a", label: "Personal Details", sub: displayName === "there" ? "Profile name not set" : `${displayName} · ${contact}`, action: updateProfile },
        { icon: <Wallet size={16} />, bg: "#e8e8ff", ic: "#4040b0", label: "Connected Wallets", sub: walletLabel, action: copyWallet },
      ],
    },
    {
      title: "Preferences",
      items: [
        { icon: <Bell size={16} />, bg: "#fff3dc", ic: "#b36a00", label: "Notifications", sub: notifications ? "Weekly reminders enabled" : "Weekly reminders paused", action: () => setNotifications(!notifications) },
        { icon: <Shield size={16} />, bg: "#e8f5ec", ic: "#2d7a47", label: "Security", sub: securityLock ? "App lock reminder on" : "App lock reminder off", action: () => setSecurityLock(!securityLock) },
        { icon: <DollarSign size={16} />, bg: "#f0f0ff", ic: "#5a5a8a", label: "Currency Preferences", sub: displayMode === "usdt" ? "Showing USDT balances" : "Showing local currency", action: toggleCurrency },
      ],
    },
    {
      title: "Support",
      items: [
        { icon: <HelpCircle size={16} />, bg: "#f5f5fb", ic: "#9a9ab8", label: "Help & Support", sub: "Open Osher AI chat", action: onOpenChat },
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-28" style={{ background: "#f5f5fb", scrollbarWidth: "none" }}>
      {/* Profile card */}
      <div className="mx-4 mt-12 mb-5 rounded-3xl overflow-hidden" style={{ background: "#171717", boxShadow: "0 6px 24px rgba(23,23,23,0.22)" }}>
        <div className="p-5">
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", top: -10, right: -10, width: 100, height: 100, borderRadius: "50%", background: "rgba(204,204,247,0.07)" }} />
          </div>
          <div className="flex items-center gap-4 mb-5">
            <div style={{ width: 60, height: 60, borderRadius: 20, overflow: "hidden", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", flexShrink: 0 }}>
              <ImageWithFallback
                src={osherLogo}
                alt="Osher AI"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
            <div>
              <p className="font-display" style={{ fontWeight: 800, fontSize: "1.1rem", color: "#fff", letterSpacing: "-0.01em" }}>{displayName === "there" ? "Osher Saver" : displayName}</p>
              <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{walletLabel}</p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4caf75", display: "inline-block" }} />
                <span style={{ fontSize: "0.72rem", color: "#4caf75", fontWeight: 600 }}>Verified · 🔥 6-week streak</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { l: "Total Saved", v: "$1,240" },
              { l: "Active Goals", v: "3" },
              { l: "Member Since", v: "Jan '25" },
            ].map(({ l, v }) => (
              <div key={l} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 12, padding: "9px 12px" }}>
                <p style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{l}</p>
                <p className="font-display" style={{ fontSize: "0.9rem", fontWeight: 700, color: "#CCCCF7" }}>{v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Currency toggle */}
      <div className="mx-4 mb-4 rounded-2xl p-4 flex items-center justify-between" style={{ background: "#fff", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: "0.9rem", color: "#0d0d14" }}>Show USD Equivalent</p>
          <p style={{ fontSize: "0.75rem", color: "#9a9ab8", marginTop: 1 }}>Display all balances in USD alongside local currency</p>
        </div>
        <button
          onClick={toggleCurrency}
          className="flex-shrink-0"
          style={{
            width: 48, height: 28, borderRadius: 14,
            background: usd ? "#171717" : "#e0e0f0",
            position: "relative",
            transition: "background 0.2s",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 3,
              left: usd ? 23 : 3,
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
              transition: "left 0.2s",
            }}
          />
        </button>
      </div>

      {/* Settings sections */}
      {sections.map((s) => (
        <div key={s.title} className="px-4 mb-4">
          <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "#b0b0c8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, paddingLeft: 4 }}>{s.title}</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
            {s.items.map((item, i) => (
              <button
                key={item.label}
                onClick={item.action}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
                style={{ borderBottom: i < s.items.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none" }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 11, background: item.bg, color: item.ic, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {item.icon}
                </div>
                <div className="flex-1">
                  <p style={{ fontWeight: 600, fontSize: "0.875rem", color: "#0d0d14" }}>{item.label}</p>
                  <p style={{ fontSize: "0.72rem", color: "#9a9ab8", marginTop: 1 }}>{item.sub}</p>
                </div>
                <ChevronRight size={15} color="#d0d0e0" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Sign out */}
      <div className="px-4 mt-1">
        <button onClick={onDisconnect} className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2" style={{ background: "#fff5f5", color: "#c0392b", fontWeight: 600, fontSize: "0.875rem", border: "1px solid rgba(192,57,43,0.12)" }}>
          <LogOut size={15} /> Sign Out
        </button>
      </div>

      <p style={{ textAlign: "center", fontSize: "0.72rem", color: "#c8c8d8", padding: "20px 0 8px" }}>
        Osher Finance · v1.0.0 · <span style={{ color: "#9898e8" }}>osher.finance</span>
      </p>
    </div>
  );
}
