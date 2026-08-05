import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, LockKeyhole, Sparkles, WalletCards } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import osherLogo from "../../imports/Osher_wallet_logo.png";

interface Props {
  onContinue: () => void;
  onSkip: () => void;
}

const slides = [
  {
    eyebrow: "Step 1",
    title: "Separate savings from spending.",
    copy: "Tell Osher what money you want to protect. It turns the goal into a weekly plan you can actually follow.",
    cta: "Next",
    theme: "lavender",
  },
  {
    eyebrow: "Step 2",
    title: "Build the habit, one top-up at a time.",
    copy: "Use streaks, nudges, and tiny repeatable amounts so big goals stop competing with daily spending.",
    cta: "Next",
    theme: "ink",
  },
  {
    eyebrow: "Step 3",
    title: "You approve every money move.",
    copy: "Connect MiniPay or MetaMask when ready. Osher never holds private keys; deposits and withdrawals need your wallet approval.",
    cta: "Get started",
    theme: "paper",
  },
];

function BrandMark({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`grid size-11 place-items-center overflow-hidden rounded-2xl ${dark ? "bg-white/10 ring-1 ring-white/10" : "bg-white shadow-[0_8px_24px_rgba(23,23,23,0.12)]"}`}>
        <ImageWithFallback src={osherLogo} alt="Osher AI" className="size-full object-contain" />
      </div>
      <div>
        <p className={`font-display text-[1rem] font-extrabold leading-none ${dark ? "text-white" : "text-[#171717]"}`}>Osher AI</p>
        <p className={`mt-1 text-[0.58rem] font-extrabold uppercase tracking-[0.18em] ${dark ? "text-white/40" : "text-[#77779c]"}`}>Osher Finance</p>
      </div>
    </div>
  );
}

function GoalIllustration({ active }: { active: boolean }) {
  return (
    <div className="relative mx-auto mt-4 h-[292px] w-[292px]">
      <div className="absolute inset-0 rounded-full bg-white/20 blur-2xl" />
      <div className={`absolute left-8 top-5 w-[236px] rounded-[38px] bg-white p-5 shadow-[0_28px_62px_rgba(46,46,98,0.25)] transition-all duration-700 ${active ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[0.72rem] font-extrabold uppercase tracking-[0.14em] text-[#77779c]">Rent goal</p>
          <span className="rounded-full bg-[#ecf9ef] px-3 py-1 text-[0.68rem] font-extrabold text-[#3c9b5a]">On track</span>
        </div>
        <div className="relative mx-auto my-5 grid size-32 place-items-center rounded-full bg-[#f4f3ff]">
          <div className="absolute inset-0 rounded-full border-[13px] border-[#e7e6f7]" />
          <div className="absolute inset-0 rounded-full border-[13px] border-[#171717] border-r-transparent border-b-transparent" />
          <div className="text-center">
            <p className="font-display text-[1.55rem] font-extrabold text-[#171717]">64%</p>
            <p className="text-[0.66rem] font-bold text-[#77779c]">saved</p>
          </div>
        </div>
        <div className="rounded-2xl bg-[#f5f5fb] p-3">
          <p className="text-[0.72rem] font-bold text-[#77779c]">Weekly plan</p>
          <p className="font-display mt-1 text-[1rem] font-extrabold text-[#171717]">Save ₦20,833 weekly</p>
        </div>
      </div>
      <div className={`absolute left-1 top-20 rounded-2xl bg-[#171717] px-3.5 py-3 text-white shadow-[0_16px_34px_rgba(23,23,23,0.24)] transition-all delay-150 duration-700 ${active ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}>
        <Sparkles size={15} />
        <p className="mt-1 text-[0.72rem] font-bold">Habit plan</p>
      </div>
      <div className={`absolute bottom-7 right-5 grid size-12 place-items-center rounded-2xl bg-[#c4ecd0] text-[#171717] shadow-[0_14px_28px_rgba(23,23,23,0.16)] transition-all delay-300 duration-700 ${active ? "scale-100 opacity-100" : "scale-75 opacity-0"}`}>
        <Check size={22} strokeWidth={3} />
      </div>
    </div>
  );
}

function HabitIllustration({ active }: { active: boolean }) {
  return (
    <div className="relative mx-auto mt-4 h-[292px] w-[292px]">
      <div className="absolute inset-0 rounded-full bg-[#CCCCF7]/10 blur-3xl" />
      <div className={`absolute inset-x-5 top-6 rounded-[38px] bg-[#232326] p-5 shadow-[0_28px_62px_rgba(0,0,0,0.32)] transition-all duration-700 ${active ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}>
        <div className="mb-5 flex items-center justify-between">
          <p className="text-[0.74rem] font-extrabold uppercase tracking-[0.14em] text-white/45">Weekly rhythm</p>
          <span className="rounded-full bg-[#CCCCF7]/15 px-3 py-1 text-[0.68rem] font-extrabold text-[#CCCCF7]">6-week streak</span>
        </div>
        {[72, 48, 86].map((width, index) => (
          <div key={index} className="mb-3 flex items-center gap-3 rounded-2xl bg-white/7 p-3">
            <div className="grid size-9 place-items-center rounded-xl bg-[#CCCCF7] text-[0.78rem] font-extrabold text-[#171717]">{index + 1}</div>
            <div className="h-2 flex-1 rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#c4ecd0] transition-all delay-300 duration-700" style={{ width: active ? `${width}%` : "0%" }} />
            </div>
            <p className="w-11 text-right text-[0.72rem] font-extrabold text-white">{index === 1 ? "$5" : "$10"}</p>
          </div>
        ))}
        <div className="mt-4 rounded-2xl bg-[#11805d] px-4 py-3 text-center">
          <p className="font-display text-[0.95rem] font-extrabold text-white">Save a little today</p>
        </div>
      </div>
      <div className={`absolute -right-1 bottom-10 rounded-2xl bg-white px-4 py-3 shadow-[0_16px_34px_rgba(0,0,0,0.18)] transition-all delay-200 duration-700 ${active ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}>
        <p className="text-[0.58rem] font-extrabold uppercase tracking-[0.12em] text-[#77779c]">Nudge</p>
        <p className="font-display text-[0.9rem] font-extrabold text-[#171717]">Keep going</p>
      </div>
    </div>
  );
}

function ControlIllustration({ active }: { active: boolean }) {
  return (
    <div className="relative mx-auto mt-4 h-[292px] w-[292px]">
      <div className="absolute inset-0 rounded-full bg-[#CCCCF7]/30 blur-2xl" />
      <div className={`absolute left-8 top-6 w-[236px] rounded-[38px] bg-[#171717] p-5 text-white shadow-[0_28px_62px_rgba(23,23,23,0.28)] transition-all duration-700 ${active ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}>
        <div className="mb-6 flex items-center justify-between">
          <p className="text-[0.72rem] font-extrabold uppercase tracking-[0.14em] text-white/45">Your control</p>
          <WalletCards size={20} color="#CCCCF7" />
        </div>
        <div className="mx-auto grid size-24 place-items-center rounded-[30px] bg-[#CCCCF7] text-[#171717]">
          <LockKeyhole size={38} strokeWidth={2.6} />
        </div>
        <div className="mt-7 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/8 p-3">
            <p className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-white/35">Deposit</p>
            <p className="mt-1 text-[0.75rem] font-extrabold text-white">Approve</p>
          </div>
          <div className="rounded-2xl bg-white/8 p-3">
            <p className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-white/35">Withdraw</p>
            <p className="mt-1 text-[0.75rem] font-extrabold text-white">Approve</p>
          </div>
        </div>
      </div>
      <div className={`absolute bottom-6 left-0 rounded-2xl bg-[#c4ecd0] px-4 py-3 shadow-[0_16px_34px_rgba(23,23,23,0.16)] transition-all delay-200 duration-700 ${active ? "translate-x-0 opacity-100" : "-translate-x-5 opacity-0"}`}>
        <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-[#28633b]">Non-custodial</p>
        <p className="font-display text-[0.9rem] font-extrabold text-[#171717]">You approve moves</p>
      </div>
    </div>
  );
}

export function OnboardingScreen({ onContinue, onSkip }: Props) {
  const [page, setPage] = useState(0);
  const slide = slides[page];
  const isLast = page === slides.length - 1;
  const dark = slide.theme === "ink";
  const ctaClass = dark
    ? "bg-[#11805d] text-white"
    : isLast
      ? "bg-[#171717] text-white"
      : "bg-[#171717] text-white";

  const advance = () => {
    if (isLast) onContinue();
    else setPage(current => Math.min(slides.length - 1, current + 1));
  };

  return (
    <div className={`relative h-full overflow-y-auto transition-colors duration-500 ${dark ? "bg-[#171717]" : slide.theme === "lavender" ? "bg-[#CCCCF7]" : "bg-[#fbfbff]"}`} style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className={`absolute -right-20 -top-20 size-64 rounded-full ${dark ? "bg-[#CCCCF7]/10" : "bg-white/30"}`} />
        <div className={`absolute -bottom-24 -left-20 size-72 rounded-full ${dark ? "bg-white/5" : "bg-[#aaaaf0]/18"}`} />
      </div>

      <div className="relative z-10 flex min-h-full flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between gap-4">
          <BrandMark dark={dark} />
          <button onClick={onSkip} className={`rounded-full px-3 py-2 text-[0.78rem] font-extrabold transition-opacity active:opacity-70 ${dark ? "text-white/55" : "text-[#3d3d65]"}`}>
            Skip
          </button>
        </header>

        <main className="flex flex-1 flex-col pt-8">
          <div className="min-h-[182px]">
            <p className={`inline-flex rounded-full px-3 py-1 text-[0.66rem] font-extrabold uppercase tracking-[0.16em] ${dark ? "bg-white/8 text-[#CCCCF7]" : "bg-white/38 text-[#595987]"}`}>{slide.eyebrow}</p>
            <h1 className={`font-display mt-4 text-[2.55rem] font-extrabold leading-[1.02] tracking-[-0.04em] ${dark ? "text-white" : "text-[#171717]"}`}>{slide.title}</h1>
            <p className={`mt-4 max-w-[312px] text-[1rem] font-semibold leading-[1.55] ${dark ? "text-white/58" : "text-[#4c4c71]"}`}>{slide.copy}</p>
          </div>

          <div className="flex flex-1 items-center justify-center py-3">
            {page === 0 ? <GoalIllustration active /> : page === 1 ? <HabitIllustration active /> : <ControlIllustration active />}
          </div>
        </main>

        <footer className="relative z-10">
          <div className="mb-5 flex items-center justify-between">
            <button onClick={() => setPage(current => Math.max(0, current - 1))} disabled={page === 0} className={`grid size-12 place-items-center rounded-2xl border transition-opacity disabled:opacity-0 ${dark ? "border-white/15 text-white" : "border-[#171717]/10 text-[#171717]"}`} aria-label="Previous onboarding slide">
              <ArrowLeft size={18} />
            </button>
            <div className="flex gap-2" aria-label={`Onboarding page ${page + 1} of ${slides.length}`}>
              {slides.map((_, index) => (
                <button key={index} onClick={() => setPage(index)} aria-label={`Go to onboarding slide ${index + 1}`} className={`h-2 rounded-full transition-all duration-300 ${index === page ? (dark ? "w-9 bg-[#CCCCF7]" : "w-9 bg-[#171717]") : dark ? "w-2 bg-white/22" : "w-2 bg-[#171717]/20"}`} />
              ))}
            </div>
            <span className="w-12" />
          </div>

          <button onClick={advance} className={`flex w-full items-center justify-center gap-2.5 rounded-3xl py-4 text-[1rem] font-extrabold shadow-[0_14px_30px_rgba(23,23,23,0.16)] transition-transform active:scale-[0.98] ${ctaClass}`}>
            {slide.cta} {isLast ? <ArrowRight size={19} /> : <ChevronRight size={19} />}
          </button>
        </footer>
      </div>
    </div>
  );
}
