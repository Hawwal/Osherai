import { useState } from "react";
import { Check, ChevronRight, User, Wallet, Bell, Shield, DollarSign, HelpCircle, LogOut, Copy, X } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import lionIcon from "../../imports/profile-icons/lion.png";
import wolfIcon from "../../imports/profile-icons/wolf.png";
import pandaIcon from "../../imports/profile-icons/panda.png";
import rabbitIcon from "../../imports/profile-icons/rabbit.png";
import dogIcon from "../../imports/profile-icons/dog.png";
import hamsterIcon from "../../imports/profile-icons/hamster.png";
import elephantIcon from "../../imports/profile-icons/elephant.png";
import koalaIcon from "../../imports/profile-icons/koala.png";
import foxIcon from "../../imports/profile-icons/fox.png";
import hedgehogIcon from "../../imports/profile-icons/hedgehog.png";
import monkeyIcon from "../../imports/profile-icons/monkey.png";
import turtleIcon from "../../imports/profile-icons/turtle.png";
import dolphinIcon from "../../imports/profile-icons/dolphin.png";
import parrotIcon from "../../imports/profile-icons/parrot.png";
import { AuthProfile, DashboardStats, WalletBalances, WalletInfo, formatNumber, loadStoredAuthProfile, walletDisplayName, walletReference } from "../lib/osher";

type AvatarOption = { id: string; label: string; image: string; bg: string; color?: string; text?: string };

interface Props {
  userName?: string;
  walletInfo?: WalletInfo;
  displayMode?: "local" | "usdt";
  dashboard?: DashboardStats;
  walletBalances?: WalletBalances;
  onDisplayModeChange?: (mode: "local" | "usdt") => void;
  onDisconnect?: () => void;
  onProfileUpdate?: (profile: AuthProfile) => void;
  onOpenChat?: () => void;
  onAuthRequired?: () => void;
  onConnectWallet?: () => void;
  isAuthenticated?: boolean;
}

export function ProfileScreen({ userName, walletInfo, displayMode, dashboard = {}, walletBalances = {}, onDisplayModeChange, onDisconnect, onProfileUpdate, onOpenChat, onAuthRequired, onConnectWallet, isAuthenticated = false }: Props = {}) {
  const [usd, setUsd] = useState(displayMode === "usdt");
  const [notifications, setNotifications] = useState(true);
  const [securityLock, setSecurityLock] = useState(true);
  const [profile, setProfile] = useState<AuthProfile>(() => loadStoredAuthProfile());
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(profile.name || (userName === "there" ? "" : userName || ""));
  const [draftContact, setDraftContact] = useState(profile.contact || "");
  const [status, setStatus] = useState("");
  const [selectedIcon, setSelectedIcon] = useState(profile.avatarIcon || "lion");
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const displayName = isAuthenticated ? (userName || "there") : "Guest explorer";
  const walletLabel = walletDisplayName(walletInfo);
  const walletHint = walletReference(walletInfo?.address);
  const contact = isAuthenticated ? (profile.contact || "Contact not set") : "Sign up to save your profile";
  const avatarOptions: AvatarOption[] = [
    { id: "lion", label: "Lion", image: lionIcon, bg: "#fff0ea" },
    { id: "wolf", label: "Wolf", image: wolfIcon, bg: "#f0edff" },
    { id: "panda", label: "Panda", image: pandaIcon, bg: "#fff0f0" },
    { id: "rabbit", label: "Rabbit", image: rabbitIcon, bg: "#f0edff" },
    { id: "dog", label: "Dog", image: dogIcon, bg: "#fff6d6" },
    { id: "hamster", label: "Hamster", image: hamsterIcon, bg: "#e8f5ff" },
    { id: "elephant", label: "Elephant", image: elephantIcon, bg: "#f0edff" },
    { id: "koala", label: "Koala", image: koalaIcon, bg: "#f0edff" },
    { id: "fox", label: "Fox", image: foxIcon, bg: "#e8f5ff" },
    { id: "hedgehog", label: "Hedgehog", image: hedgehogIcon, bg: "#fff6d6" },
    { id: "monkey", label: "Monkey", image: monkeyIcon, bg: "#e8f5ff" },
    { id: "turtle", label: "Turtle", image: turtleIcon, bg: "#e8f5ff" },
    { id: "dolphin", label: "Dolphin", image: dolphinIcon, bg: "#e8f5ff" },
    { id: "parrot", label: "Parrot", image: parrotIcon, bg: "#f0edff" },
  ];
  const activeAvatar = avatarOptions.find(item => item.id === selectedIcon) || avatarOptions[0];

  const updateProfile = () => {
    const next = { ...profile, name: draftName.trim(), contact: draftContact.trim(), avatarIcon: activeAvatar.id };
    setProfile(next);
    onProfileUpdate?.(next);
    setEditing(false);
    setStatus("Profile saved.");
  };
  const openWalletMenu = () => {
    if (!walletInfo?.address) {
      setStatus("Connect MiniPay or MetaMask first.");
      onConnectWallet?.();
      return;
    }
    setWalletMenuOpen(true);
  };
  const copyWallet = async () => {
    if (!walletInfo?.address) {
      setStatus("Connect MiniPay or MetaMask first.");
      return;
    }
    await navigator.clipboard?.writeText(walletInfo.address).catch(() => null);
    setWalletMenuOpen(false);
    setStatus("Wallet address copied.");
  };
  const disconnectFromMenu = () => {
    setWalletMenuOpen(false);
    onDisconnect?.();
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
        { icon: <User size={16} />, bg: "#f0f0f9", ic: "#5a5a8a", label: "Personal Details", sub: displayName === "there" ? "Profile name not set" : `${displayName} · ${contact}`, action: () => setEditing(true) },
        { icon: <Wallet size={16} />, bg: "#e8e8ff", ic: "#4040b0", label: "Connected Wallets", sub: walletHint ? `${walletLabel} · ${walletHint}` : walletLabel, action: openWalletMenu },
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
        { icon: <HelpCircle size={16} />, bg: "#f5f5fb", ic: "#9a9ab8", label: "Contact Support", sub: "Email Osher support", action: () => { window.location.href = "mailto:Team@osherfinance.com?subject=Osher%20AI%20Support"; } },
        { icon: <Shield size={16} />, bg: "#f0f0f9", ic: "#5a5a8a", label: "Terms of Service", sub: "Review usage terms", action: () => window.open("/terms.html", "_blank") },
        { icon: <Shield size={16} />, bg: "#f0f0f9", ic: "#5a5a8a", label: "Privacy Policy", sub: "Review data practices", action: () => window.open("/privacy.html", "_blank") },
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-28" style={{ background: "#f5f5fb", scrollbarWidth: "none" }}>
      {/* Profile card */}
      <div className="mx-4 mt-8 mb-5 rounded-3xl" style={{ background: "#171717", boxShadow: "0 6px 24px rgba(23,23,23,0.22)", minHeight: 190, overflow: "hidden" }}>
        <div className="p-5" style={{ position: "relative" }}>
          <div style={{ position: "absolute", top: -28, right: -20, width: 128, height: 128, borderRadius: "50%", background: "rgba(204,204,247,0.08)", pointerEvents: "none" }} />
          <div className="flex items-center gap-4 mb-5" style={{ position: "relative", zIndex: 1, minHeight: 74 }}>
            <div style={{ width: 68, height: 68, borderRadius: 22, overflow: "hidden", background: activeAvatar.bg, color: activeAvatar.color || "#171717", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", flexShrink: 0, fontSize: "1.8rem", fontWeight: 900 }}>
              {activeAvatar.image ? (
                <ImageWithFallback src={activeAvatar.image} alt="Profile icon" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : activeAvatar.text}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="font-display" style={{ fontWeight: 800, fontSize: "1.25rem", color: "#fff", letterSpacing: "-0.01em", lineHeight: 1.2, overflowWrap: "anywhere" }}>{displayName === "there" ? "Osher Saver" : displayName}</p>
              <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.52)", marginTop: 4, overflowWrap: "anywhere" }}>{walletHint ? `${walletLabel} · ${walletHint}` : walletLabel}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4caf75", display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: "0.72rem", color: "#4caf75", fontWeight: 600 }}>{Number(dashboard.streakWeeks || 0)}-week streak</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { l: "Total Saved", v: formatNumber(dashboard.totalSavedUSDT || 0, 2) + " USDT" },
              { l: "Active Goals", v: String(dashboard.activeGoalCount || 0) },
              { l: "Wallet USDT", v: formatNumber(walletBalances.usdt || 0, 2) },
            ].map(({ l, v }) => (
              <div key={l} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 12, padding: "9px 12px" }}>
                <p style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{l}</p>
                <p className="font-display" style={{ fontSize: "0.9rem", fontWeight: 700, color: "#CCCCF7" }}>{v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editing && (
        <div className="mx-4 mb-4 rounded-2xl p-4" style={{ background: "#fff", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
          <label className="block mb-3">
            <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "#9a9ab8", textTransform: "uppercase" }}>Name</span>
            <input value={draftName} onChange={e => setDraftName(e.target.value)} className="w-full outline-none bg-transparent mt-2" style={{ color: "#0d0d14", fontSize: "1rem", fontWeight: 700 }} />
          </label>
          <label className="block mb-4">
            <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "#9a9ab8", textTransform: "uppercase" }}>Email or phone</span>
            <input value={draftContact} onChange={e => setDraftContact(e.target.value)} className="w-full outline-none bg-transparent mt-2" style={{ color: "#0d0d14", fontSize: "1rem", fontWeight: 700 }} />
          </label>
          <div className="mb-4">
            <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "#9a9ab8", textTransform: "uppercase" }}>Select an icon</span>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {avatarOptions.map(option => (
                <button key={option.id} onClick={() => setSelectedIcon(option.id)} aria-label={option.label} style={{ position: "relative", aspectRatio: "1", borderRadius: 14, background: option.bg, color: option.color || "#171717", display: "flex", alignItems: "center", justifyContent: "center", border: selectedIcon === option.id ? "2px solid #171717" : "1px solid rgba(0,0,0,0.08)", fontSize: "1.15rem", fontWeight: 900, overflow: "hidden" }}>
                  {option.image ? <ImageWithFallback src={option.image} alt={option.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : option.text}
                  {selectedIcon === option.id && <span style={{ position: "absolute", right: 3, bottom: 3, width: 16, height: 16, borderRadius: "50%", background: "#171717", color: "#CCCCF7", display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={10} /></span>}
                </button>
              ))}
            </div>
          </div>
          <button onClick={updateProfile} className="w-full py-3 rounded-2xl" style={{ background: "#171717", color: "#CCCCF7", fontWeight: 800 }}>Save profile</button>
        </div>
      )}
      {status && <p className="mx-4 mb-3" style={{ color: "#2d7a47", fontSize: "0.78rem", fontWeight: 700 }}>{status}</p>}

      {walletMenuOpen && (
        <div className="mx-4 mb-4 rounded-2xl p-4" style={{ background: "#fff", boxShadow: "0 8px 26px rgba(0,0,0,0.10)", border: "1px solid rgba(0,0,0,0.06)" }}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0d0d14" }}>Connected wallet</p>
              <p style={{ fontSize: "0.76rem", color: "#9a9ab8", marginTop: 3, overflowWrap: "anywhere" }}>{walletInfo?.address || "No wallet connected"}</p>
            </div>
            <button onClick={() => setWalletMenuOpen(false)} aria-label="Close wallet menu" style={{ width: 32, height: 32, borderRadius: 12, background: "#f5f5fb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <X size={15} color="#6b6b8a" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={copyWallet} className="py-3 rounded-2xl flex items-center justify-center gap-2" style={{ background: "#f5f5fb", color: "#171717", fontWeight: 800, fontSize: "0.82rem" }}>
              <Copy size={15} /> Copy address
            </button>
            <button onClick={disconnectFromMenu} className="py-3 rounded-2xl flex items-center justify-center gap-2" style={{ background: "#fff5f5", color: "#c0392b", fontWeight: 800, fontSize: "0.82rem", border: "1px solid rgba(192,57,43,0.12)" }}>
              <LogOut size={15} /> Disconnect
            </button>
          </div>
        </div>
      )}

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

      <div className="px-4 mt-1">
        {isAuthenticated ? (
          <button onClick={onDisconnect} className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2" style={{ background: "#fff5f5", color: "#c0392b", fontWeight: 600, fontSize: "0.875rem", border: "1px solid rgba(192,57,43,0.12)" }}>
            <LogOut size={15} /> Sign Out
          </button>
        ) : (
          <button onClick={onAuthRequired} className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2" style={{ background: "#171717", color: "#CCCCF7", fontWeight: 800, fontSize: "0.875rem" }}>
            <User size={15} /> Sign up or log in
          </button>
        )}
      </div>

      <p style={{ textAlign: "center", fontSize: "0.72rem", color: "#c8c8d8", padding: "20px 0 8px" }}>
        Osher Finance · v1.0.0 · <span style={{ color: "#9898e8" }}>osher.finance</span>
      </p>
    </div>
  );
}
