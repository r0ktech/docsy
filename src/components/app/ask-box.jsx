'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScopePicker } from '@/components/app/scope-picker';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * Starts a new conversation: creates it with the chosen scope, then hands the
 * question to the chat page, which sends it and streams the answer.
 */
export function AskBox({ collections, documents, initialScope = { type: 'LIBRARY' }, disabled, disabledReason, size = 'lg', autoFocus }) {
  const router = useRouter();
  const toast = useToast();
  const [scope, setScope] = useState(initialScope);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  async function submit(e) {
    e?.preventDefault();
    const q = question.trim();
    if (q.length < 2 || loading) return;
    setLoading(true);
    try {
      const { conversation } = await api('/api/conversations', { method: 'POST', body: { scope } });
      try {
        sessionStorage.setItem(`docsy:pending:${conversation.id}`, q);
      } catch {}
      router.push(`/app/chat/${conversation.id}?ask=1`);
    } catch (err) {
      toast.error(err.message);
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={cn(
        'rounded-lg border border-line-strong bg-surface shadow-md transition-colors focus-within:border-ink',
        disabled && 'opacity-70',
      )}
    >
      <label htmlFor="ask-input" className="sr-only">Ask a question about your documents</label>
      <textarea
        id="ask-input"
        ref={ref}
        value={question}
        autoFocus={autoFocus}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
        }}
        disabled={disabled || loading}
        maxLength={2000}
        rows={size === 'lg' ? 3 : 2}
        placeholder={disabled ? disabledReason : 'Ask your documents anything…'}
        className={cn('block w-full resize-none bg-transparent px-4 pt-4 text-ink placeholder:text-ink-3 focus:outline-none', size === 'lg' ? 'text-base' : 'text-sm')}
      />
      <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
        <ScopePicker value={scope} onChange={setScope} collections={collections} documents={documents} disabled={disabled} />
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-ink-3 sm:inline">Enter to send</span>
          <Button type="submit" size="icon-sm" aria-label="Ask" disabled={disabled || question.trim().length < 2} loading={loading}>
            {!loading && <ArrowUp />}
          </Button>
        </div>
      </div>
    </form>
  );
}
