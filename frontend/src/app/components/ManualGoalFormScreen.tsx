import { useMemo, useState } from 'react';
import { Bot, Calendar, ChevronLeft, Target } from 'lucide-react';

type ManualGoalInput = {
  name: string;
  category: string;
  targetAmount: number;
  currency: string;
  deadline: string;
  startingDeposit?: number;
  roundUpEnabled: boolean;
};

interface Props {
  onBack: () => void;
  onAskAi: () => void;
  onCreateGoal: (goal: ManualGoalInput) => Promise<void>;
}

const CATEGORIES = [
  { value: 'rent', label: 'Rent' },
  { value: 'school_fees', label: 'School Fees' },
  { value: 'emergency_fund', label: 'Emergency Fund' },
  { value: 'travel', label: 'Travel' },
  { value: 'gadget', label: 'Gadget' },
  { value: 'custom', label: 'Custom' },
];

const CURRENCIES = [
  { value: 'NGN', label: 'Naira' },
  { value: 'USD', label: 'USDT' },
  { value: 'GHS', label: 'Ghana cedi' },
];

function tomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function ManualGoalFormScreen({ onBack, onAskAi, onCreateGoal }: Props) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('rent');
  const [targetAmount, setTargetAmount] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [deadline, setDeadline] = useState('');
  const [startingDeposit, setStartingDeposit] = useState('');
  const [roundUpEnabled, setRoundUpEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = useMemo(() => {
    return name.trim().length >= 2 && Number(targetAmount) > 0 && Boolean(deadline);
  }, [name, targetAmount, deadline]);

  const submit = async () => {
    setError('');
    if (!canSubmit) {
      setError('Add a goal name, target amount, and deadline.');
      return;
    }

    const selectedDate = new Date(deadline);
    if (Number.isNaN(selectedDate.getTime()) || selectedDate <= new Date()) {
      setError('Choose a future deadline.');
      return;
    }

    setSubmitting(true);
    try {
      await onCreateGoal({
        name: name.trim(),
        category,
        targetAmount: Number(targetAmount),
        currency,
        deadline,
        startingDeposit: startingDeposit ? Number(startingDeposit) : undefined,
        roundUpEnabled,
      });
    } catch (err: any) {
      setError(err?.message || 'Could not create this goal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-28" style={{ background: '#f5f5fb', scrollbarWidth: 'none' }}>
      <div className="px-5 pt-12 pb-4 flex items-center justify-between">
        <button onClick={onBack} style={{ width: 38, height: 38, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}><ChevronLeft size={18} color="#0d0d14" /></button>
        <button onClick={onAskAi} className="px-3 py-2 rounded-xl flex items-center gap-2" style={{ background: '#fff', color: '#3d3d6e', border: '1px solid rgba(204,204,247,0.8)', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', fontSize: '0.78rem', fontWeight: 800 }}><Bot size={15} /> Ask AI</button>
      </div>

      <div className="px-5 pb-4">
        <div style={{ width: 58, height: 58, borderRadius: 20, background: '#171717', color: '#CCCCF7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, boxShadow: '0 6px 18px rgba(23,23,23,0.18)' }}><Target size={25} /></div>
        <h1 className="font-display" style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0d0d14', letterSpacing: '-0.02em' }}>Separate a savings goal</h1>
        <p style={{ color: '#6b6b8a', marginTop: 6, fontSize: '0.86rem', lineHeight: 1.55 }}>Use this when you already know the amount and deadline. Osher turns it into a repeatable weekly habit.</p>
      </div>

      <div className="px-5 flex flex-col gap-4">
        <label className="rounded-3xl p-4" style={{ background: '#fff', boxShadow: '0 3px 12px rgba(0,0,0,0.06)' }}>
          <span className="block" style={{ color: '#6b6b8a', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Goal name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="House rent, school fees, emergency fund" className="w-full outline-none bg-transparent mt-2" style={{ color: '#0d0d14', fontSize: '1rem', fontWeight: 700 }} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="rounded-3xl p-4" style={{ background: '#fff', boxShadow: '0 3px 12px rgba(0,0,0,0.06)' }}>
            <span className="block" style={{ color: '#6b6b8a', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Category</span>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full outline-none bg-transparent mt-2" style={{ color: '#0d0d14', fontSize: '0.94rem', fontWeight: 800 }}>
              {CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>

          <label className="rounded-3xl p-4" style={{ background: '#fff', boxShadow: '0 3px 12px rgba(0,0,0,0.06)' }}>
            <span className="block" style={{ color: '#6b6b8a', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Currency</span>
            <select value={currency} onChange={e => setCurrency(e.target.value)} className="w-full outline-none bg-transparent mt-2" style={{ color: '#0d0d14', fontSize: '0.94rem', fontWeight: 800 }}>
              {CURRENCIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>

        <label className="rounded-3xl p-4" style={{ background: '#fff', boxShadow: '0 3px 12px rgba(0,0,0,0.06)' }}>
          <span className="block" style={{ color: '#6b6b8a', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Target amount</span>
          <input value={targetAmount} onChange={e => setTargetAmount(e.target.value)} inputMode="decimal" type="number" min="0" placeholder={currency === 'NGN' ? '500000' : '200'} className="w-full outline-none bg-transparent mt-2" style={{ color: '#0d0d14', fontSize: '1.35rem', fontWeight: 800 }} />
        </label>

        <label className="rounded-3xl p-4" style={{ background: '#fff', boxShadow: '0 3px 12px rgba(0,0,0,0.06)' }}>
          <span className="block" style={{ color: '#6b6b8a', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Deadline</span>
          <div className="flex items-center gap-2 mt-2">
            <Calendar size={18} color="#9898e8" />
            <input value={deadline} onChange={e => setDeadline(e.target.value)} type="date" min={tomorrowDate()} className="flex-1 outline-none bg-transparent" style={{ color: '#0d0d14', fontSize: '1rem', fontWeight: 800 }} />
          </div>
        </label>

        <label className="rounded-3xl p-4" style={{ background: '#fff', boxShadow: '0 3px 12px rgba(0,0,0,0.06)' }}>
          <span className="block" style={{ color: '#6b6b8a', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>First top-up</span>
          <input value={startingDeposit} onChange={e => setStartingDeposit(e.target.value)} inputMode="decimal" type="number" min="0" placeholder="Optional" className="w-full outline-none bg-transparent mt-2" style={{ color: '#0d0d14', fontSize: '1rem', fontWeight: 700 }} />
          <span className="block" style={{ color: '#9a9ab8', fontSize: '0.72rem', marginTop: 6 }}>Optional. Start tiny, then top up from your wallet when you are ready.</span>
        </label>

        <button onClick={() => setRoundUpEnabled(!roundUpEnabled)} className="rounded-3xl p-4 flex items-center justify-between text-left" style={{ background: '#fff', boxShadow: '0 3px 12px rgba(0,0,0,0.06)' }}>
          <span><span className="block" style={{ color: '#0d0d14', fontWeight: 800 }}>Round-up savings</span><span className="block" style={{ color: '#6b6b8a', fontSize: '0.78rem', marginTop: 2 }}>Turn logged spending into a reminder to save spare change.</span></span>
          <span style={{ width: 48, height: 28, borderRadius: 999, background: roundUpEnabled ? '#171717' : '#e8e8f0', padding: 3, transition: 'background 0.2s ease' }}><span style={{ display: 'block', width: 22, height: 22, borderRadius: '50%', background: roundUpEnabled ? '#CCCCF7' : '#fff', transform: roundUpEnabled ? 'translateX(20px)' : 'translateX(0)', transition: 'transform 0.2s ease' }} /></span>
        </button>

        {error && <div className="rounded-2xl p-3" style={{ background: '#fff5f5', color: '#c0392b', fontSize: '0.82rem', fontWeight: 700 }}>{error}</div>}

        <button onClick={submit} disabled={!canSubmit || submitting} className="py-4 rounded-3xl" style={{ background: canSubmit && !submitting ? '#171717' : '#d8d8e8', color: canSubmit && !submitting ? '#CCCCF7' : '#7f7f9d', fontWeight: 900, fontSize: '0.96rem', boxShadow: canSubmit && !submitting ? '0 7px 22px rgba(23,23,23,0.22)' : 'none' }}>{submitting ? 'Creating plan...' : 'Create Discipline Plan'}</button>
      </div>
    </div>
  );
}
