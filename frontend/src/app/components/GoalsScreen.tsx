import { Plus, TrendingUp, ShieldCheck } from 'lucide-react';
import { ContractsConfig, SavingsGoal, categoryEmoji, formatGoalAmount } from '../lib/osher';

interface Props {
  goals: SavingsGoal[];
  displayMode: 'local' | 'usdt';
  contracts: ContractsConfig;
  onGoalClick: (goal?: SavingsGoal) => void;
  onCreateVaultGoal: (goal: SavingsGoal) => void;
  onTopUp: (goal: SavingsGoal) => void;
  onToggleRoundUp: (goal: SavingsGoal) => void;
  onLogSpend: (goal: SavingsGoal) => void;
}

export function GoalsScreen({ goals, displayMode, contracts, onGoalClick, onCreateVaultGoal, onTopUp, onToggleRoundUp, onLogSpend }: Props) {
  return (
    <div className="flex flex-col h-full overflow-y-auto pb-28" style={{ background: '#f5f5fb', scrollbarWidth: 'none' }}>
      <div className="px-5 pt-12 pb-4 flex items-center justify-between">
        <div><h1 className="font-display" style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0d0d14', letterSpacing: '-0.02em' }}>Savings Goals</h1><p style={{ fontSize: '0.82rem', color: '#9a9ab8', marginTop: 3 }}>Track every goal Osher is helping with.</p></div>
        <button onClick={() => onGoalClick(undefined)} style={{ width: 42, height: 42, borderRadius: 14, background: '#171717', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(23,23,23,0.22)' }}><Plus size={19} color="#CCCCF7" /></button>
      </div>

      <div className="px-5 flex flex-col gap-4">
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
                <button onClick={() => onToggleRoundUp(goal)} className="px-3 py-2 rounded-xl" style={{ background: '#f0f0f9', color: '#3d3d6e', fontWeight: 700, fontSize: '0.75rem' }}>{goal.roundUpEnabled ? 'Round-up on' : 'Round-up off'}</button>
                <button onClick={() => onLogSpend(goal)} className="px-3 py-2 rounded-xl flex items-center gap-1.5" style={{ background: '#fff', color: '#3d3d6e', fontWeight: 700, fontSize: '0.75rem', border: '1px solid rgba(0,0,0,0.07)' }}><TrendingUp size={13} />Log spend</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
