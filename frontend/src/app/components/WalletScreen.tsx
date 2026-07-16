import { ArrowRight, Clock, ShieldCheck } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import osherLogo from '../../imports/Osher_wallet_logo.png';
import { WalletInfo, WalletType, isMetaMask, isMiniPay, walletDisplayName, walletReference } from '../lib/osher';

interface Props {
  onConnect: (walletType?: WalletType | 'auto') => void;
  walletInfo?: WalletInfo;
  onDisconnect?: () => void;
  onSkip?: () => void;
}

export function WalletScreen({ onConnect, walletInfo, onDisconnect, onSkip }: Props) {
  const connected = Boolean(walletInfo?.address);
  const inMiniPay = isMiniPay();
  const providerLabel = walletDisplayName(walletInfo);
  const reference = walletReference(walletInfo?.address);

  return (
    <div className="h-full overflow-y-auto bg-background" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
      <div className="px-6 pt-10 pb-5">
        <div className="flex items-center gap-2.5 mb-6">
          <div style={{ width: 38, height: 38, borderRadius: 12, overflow: 'hidden', background: '#f5f5fb', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.09)' }}>
            <ImageWithFallback src={osherLogo} alt="Osher AI" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <span className="font-display" style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0d0d14', letterSpacing: '-0.01em' }}>Osher AI</span>
        </div>
        <h1 className="font-display" style={{ fontSize: '2rem', fontWeight: 800, color: '#0d0d14', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {inMiniPay ? 'MiniPay is ready' : <>Connect your<br />wallet</>}
        </h1>
        <p style={{ color: '#6b6b8a', marginTop: 8, fontSize: '0.875rem', lineHeight: 1.6 }}>
          Your savings stay in your own wallet. Every goal deposit or withdrawal asks for your approval and may include a small network fee.
        </p>
      </div>

      <div className="px-5 flex flex-col gap-4">
        {inMiniPay && !connected && (
          <button onClick={() => onConnect('minipay')} className="w-full rounded-3xl p-5 text-left relative overflow-hidden transition-transform active:scale-98" style={{ background: '#171717', color: '#fff', boxShadow: '0 6px 24px rgba(23,23,23,0.2)' }}>
            <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(204,204,247,0.08)' }} />
            <div className="flex items-center justify-between gap-4 relative z-10">
              <div>
                <p className="font-display" style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff' }}>Connect MiniPay</p>
                <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', marginTop: 6, lineHeight: 1.5 }}>Tap to let Osher AI request access to your MiniPay wallet address. Deposits and withdrawals still require separate approval.</p>
              </div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.12)' }}><ArrowRight size={16} color="#fff" /></div>
            </div>
          </button>
        )}

        {!inMiniPay && <button onClick={() => onConnect('minipay')} className="w-full rounded-3xl p-5 text-left relative overflow-hidden transition-transform active:scale-98" style={{ background: '#171717', opacity: isMiniPay() || !connected ? 1 : 0.92 }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(204,204,247,0.08)' }} />
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'rgba(204,204,247,0.15)' }}>
                <svg width="26" height="26" viewBox="0 0 26 26" fill="none"><circle cx="13" cy="13" r="11" fill="rgba(204,204,247,0.3)"/><path d="M13 5a8 8 0 100 16A8 8 0 0013 5zm0 3a2.5 2.5 0 110 5 2.5 2.5 0 010-5zm0 10.5c-2.2 0-4.15-1.12-5.33-2.84 1.38-1.05 3.35-1.66 5.33-1.66s3.95.61 5.33 1.66C17.15 17.38 15.2 18.5 13 18.5z" fill="#CCCCF7"/></svg>
              </div>
              <div>
                <p className="font-display" style={{ fontWeight: 700, fontSize: '1.05rem', color: '#fff', letterSpacing: '-0.01em' }}>MiniPay</p>
                <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)' }}>Celo wallet · Mobile first</p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full" style={{ background: '#CCCCF7', color: '#171717', fontSize: '0.7rem', fontWeight: 700 }}>{isMiniPay() ? 'Detected' : 'Recommended'}</span>
          </div>
          <div className="flex items-center justify-between relative z-10">
            <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)', maxWidth: '75%' }}>Primary wallet for MiniPay users on Celo.</p>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }}><ArrowRight size={15} color="#fff" /></div>
          </div>
        </button>}

        {connected && (
          <div className="rounded-2xl p-4" style={{ background: '#e8f5ec', border: '1px solid rgba(76,175,117,0.2)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display" style={{ fontWeight: 800, color: '#0d0d14', fontSize: '0.95rem' }}>Connected</p>
                <p style={{ fontSize: '0.8rem', color: '#2d7a47', marginTop: 3 }}>{providerLabel}</p>
                {reference && <p style={{ fontSize: '0.7rem', color: '#6b6b8a', marginTop: 4 }}>{reference}</p>}
              </div>
              <button onClick={onDisconnect} className="px-3 py-2 rounded-xl flex-shrink-0" style={{ background: '#fff', color: '#2d7a47', fontWeight: 700, fontSize: '0.78rem' }}>Disconnect</button>
            </div>
          </div>
        )}

        {!inMiniPay && <button onClick={() => onConnect('metamask')} className="w-full rounded-3xl p-5 text-left border transition-transform active:scale-98" style={{ background: '#fff', borderColor: 'rgba(0,0,0,0.09)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', opacity: isMetaMask() || !connected ? 1 : 0.92 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: '#fff7ef' }}>
                <svg width="26" height="22" viewBox="0 0 26 22" fill="none"><path d="M24.5.5L14.3 8.1l1.9-4.4L24.5.5z" fill="#E2761B"/><path d="M1.5.5l10.1 7.7L9.8 3.7 1.5.5z" fill="#E4761B"/><path d="M20.9 15.8l-2.7 4.1 5.8 1.6 1.7-5.6-4.8-.1zM.4 15.9l1.6 5.6 5.8-1.6-2.7-4.1-4.7.1z" fill="#E4761B"/><path d="M7.5 9.6L5.9 12l5.7.3-.2-6.1-3.9 3.4zM18.5 9.6l-4-3.5-.1 6.2 5.7-.3-1.6-2.4z" fill="#E4761B"/><path d="M7.2 21.5l3.4-1.7-2.9-2.3-.5 4zM15.4 19.8l3.4 1.7-.5-4-2.9 2.3z" fill="#E4761B"/></svg>
              </div>
              <div><p className="font-display" style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0d0d14', letterSpacing: '-0.01em' }}>MetaMask</p><p style={{ fontSize: '0.75rem', color: '#9a9ab8' }}>EVM · Desktop & mobile</p></div>
            </div>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: '#f0f0f9' }}><ArrowRight size={15} color="#6b6b8a" /></div>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#9a9ab8' }}>Fallback wallet for users who already hold Celo stablecoins there.</p>
        </button>}

        <div className="rounded-3xl p-5 border" style={{ background: '#fafafa', borderColor: 'rgba(0,0,0,0.06)', opacity: 0.65 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: '#f0f0f9' }}>
                <svg width="22" height="20" viewBox="0 0 22 20" fill="none"><path d="M11 1L1 6h20L11 1z" stroke="#9a9ab8" strokeWidth="1.5" strokeLinejoin="round"/><path d="M4 9v7M8 9v7M14 9v7M18 9v7" stroke="#9a9ab8" strokeWidth="1.5" strokeLinecap="round"/><path d="M1 16h20v3H1z" fill="#9a9ab8" opacity="0.3"/></svg>
              </div>
              <div><p className="font-display" style={{ fontWeight: 700, fontSize: '1.05rem', color: '#9a9ab8', letterSpacing: '-0.01em' }}>Bank Transfer</p><p style={{ fontSize: '0.75rem', color: '#b0b0c8' }}>Fund directly from your bank</p></div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: '#fff3dc' }}><Clock size={11} color="#b36a00" /><span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#b36a00' }}>Soon</span></div>
          </div>
        </div>

        <button
          onClick={onSkip}
          className="w-full rounded-2xl px-5 py-4 text-center transition-transform active:scale-98"
          style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', color: '#3d3d6e', fontWeight: 800, boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}
        >
          Skip wallet for now
          <span style={{ display: 'block', fontSize: '0.72rem', color: '#9a9ab8', fontWeight: 600, marginTop: 4 }}>
            Explore Osher AI first. Connect later to deposit or withdraw.
          </span>
        </button>
      </div>

      <div className="px-5 pb-8 pt-4"><div className="flex items-center justify-center gap-2"><ShieldCheck size={15} color="#4caf75" /><p style={{ fontSize: '0.78rem', color: '#6b6b8a' }}>Non-custodial · Celo stablecoins · User-approved transactions</p></div></div>
    </div>
  );
}
