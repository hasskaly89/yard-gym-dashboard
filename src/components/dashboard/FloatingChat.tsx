'use client';

import { useEffect, useRef, useState } from 'react';

type ChatMsg = { role: 'user' | 'assistant'; content: string };

const GREETING: ChatMsg = {
  role: 'assistant',
  content: "Hey — ask me about today's tasks, retention, or anything else.",
};

export default function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending, open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const history = messages;
    const next = [...history, { role: 'user' as const, content: trimmed }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/dashboard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history }),
      });
      const json = await res.json();
      setMessages([...next, { role: 'assistant', content: json.reply ?? json.error ?? 'No reply.' }]);
    } catch {
      setMessages([...next, { role: 'assistant', content: "Couldn't reach the assistant — try again." }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[min(380px,calc(100vw-2.5rem))] h-[min(560px,calc(100vh-160px))] bg-white border border-gym-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gym-border flex items-center justify-between flex-none">
            <h2 className="text-sm font-semibold text-gray-900">Ask The Yard</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="text-gray-400 hover:text-gray-600 transition"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2 text-sm whitespace-pre-line ${
                    m.role === 'user'
                      ? 'bg-gym-accent text-white'
                      : 'bg-gray-50 border border-gym-border text-gray-800'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-gray-50 border border-gym-border rounded-xl px-3.5 py-2 text-sm text-gray-400">
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="p-3 border-t border-gym-border flex gap-2 flex-none"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything…"
              disabled={sending}
              autoFocus
              className="flex-1 bg-gray-50 border border-gym-border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:ring-1 focus:ring-gray-200 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="px-3.5 py-2 rounded-lg bg-gym-accent text-white text-sm font-medium hover:bg-gym-accent-hover transition disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-gym-accent text-white shadow-lg hover:bg-gym-accent-hover transition flex items-center justify-center"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        )}
      </button>
    </>
  );
}
