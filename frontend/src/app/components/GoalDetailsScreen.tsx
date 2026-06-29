import { ChevronLeft, Calendar, TrendingUp, ShieldCheck } from 'lucide-react';
import { SavingsGoal, categoryEmoji, formatGoalAmount, formatTokenNumber } from '../lib/osher';

interface Props {
  goal?: SavingsGoal;
  displayMode: 'local' | 'usdt';
  onBack: () => void;
  onCreateVaultGoal: (goal: SavingsGoal) => void;
  onTopUp: (goal: SavingsGoal) => void;
  onWithdraw: (goal: SavingsGoal) => void;
  onDeleteGoal: (goal: SavingsGoal) => void;
  onToggleRoundUp: (goal: SavingsGoal) => void;
  onLogSpend: (goal: SavingsGoal) => void;
  onPauseGoal: (goal: SavingsGoal) => void;
  onResumeGoal: (goal: SavingsGoal) => void;
  onReconcile: () => void;
}

export function GoalDetailsScreen({ goal, displayMode, onBack, onCreateVaultGoal, onTopUp, onWithdraw, onDeleteGoal, onToggleRoundUp, onLogSpend, onPauseGoal, onResumeGoal, onReconcile }: Props) {
  if (!goal) {
    return <div className="flex flex-col h-full" style={{ background: '#f5f5fb' }}><div className="px-5 pt-12"><button onClick={onBack} style={{ width: 38, height: 38, borderRadius: 12, background: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}><ChevronLeft size={18} /></button><h1 className="font-display" style={{ marginTop: 24, fontSize: '1.6rem', fontWeight: 800 }}>Create a goal in AI Chat</h1><p style={{ color: '#6b6b8a', marginTop: 8 }}>Tell Osher what you want to save for, the amount, and the deadline.</p></div></div>;
  }

  const pct = Math.max(0, Math.min(100, Number(goal.progressPercent || 0)));
  const circumference = 2 * Math.PI * 58;
  const offset = circumference - (pct / 100) * circumference;
  const onChainReady = goal.vaultGoalCreated === true;
  const hasBalance = Number(goal.currentAmountUSDT || 0) > 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-8" style={{ background: '#f5f5fb', scrollbarWidth: 'none' }}>
      <div className="px-5 pt-12 pb-4 flex items-center justify-between">
        <button onClick={onBack} style={{ width: 38, height: 38, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}><ChevronLeft size={18} color="#0d0d14" /></button>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: onChainReady ? '#2d7a47' : '#b36a00', background: onChainReady ? '#e8f5ec' : '#fff3dc', padding: '5px 10px', borderRadius: 8 }}>{onChainReady ? 'Vault ready' : 'Needs setup'}</span>
      </div>

      <div className="px-5 text-center mb-5">
        <div style={{ width: 74, height: 74, borderRadius: 24, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 12px', boxShadow: '0 3px 12px rgba(0,0,0,0.08)' }}>{categoryEmoji(goal.category)}</div>
        <h1 className="font-display" style={{ fontSize: '1.7rem', fontWeight: 800, color: '#0d0d14', letterSpacing: '-0.02em' }}>{goal.name || 'Savings Goal'}</h1>
        <p style={{ fontSize: '0.85rem', color: '#9a9ab8', marginTop: 4 }}>{goal.categoryLabel || goal.category || 'Custom'} · {Number(goal.daysRemaining || 0)} days remaining</p>
      </div>

      <div className="mx-5 mb-5 rounded-3xl p-5" style={{ background: '#171717', boxShadow: '0 8px 28px rgba(23,23,23,0.24)' }}>
        <div className="flex justify-center mb-5">
          <div style={{ position: 'relative', width: 140, height: 140 }}>
            <svg width="140" height="140" style={{ transform: 'rotate(-90deg)' }}><circle cx="70" cy="70" r="58" stroke="rgba(255,255,255,0.08)" strokeWidth="12" fill="none" /><circle cx="70" cy="70" r="58" stroke="#CCCCF7" strokeWidth="12" fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} /></svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}><p className="font-display" style={{ color: '#fff', fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>{pct.toFixed(0)}%</p><p style={{ color: 'rgba(204,204,247,0.65)', fontSize: '0.7rem', fontWeight: 700 }}>saved</p></div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3"><div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: 12 }}><p style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Saved</p><p className="font-display" style={{ color: '#fff', fontWeight: 800 }}>{formatGoalAmount(goal, displayMode, 'saved')}</p></div><div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: 12 }}><p style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Target</p><p className="font-display" style={{ color: '#fff', fontWeight: 800 }}>{formatGoalAmount(goal, displayMode)}</p></div></div>
      </div>

      <div className="px-5 grid grid-cols-2 gap-3 mb-5">
        <button onClick={() => onTopUp(goal)} disabled={!onChainReady} className="py-3.5 rounded-2xl" style={{ background: '#CCCCF7', color: '#171717', opacity: onChainReady ? 1 : 0.45, fontWeight: 800 }}>Top up</button>
        <button onClick={() => onCreateVaultGoal(goal)} disabled={onChainReady} className="py-3.5 rounded-2xl flex items-center justify-center gap-2" style={{ background: onChainReady ? '#e8f5ec' : '#171717', color: onChainReady ? '#2d7a47' : '#fff', fontWeight: 800 }}><ShieldCheck size={15} />{onChainReady ? 'Ready' : 'Create vault'}</button>
        <button onClick={() => onWithdraw(goal)} disabled={!onChainReady || !hasBalance} className="py-3.5 rounded-2xl" style={{ background: '#fff3dc', color: '#b36a00', opacity: onChainReady && hasBalance ? 1 : 0.45, fontWeight: 800 }}>Withdraw</button>
        <button onClick={() => onDeleteGoal(goal)} disabled={hasBalance} className="py-3.5 rounded-2xl" style={{ background: '#fff5f5', color: '#c0392b', opacity: hasBalance ? 0.45 : 1, fontWeight: 800 }}>{onChainReady ? 'Archive' : 'Delete'}</button>
        <button onClick={() => onToggleRoundUp(goal)} className="py-3.5 rounded-2xl" style={{ background: '#fff', color: '#3d3d6e', fontWeight: 800, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>{goal.roundUpEnabled ? 'Round-up on' : 'Round-up off'}</button>
        <button onClick={() => onLogSpend(goal)} className="py-3.5 rounded-2xl" style={{ background: '#fff', color: '#3d3d6e', fontWeight: 800, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>Log spend</button>
        <button onClick={() => goal.status === 'paused' ? onResumeGoal(goal) : onPauseGoal(goal)} disabled={!onChainReady} className="py-3.5 rounded-2xl" style={{ background: '#f7f7ff', color: '#3d3d6e', opacity: onChainReady ? 1 : 0.45, fontWeight: 800 }}>{goal.status === 'paused' ? 'Resume' : 'Pause'}</button>
        <button onClick={onReconcile} className="py-3.5 rounded-2xl" style={{ background: '#fff', color: '#3d3d6e', fontWeight: 800, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>Refresh vault</button>
      </div>

      <div className="mx-5 rounded-2xl p-4" style={{ background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
        <div className="flex items-center gap-3 mb-3"><Calendar size={16} color="#9898e8" /><p className="font-display" style={{ fontWeight: 800, color: '#0d0d14' }}>Savings plan</p></div>
        <p style={{ fontSize: '0.86rem', color: '#6b6b8a', lineHeight: 1.6 }}>Save <strong style={{ color: '#0d0d14' }}>{formatGoalAmount(goal, displayMode, 'weekly')}</strong> weekly to stay on pace. Current on-chain saved balance is {formatTokenNumber(goal.currentAmountUSDT || 0)} USDT.</p>
        <div className="flex items-center gap-1.5 mt-3"><TrendingUp size={13} color="#2d7a47" /><span style={{ fontSize: '0.78rem', color: '#2d7a47', fontWeight: 700 }}>{goal.status || 'Active'}</span></div>
      </div>
    </div>
  );
}
