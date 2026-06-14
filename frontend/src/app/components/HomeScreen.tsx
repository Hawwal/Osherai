import { useState } from 'react';
import { Bell, Plus, TrendingUp, ArrowDownToLine, ArrowUpFromLine, MessageCircle, ChevronRight, Sparkles } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import osherLogo from '../../imports/Osher_wallet_logo.png';
import { AppData, SavingsGoal, categoryEmoji, formatGoalAmount, formatNumber } from '../lib/osher';

interface Props {
  data: AppData;
  displayMode: 'local' | 'usdt';
  onDisplayModeChange: (mode: 'local' | 'usdt') => void;
  onGoalClick: (goal?: SavingsGoal) => void;
  onChatClick: () => void;
  onNotifClick: () => void;
  onAddGoal: () => void;
  onTopUp: (goal: SavingsGoal) => void;
  onWeeklyNudge: () => void;
}

export function HomeScreen({ data, displayMode, onDisplayModeChange, onGoalClick, onChatClick, onNotifClick, onAddGoal, onTopUp, onWeeklyNudge }: Props) {
  const [balanceVisible, setBalanceVisible] = useState(true);
  const goals = data.goals.slice(0, 2);
  const activeGoals = Number(data.dashboard.activeGoalCount || data.goals.filter(goal => goal.status === 'active').length);
  const totalSaved = Number(data.dashboard.totalSavedUSDT || data.goals.reduce((sum, goal) => sum + Number(goal.currentAmountUSDT || 0), 0));
  const monthly = Number(data.dashboard.monthlySavedUSDT || 0);
  const streak = Number(data.dashboard.streakWeeks || 0);

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-32" style={{ scrollbarWidth: 'none', background: '#f5f5fb' }}>
      <div className="px-5 pt-13 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div style={{ width: 42, height: 42, borderRadius: 14, overflow: 'hidden', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', flexShrink: 0 }}>
            <ImageWithFallback src={osherLogo} alt="Osher AI" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div><p style={{ fontSize: '0.72rem', color: '#9a9ab8', fontWeight: 500 }}>Good morning,</p><p className="font-display" style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0d0d14', letterSpacing: '-0.01em' }}>Hawwal</p></div>
        </div>
        <button onClick={onNotifClick} className="relative flex items-center justify-center" style={{ width: 42, height: 42, borderRadius: 14, background: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
          <Bell size={19} color="#0d0d14" />
          <span style={{ position: 'absolute', top: 9, right: 9, width: 8, height: 8, borderRadius: '50%', background: '#e85d4a', border: '2px solid #fff' }} />
        </button>
      </div>

      <div className="mx-4 mb-4 rounded-3xl overflow-hidden" style={{ background: '#171717', boxShadow: '0 8px 32px rgba(23,23,23,0.28)' }}>
        <div style={{ position: 'relative', padding: '22px 22px 0' }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 140, height: 140, borderRadius: '50%', background: 'rgba(204,204,247,0.06)' }} />
          <div className="flex items-start justify-between mb-1 relative z-10">
            <p style={{ fontSize: '0.7rem', color: 'rgba(204,204,247,0.6)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total Saved</p>
            <div className="flex items-center gap-2">
              <button onClick={() => onDisplayModeChange(displayMode === 'local' ? 'usdt' : 'local')} style={{ fontSize: '0.7rem', color: 'rgba(204,204,247,0.75)', fontWeight: 700 }}>{displayMode === 'local' ? 'USDT' : 'Local'}</button>
              <button onClick={() => setBalanceVisible(!balanceVisible)} style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>{balanceVisible ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          <p className="font-display" style={{ fontSize: '2.6rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 4 }}>
            {balanceVisible ? `${formatNumber(totalSaved, 2)} USDT` : '••••••'}
          </p>
          <div className="flex items-center gap-1.5 mb-5"><div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(76,175,117,0.2)', padding: '3px 8px', borderRadius: 6 }}><TrendingUp size={11} color="#4caf75" /><span style={{ fontSize: '0.72rem', color: '#4caf75', fontWeight: 700 }}>+{formatNumber(monthly, 2)} this month</span></div></div>
        </div>
        <div className="grid grid-cols-3 gap-px" style={{ background: 'rgba(255,255,255,0.07)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          {[{ label: 'Active Goals', value: String(activeGoals) }, { label: 'Progress', value: `${formatNumber(data.dashboard.progressPercent || 0, 0)}%` }, { label: 'Streak', value: `${streak} wks` }].map(({ label, value }) => (
            <div key={label} className="px-4 py-3.5" style={{ background: '#171717' }}><p style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</p><p className="font-display" style={{ fontSize: '0.95rem', fontWeight: 700, color: '#CCCCF7' }}>{value}</p></div>
          ))}
        </div>
      </div>

      <div className="px-4 mb-5"><div className="grid grid-cols-4 gap-2.5">
        {[
          { icon: <ArrowDownToLine size={19} />, label: 'Deposit', bg: '#e8f5ec', ic: '#2d7a47', action: () => data.goals[0] && onTopUp(data.goals[0]) },
          { icon: <ArrowUpFromLine size={19} />, label: 'Withdraw', bg: '#fff3f3', ic: '#c0392b', action: () => onGoalClick(data.goals[0]) },
          { icon: <Plus size={19} />, label: 'Add Goal', bg: '#f0f0f9', ic: '#171717', action: onAddGoal },
          { icon: <MessageCircle size={19} />, label: 'AI Chat', bg: '#171717', ic: '#CCCCF7', action: onChatClick },
        ].map(({ icon, label, bg, ic, action }) => (
          <button key={label} onClick={action} className="flex flex-col items-center gap-2 transition-transform active:scale-95"><div style={{ width: 54, height: 54, borderRadius: 18, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ic, boxShadow: label === 'AI Chat' ? '0 4px 14px rgba(23,23,23,0.22)' : '0 1px 5px rgba(0,0,0,0.06)' }}>{icon}</div><span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#6b6b8a' }}>{label}</span></button>
        ))}
      </div></div>

      <button onClick={onWeeklyNudge} className="mx-4 mb-5 rounded-2xl px-4 py-3.5 flex items-center gap-3 text-left" style={{ background: '#CCCCF7' }}>
        <div style={{ width: 30, height: 30, borderRadius: 10, overflow: 'hidden', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }}><ImageWithFallback src={osherLogo} alt="Osher AI" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>
        <div className="flex-1"><p style={{ fontSize: '0.82rem', color: '#171717', fontWeight: 600, lineHeight: 1.4 }}>{data.goals.length ? 'Generate this week\'s personalised Osher summary.' : 'Tell Osher what you are saving for to create your first plan.'}</p></div>
        <ChevronRight size={15} color="#5a5a8a" style={{ flexShrink: 0 }} />
      </button>

      <div className="px-4 mb-5">
        <div className="flex items-center justify-between mb-3"><p className="font-display" style={{ fontWeight: 700, fontSize: '1rem', color: '#0d0d14', letterSpacing: '-0.01em' }}>My Goals</p><button onClick={() => onGoalClick(data.goals[0])} style={{ fontSize: '0.78rem', fontWeight: 600, color: '#9898e8' }}>See all →</button></div>
        <div className="flex flex-col gap-3">
          {goals.length === 0 && <button onClick={onAddGoal} className="w-full rounded-2xl p-5 text-left" style={{ background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}><p className="font-display" style={{ fontWeight: 800, color: '#0d0d14' }}>Create your first goal</p><p style={{ fontSize: '0.82rem', color: '#9a9ab8', marginTop: 4 }}>Chat with Osher to set a rent, school fees, emergency, travel, or custom savings target.</p></button>}
          {goals.map(goal => {
            const pct = Math.max(0, Math.min(100, Number(goal.progressPercent || 0)));
            return (
              <button key={goal.id} onClick={() => onGoalClick(goal)} className="w-full rounded-2xl p-4 text-left transition-transform active:scale-98" style={{ background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
                <div className="flex items-start justify-between mb-3"><div className="flex items-center gap-2.5"><span style={{ fontSize: '1.3rem' }}>{categoryEmoji(goal.category)}</span><div><p className="font-display" style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0d0d14', letterSpacing: '-0.01em' }}>{goal.name || 'Savings Goal'}</p><p style={{ fontSize: '0.7rem', color: '#9a9ab8', fontFamily: "'DM Mono', monospace" }}>Target {formatGoalAmount(goal, displayMode)}</p></div></div><span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#2d7a47', background: '#e8f5ec', padding: '3px 8px', borderRadius: 6 }}>{goal.status || 'Active'}</span></div>
                <div className="mb-2.5"><div className="flex justify-between mb-1.5"><span style={{ fontSize: '0.7rem', color: '#9a9ab8' }}>{formatGoalAmount(goal, displayMode, 'saved')} saved</span><span className="font-mono" style={{ fontSize: '0.7rem', fontWeight: 700, color: '#5a5a8a', fontFamily: "'DM Mono', monospace" }}>{pct.toFixed(0)}%</span></div><div style={{ height: 6, borderRadius: 99, background: '#f0f0f9', overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: 'linear-gradient(90deg, #CCCCF7 0%, #9898e8 100%)', transition: 'width 0.8s ease' }} /></div></div>
                <div className="flex items-center gap-1" style={{ borderTop: '1px solid rgba(0,0,0,0.04)', paddingTop: 9 }}><TrendingUp size={12} color="#CCCCF7" /><p style={{ fontSize: '0.75rem', color: '#9a9ab8' }}>Weekly: <span style={{ fontWeight: 700, color: '#0d0d14' }}>{formatGoalAmount(goal, displayMode, 'weekly')}</span> · <span>{Number(goal.daysRemaining || 0)} days left</span></p></div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 mb-4"><div className="flex items-center justify-between mb-3"><p className="font-display" style={{ fontWeight: 700, fontSize: '1rem', color: '#0d0d14', letterSpacing: '-0.01em' }}>Agent Activity</p><span style={{ fontSize: '0.7rem', color: '#9a9ab8' }}>Latest</span></div><div className="rounded-2xl overflow-hidden" style={{ background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
        {(data.activity.length ? data.activity.slice(0, 3) : [{ message: 'Your agent activity will appear here.', created_at: new Date().toISOString() }]).map((item, i) => (
          <div key={item.id || i} className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: i < Math.min(data.activity.length || 1, 3) - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}><div style={{ width: 34, height: 34, borderRadius: 10, background: i === 0 ? '#e8f5ec' : '#f0f0f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1rem' }}><Sparkles size={15} color="#5a5a8a" /></div><p style={{ flex: 1, fontSize: '0.83rem', color: '#3d3d6e', fontWeight: 500 }}>{item.message || 'Activity recorded'}</p><span style={{ fontSize: '0.68rem', color: '#b0b0c8', flexShrink: 0 }}>{new Date(item.created_at || item.createdAt || Date.now()).toLocaleDateString()}</span></div>
        ))}
      </div></div>

      <div className="mx-4 rounded-2xl px-5 py-4 flex items-center gap-4" style={{ background: '#fff9ed', border: '1px solid rgba(245,200,66,0.2)' }}><span style={{ fontSize: '2.2rem' }}>🔥</span><div className="flex-1"><p className="font-display" style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0d0d14', letterSpacing: '-0.01em' }}>{streak} Weeks Streak</p><p style={{ fontSize: '0.78rem', color: '#b36a00', marginTop: 1 }}>Keep your weekly saving rhythm alive.</p></div><div style={{ width: 36, height: 36, borderRadius: 12, background: '#fff3dc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><TrendingUp size={16} color="#b36a00" /></div></div>
    </div>
  );
}
