import { useState, useRef, useEffect, type ReactNode } from 'react';
import { Send, ChevronDown } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import osherLogo from '../../imports/Osher_wallet_logo.png';
import { ChatMessage } from '../lib/osher';

const PROMPTS = [
  { label: 'Create Goal', key: 'I want to create a savings goal.' },
  { label: 'Savings Advice', key: 'How can I save more consistently?' },
  { label: 'Financial Tips', key: 'Give me a financial tip for this week.' },
  { label: 'Emergency Fund', key: 'Help me plan an emergency fund.' },
];

interface Message { role: 'user' | 'ai'; text: string; ts: string; }
interface Props { userName?: string; initialMessages?: ChatMessage[]; onSendMessage: (message: string) => Promise<string>; onDataChanged: () => Promise<void> | void; }

type MarkdownBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'ul' | 'ol'; items: string[] };

function now() { return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
function greetingName(name?: string) { return (name || '').trim() || 'there'; }
function greetingMessage(name?: string): Message { return { role: 'ai', text: `Hi ${greetingName(name)}! I'm your Osher AI savings coach. Tell me your savings goal and I'll create a personalised plan just for you.`, ts: now() }; }
function mapInitialMessages(messages?: ChatMessage[], userName?: string): Message[] {
  const mapped = (messages || [])
    .map(item => ({
      role: item.role === 'user' ? 'user' as const : 'ai' as const,
      text: item.content || item.text || '',
      ts: new Date(item.createdAt || item.created_at || Date.now()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    }))
    .filter(item => item.text.trim());
  return mapped.length ? mapped : [greetingMessage(userName)];
}

function parseInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;

    if (token.startsWith('***') && token.endsWith('***')) {
      nodes.push(<strong key={key} style={{ fontWeight: 800, fontStyle: 'italic' }}>{token.slice(3, -3)}</strong>);
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={key} style={{ fontWeight: 800 }}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(<code key={key} style={{ fontSize: '0.82em', background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 5 }}>{token.slice(1, -1)}</code>);
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (linkMatch) {
        nodes.push(<a key={key} href={linkMatch[2]} target="_blank" rel="noreferrer" style={{ color: '#4b4bd8', fontWeight: 700, textDecoration: 'underline' }}>{linkMatch[1]}</a>);
      }
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = String(text || '').split(/\r?\n/);
  let paragraph: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', text: paragraph.join(' ').trim() });
    paragraph = [];
  };
  const flushList = () => {
    if (!listType || !listItems.length) return;
    blocks.push({ type: listType, items: listItems });
    listType = null;
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', text: heading[1].trim() });
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(bullet[1].trim());
      continue;
    }

    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(numbered[1].trim());
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks.length ? blocks : [{ type: 'paragraph', text }];
}

function MarkdownMessage({ text }: { text: string }) {
  const blocks = parseMarkdownBlocks(text);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return <p key={index} style={{ margin: 0, fontWeight: 800, lineHeight: 1.45 }}>{parseInlineMarkdown(block.text, `h-${index}`)}</p>;
        }
        if (block.type === 'ul') {
          return <ul key={index} style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{parseInlineMarkdown(item, `ul-${index}-${itemIndex}`)}</li>)}</ul>;
        }
        if (block.type === 'ol') {
          return <ol key={index} style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{parseInlineMarkdown(item, `ol-${index}-${itemIndex}`)}</li>)}</ol>;
        }
        return <p key={index} style={{ margin: 0 }}>{parseInlineMarkdown(block.text, `p-${index}`)}</p>;
      })}
    </div>
  );
}

export function AIChatScreen({ userName, initialMessages, onSendMessage, onDataChanged }: Props) {
  const [messages, setMessages] = useState<Message[]>(() => mapInitialMessages(initialMessages, userName));
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialMessages?.length) setMessages(mapInitialMessages(initialMessages, userName));
  }, [initialMessages, userName]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, typing]);

  const send = async (text: string) => {
    if (!text.trim() || typing) return;
    setMessages(items => [...items, { role: 'user', text, ts: now() }]);
    setInput('');
    setTyping(true);
    try {
      const reply = await onSendMessage(text);
      setMessages(items => [...items, { role: 'ai', text: reply, ts: now() }]);
      await onDataChanged();
    } catch (err: any) {
      setMessages(items => [...items, { role: 'ai', text: err?.message || 'Connection error. Is the server running?', ts: now() }]);
    } finally {
      setTyping(false);
    }
  };

  const useStarter = (text: string) => {
    setInput(text);
    requestAnimationFrame(() => {
      const el = document.getElementById('osher-chat-input');
      el?.focus();
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: '#f5f5fb' }}>
      <div className="flex items-center gap-3 px-5 pt-12 pb-4 flex-shrink-0" style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, overflow: 'hidden', background: '#f5f5fb', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', flexShrink: 0 }}><ImageWithFallback src={osherLogo} alt="Osher AI" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>
        <div className="flex-1"><p className="font-display" style={{ fontWeight: 700, fontSize: '1rem', color: '#0d0d14', letterSpacing: '-0.01em' }}>Osher AI</p><div className="flex items-center gap-1.5"><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4caf75', display: 'inline-block' }} /><span style={{ fontSize: '0.72rem', color: '#6b6b8a' }}>Your savings coach · Always on</span></div></div>
        <button style={{ width: 34, height: 34, borderRadius: 10, background: '#f0f0f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronDown size={16} color="#9a9ab8" /></button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 flex flex-col gap-4" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
            {m.role === 'ai' && <div style={{ width: 30, height: 30, borderRadius: 10, overflow: 'hidden', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 20, boxShadow: '0 1px 6px rgba(0,0,0,0.1)' }}><ImageWithFallback src={osherLogo} alt="Osher AI" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>}
            <div style={{ maxWidth: '75%' }}><div style={{ padding: '11px 15px', borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px', background: m.role === 'user' ? '#171717' : '#fff', color: m.role === 'user' ? '#fff' : '#0d0d14', fontSize: '0.9rem', lineHeight: 1.6, whiteSpace: m.role === 'user' ? 'pre-wrap' : 'normal', boxShadow: m.role === 'user' ? '0 3px 12px rgba(23,23,23,0.22)' : '0 2px 8px rgba(0,0,0,0.07)' }}>{m.role === 'ai' ? <MarkdownMessage text={m.text} /> : m.text}</div><p style={{ fontSize: '0.6rem', color: '#c0c0d0', marginTop: 4, textAlign: m.role === 'user' ? 'right' : 'left' }}>{m.ts}</p></div>
          </div>
        ))}
        {typing && <div className="flex items-end gap-2"><div style={{ width: 30, height: 30, borderRadius: 10, overflow: 'hidden', background: '#fff', flexShrink: 0, boxShadow: '0 1px 6px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ImageWithFallback src={osherLogo} alt="Osher AI" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div><div style={{ padding: '12px 16px', borderRadius: '4px 18px 18px 18px', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}><div className="flex gap-1.5 items-center">{[0, 1, 2].map(i => <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#CCCCF7', display: 'inline-block', animation: `typeDot 0.9s ${i * 0.15}s ease-in-out infinite` }} />)}</div></div></div>}
        <div ref={bottomRef} />
      </div>

      <div className="flex-shrink-0" style={{ paddingBottom: 'calc(104px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>{PROMPTS.map(({ label, key }) => <button key={key} onClick={() => useStarter(key)} className="flex-shrink-0 px-3.5 py-2 rounded-xl" style={{ background: '#fff', color: '#3d3d6e', fontSize: '0.78rem', fontWeight: 600, border: '1px solid rgba(204,204,247,0.7)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>{label}</button>)}</div>
        <div className="px-4 pb-3 pt-2"><div className="flex items-end gap-2.5 px-4 py-3" style={{ background: '#fff', borderRadius: 20, border: '1.5px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}><textarea id="osher-chat-input" rows={1} className="flex-1 resize-none outline-none bg-transparent" placeholder="Type your own savings request..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} style={{ fontSize: '0.9rem', color: '#0d0d14', fontFamily: 'inherit', maxHeight: 100, minHeight: 24, lineHeight: 1.5 }} /><button onClick={() => send(input)} disabled={!input.trim() || typing} style={{ width: 38, height: 38, borderRadius: 14, background: input.trim() && !typing ? '#171717' : '#e8e8f0', color: input.trim() && !typing ? '#CCCCF7' : '#b0b0c8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Send size={17} /></button></div></div>
      </div>
      <style>{`@keyframes typeDot { 0%, 60%, 100% { transform: translateY(0); opacity: 0.55; } 30% { transform: translateY(-5px); opacity: 1; } }`}</style>
    </div>
  );
}
