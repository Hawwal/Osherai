import { Sparkles, X, Target } from 'lucide-react';
import { Recommendation, formatNumber } from '../lib/osher';

interface Props { recommendations?: Recommendation[]; onUpdate?: (rec: Recommendation, status: 'accepted' | 'customised' | 'dismissed') => void; }

export function RecommendationsScreen({ recommendations = [], onUpdate }: Props) {
  const visible = recommendations.filter(rec => (rec.status || 'pending') === 'pending');
  return (
    <div className="flex flex-col h-full overflow-y-auto pb-28" style={{ background: '#f5f5fb', scrollbarWidth: 'none' }}>
      <div className="px-5 pt-12 pb-4"><div className="flex items-center gap-2 mb-2"><Sparkles size={16} color="#9898e8" /><span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#5a5a8a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>AI Suggestions</span></div><h1 className="font-display" style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0d0d14', letterSpacing: '-0.02em' }}>Recommendations</h1><p style={{ fontSize: '0.82rem', color: '#9a9ab8', marginTop: 3 }}>Personalised next moves from Osher.</p></div>
      <div className="px-5 flex flex-col gap-4">
        {visible.length === 0 && <div className="rounded-3xl p-5" style={{ background: '#fff', boxShadow: '0 3px 12px rgba(0,0,0,0.06)' }}><p className="font-display" style={{ fontWeight: 800, color: '#0d0d14' }}>No new recommendations</p><p style={{ fontSize: '0.85rem', color: '#6b6b8a', lineHeight: 1.6, marginTop: 6 }}>Osher will suggest goals after you save, complete a goal, or build enough activity history.</p></div>}
        {visible.map(rec => (
          <div key={rec.id} className="rounded-3xl overflow-hidden" style={{ background: '#fff', boxShadow: '0 3px 12px rgba(0,0,0,0.06)' }}>
            <div className="p-5"><div className="flex items-start justify-between mb-4"><div className="flex items-center gap-3"><div style={{ width: 48, height: 48, borderRadius: 16, background: '#f0f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Target size={22} color="#9898e8" /></div><div><p className="font-display" style={{ fontWeight: 800, color: '#0d0d14', fontSize: '1rem' }}>{rec.suggestedGoalName || 'Savings idea'}</p><p style={{ fontSize: '0.72rem', color: '#9a9ab8', marginTop: 1 }}>{formatNumber(rec.suggestedAmountUSDT || 0, 2)} USDT target</p></div></div><button onClick={() => onUpdate?.(rec, 'dismissed')}><X size={17} color="#b0b0c8" /></button></div><p style={{ fontSize: '0.85rem', color: '#6b6b8a', lineHeight: 1.65 }}>{rec.reasoningText || 'Osher found a useful next goal based on your savings profile.'}</p></div>
            <div className="px-5 py-3 flex gap-2" style={{ borderTop: '1px solid rgba(0,0,0,0.05)', background: '#fafafa' }}><button onClick={() => onUpdate?.(rec, 'accepted')} className="flex-1 py-2.5 rounded-xl" style={{ background: '#171717', color: '#fff', fontWeight: 800, fontSize: '0.82rem' }}>Start Goal</button><button onClick={() => onUpdate?.(rec, 'customised')} className="flex-1 py-2.5 rounded-xl" style={{ background: '#f0f0f9', color: '#3d3d6e', fontWeight: 800, fontSize: '0.82rem' }}>Customise</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}
