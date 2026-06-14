import { useState } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import { Tip } from '../lib/osher';

const CATEGORIES = ['All', 'Consistency', 'Goal Pacing', 'Round-Ups', 'Emergency', 'Stablecoin', 'Spending'];
const CAT_COLORS: Record<string, { bg: string; color: string }> = { Consistency: { bg: '#e8f5ec', color: '#2d7a47' }, 'Goal Pacing': { bg: '#f0f0ff', color: '#5a5a8a' }, 'Round-Ups': { bg: '#fff3dc', color: '#b36a00' }, Emergency: { bg: '#fff3f3', color: '#c0392b' }, Stablecoin: { bg: '#e8f5ec', color: '#2d7a47' }, Spending: { bg: '#f0f0f9', color: '#6b6b8a' } };
interface Props { tips?: Tip[]; }
function normalizeCategory(category?: string) { const raw = String(category || 'Consistency').replace(/_/g, ' '); return raw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').replace('Round Up', 'Round-Ups'); }

export function TipsScreen({ tips = [] }: Props) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const items = tips.length ? tips.map(tip => ({ cat: normalizeCategory(tip.category), emoji: '💡', title: normalizeCategory(tip.category), body: tip.generatedText || tip.generated_text || '', read: '2 min' })) : [{ cat: 'Consistency', emoji: '💡', title: 'Create your first goal', body: 'Personalised tips will appear after Osher understands your savings goals and activity.', read: '1 min' }];
  const filtered = items.filter(t => (cat === 'All' || t.cat === cat) && (!query || t.title.toLowerCase().includes(query.toLowerCase()) || t.body.toLowerCase().includes(query.toLowerCase())));

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-28" style={{ background: '#f5f5fb', scrollbarWidth: 'none' }}>
      <div className="px-5 pt-12 pb-4"><h1 className="font-display" style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0d0d14', letterSpacing: '-0.02em' }}>Financial Tips</h1><p style={{ fontSize: '0.82rem', color: '#9a9ab8', marginTop: 3 }}>Curated by your Osher AI coach</p></div>
      <div className="px-5 mb-4"><div className="flex items-center gap-3 rounded-2xl px-4 py-3.5" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}><Search size={16} color="#b0b0c8" /><input className="flex-1 outline-none bg-transparent" placeholder="Search tips..." value={query} onChange={e => setQuery(e.target.value)} style={{ fontSize: '0.9rem', color: '#0d0d14', fontFamily: 'inherit' }} /></div></div>
      <div className="px-5 mb-5 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none', paddingBottom: 2 }}>{CATEGORIES.map(c => <button key={c} onClick={() => setCat(c)} className="flex-shrink-0 px-3.5 py-2 rounded-xl" style={{ background: cat === c ? '#171717' : '#fff', color: cat === c ? '#fff' : '#6b6b8a', fontWeight: 600, fontSize: '0.8rem', boxShadow: cat === c ? '0 3px 10px rgba(23,23,23,0.2)' : '0 1px 4px rgba(0,0,0,0.05)', transition: 'all 0.18s' }}>{c}</button>)}</div>
      <div className="px-5 flex flex-col gap-3.5">{filtered.map((tip, index) => { const { bg, color } = CAT_COLORS[tip.cat] || { bg: '#f0f0f9', color: '#6b6b8a' }; return <div key={tip.title + index} className="rounded-2xl overflow-hidden" style={{ background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}><div className="px-5 pt-5 pb-4"><div className="flex items-start gap-3 mb-3"><div style={{ width: 44, height: 44, borderRadius: 14, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>{tip.emoji}</div><div><span style={{ fontSize: '0.65rem', fontWeight: 700, color, background: bg, padding: '2px 7px', borderRadius: 5, display: 'inline-block', marginBottom: 4 }}>{tip.cat}</span><h3 className="font-display" style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0d0d14', lineHeight: 1.25, letterSpacing: '-0.01em' }}>{tip.title}</h3></div></div><p style={{ fontSize: '0.85rem', color: '#6b6b8a', lineHeight: 1.65 }}>{tip.body}</p></div><div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid rgba(0,0,0,0.05)', background: '#fafafa' }}><span style={{ fontSize: '0.72rem', color: '#b0b0c8' }}>{tip.read} read</span><button className="flex items-center gap-1" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#3d3d6e' }}>Read full article <ArrowRight size={13} /></button></div></div>; })}</div>
    </div>
  );
}
