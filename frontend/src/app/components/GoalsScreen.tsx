import { MessageCircle, Plus, TrendingUp, ShieldCheck } from 'lucide-react';
import { ContractsConfig, SavingsGoal, categoryEmoji, formatGoalAmount } from '../lib/osher';

interface Props {
  goals: SavingsGoal[];
  displayMode: 'local' | 'usdt';
  contracts: ContractsConfig;
  onGoalClick: (goal?: SavingsGoal) => void;
  onCreateManualGoal: () => void;
  onCreateVaultGoal: (goal: SavingsGoal) => void;
  onTopUp: (goal: SavingsGoal) => void;
  onWithdraw: (goal: SavingsGoal) => void;
  onDeleteGoal: (goal: SavingsGoal) => void;
  onAskAi: () => void;
  onToggleRoundUp: (goal: SavingsGoal) => void;
  onLogSpend: (goal: SavingsGoal) => void;
  onPauseGoal: (goal: SavingsGoal) => void;
  onResumeGoal: (goal: SavingsGoal) => void;
}

export function GoalsScreen({ goals, displayMode, contracts, onGoalClick, onCreateManualGoal, onCreateVaultGoal, onTopUp, onWithdraw, onDeleteGoal, onAskAi, onToggleRoundUp, onLogSpend, onPauseGoal, onResumeGoal }: Props) {
  return (
    <div className="flex flex-col h-full overflow-y-auto pb-28" style={{ background: '#f5f5fb', scrollbarWidth: 'none' }}>
      <div className="px-5 pt-12 pb-4 flex items-center justify-between">
        <div><h1 className="font-display" style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0d0d14', letterSpacing: '-0.02em' }}>Savings Goals</h1><p style={{ fontSize: '0.82rem', color: '#9a9ab8', marginTop: 3 }}>Track every goal Osher is helping with.</p></div>
        <div className="flex items-center gap-2">
          <button onClick={onAskAi} aria-label="Ask Osher AI" style={{ width: 42, height: 42, borderRadius: 14, background: '#fff', color: '#3d3d6e', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(204,204,247,0.8)', boxShadow: '0 3px 12px rgba(0,0,0,0.06)' }}><MessageCircle size={19} /></button>
          <button onClick={onCreateManualGoal} aria-label="Create goal" style={{ width: 42, height: 42, borderRadius: 14, background: '#171717', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(23,23,23,0.22)' }}><Plus size={19} color="#CCCCF7" /></button>
        </div>
      </div>

      <div className="px-5 flex flex-col gap-4">
        <button onClick={onAskAi} className="rounded-3xl p-4 flex items-center gap-3 text-left" style={{ background: '#fff', color: '#0d0d14', boxShadow: '0 3px 12px rgba(0,0,0,0.06)' }}>
          <span style={{ width: 42, height: 42, borderRadius: 14, background: '#171717', color: '#CCCCF7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><MessageCircle size={18} /></span>
          <span className="flex-1"><span className="block font-display" style={{ fontWeight: 800, fontSize: '0.96rem' }}>Ask Osher AI to create a goal</span><span className="block" style={{ color: '#6b6b8a', fontSize: '0.78rem', lineHeight: 1.45, marginTop: 2 }}>Describe what you want, the amount, and your deadline.</span></span>
        </button>

        {goals.length === 0 && (
          <div className="rounded-3xl p-5" style={{ background: '#fff', boxShadow: '0 3px 12px rgba(0,0,0,0.06)' }}>
            <p className="font-display" style={{ fontWeight: 800, color: '#0d0d14', fontSize: '1.05rem' }}>No goals yet</p>
            <p style={{ fontSize: '0.85rem', color: '#6b6b8a', lineHeight: 1.6, marginTop: 6 }}>Use AI Chat to say something like “Save ₦500,000 for rent by December.”</p>
          </div>
        )}

        {goals.map(goal => {
          const pct = Math.max(0, Math.min(100, Number(goal.progressPercent || 0)));
          const vaultReady = Boolean(contracts.savingsVault);
          const onChainReady = goal.vaultGoalCreated === true;
          const hasBalance = Number(goal.currentAmountUSDT || 0) > 0;
          return (
            <div key={goal.id} className="rounded-3xl overflow-hidden" style={{ background: '#fff', boxShadow: '0 3px 12px rgba(0,0,0,0.06)' }}>
              <button onClick={() => onGoalClick(goal)} className="w-full text-left p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3"><div style={{ width: 48, height: 48, borderRadius: 16, background: '#f5f5fb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>{categoryEmoji(goal.category)}</div><div><p className="font-display" style={{ fontWeight: 700, fontSize: '1rem', color: '#0d0d14', letterSpacing: '-0.01em' }}>{goal.name || 'Savings Goal'}</p><p style={{ fontSize: '0.72rem', color: '#9a9ab8', marginTop: 1 }}>{goal.categoryLabel || goal.category || 'Custom'} · {Number(goal.daysRemaining || 0)} days left</p></div></div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: onChainReady ? '#2d7a47' : '#b36a00', background: onChainReady ? '#e8f5ec' : '#fff3dc', padding: '4px 8px', borderRadius: 7 }}>{onChainReady ? 'On-chain' : 'Setup'}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4"><div><p style={{ fontSize: '0.65rem', color: '#b0b0c8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Saved</p><p className="font-display" style={{ fontWeight: 800, color: '#0d0d14', fontSize: '1.1rem' }}>{formatGoalAmount(goal, displayMode, 'saved')}</p></div><div><p style={{ fontSize: '0.65rem', color: '#b0b0c8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Target</p><p className="font-display" style={{ fontWeight: 800, color: '#0d0d14', fontSize: '1.1rem' }}>{formatGoalAmount(goal, displayMode)}</p></div></div>
                <div className="mb-2"><div className="flex justify-between mb-1.5"><span style={{ fontSize: '0.72rem', color: '#6b6b8a' }}>Weekly {formatGoalAmount(goal, displayMode, 'weekly')}</span><span style={{ fontSize: '0.72rem', color: '#5a5a8a', fontWeight: 700 }}>{pct.toFixed(0)}%</span></div><div style={{ height: 7, borderRadius: 99, background: '#f0f0f9', overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #CCCCF7, #9898e8)', borderRadius: 99 }} /></div></div>
              </button>
              <div className="px-5 py-3 flex flex-wrap gap-2" style={{ borderTop: '1px solid rgba(0,0,0,0.05)', background: '#fafafa' }}>
                <button onClick={() => onCreateVaultGoal(goal)} disabled={!vaultReady || onChainReady} className="px-3 py-2 rounded-xl flex items-center gap-1.5" style={{ background: onChainReady ? '#e8f5ec' : '#171717', color: onChainReady ? '#2d7a47' : '#fff', opacity: !vaultReady ? 0.45 : 1, fontWeight: 700, fontSize: '0.75rem' }}><ShieldCheck size={13} />{onChainReady ? 'Ready' : vaultReady ? 'Create on-chain' : 'Vault not set'}</button>
                <button onClick={() => onTopUp(goal)} disabled={!onChainReady} className="px-3 py-2 rounded-xl" style={{ background: '#CCCCF7', color: '#171717', opacity: onChainReady ? 1 : 0.45, fontWeight: 700, fontSize: '0.75rem' }}>Top up</button>
                <button onClick={() => onWithdraw(goal)} disabled={!onChainReady || !hasBalance} className="px-3 py-2 rounded-xl" style={{ background: '#fff3dc', color: '#b36a00', opacity: onChainReady && hasBalance ? 1 : 0.45, fontWeight: 700, fontSize: '0.75rem' }}>Withdraw</button>
                <button onClick={() => onDeleteGoal(goal)} disabled={hasBalance} className="px-3 py-2 rounded-xl" style={{ background: '#fff5f5', color: '#c0392b', opacity: hasBalance ? 0.45 : 1, fontWeight: 700, fontSize: '0.75rem' }}>{onChainReady ? 'Archive' : 'Delete'}</button>
                <button onClick={() => onToggleRoundUp(goal)} className="px-3 py-2 rounded-xl" style={{ background: '#f0f0f9', color: '#3d3d6e', fontWeight: 700, fontSize: '0.75rem' }}>{goal.roundUpEnabled ? 'Round-up on' : 'Round-up off'}</button>
                <button onClick={() => goal.status === 'paused' ? onResumeGoal(goal) : onPauseGoal(goal)} disabled={!onChainReady} className="px-3 py-2 rounded-xl" style={{ background: '#f7f7ff', color: '#3d3d6e', opacity: onChainReady ? 1 : 0.45, fontWeight: 700, fontSize: '0.75rem' }}>{goal.status === 'paused' ? 'Resume' : 'Pause'}</button>
                <button onClick={() => onLogSpend(goal)} className="px-3 py-2 rounded-xl flex items-center gap-1.5" style={{ background: '#fff', color: '#3d3d6e', fontWeight: 700, fontSize: '0.75rem', border: '1px solid rgba(0,0,0,0.07)' }}><TrendingUp size={13} />Log spend</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
