'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquarePlus, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

async function startDocumentChat(documentId, question) {
  const { conversation } = await api('/api/conversations', {
    method: 'POST',
    body: { scope: { type: 'DOCUMENTS', documentIds: [documentId] } },
  });
  if (question) {
    try {
      sessionStorage.setItem(`docsy:pending:${conversation.id}`, question);
    } catch {}
  }
  return conversation.id;
}

export function AskDocumentButton({ documentId, disabled }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm"
      disabled={disabled}
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const id = await startDocumentChat(documentId);
          router.push(`/app/chat/${id}`);
        } catch (err) {
          toast.error(err.message);
          setLoading(false);
        }
      }}
    >
      {!loading && <MessageSquarePlus />}
      Ask about this
    </Button>
  );
}

export function SuggestedQuestions({ documentId, questions }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  return (
    <ul className="space-y-1.5">
      {questions.map((q) => (
        <li key={q}>
          <button
            disabled={busy !== null}
            onClick={async () => {
              setBusy(q);
              try {
                const id = await startDocumentChat(documentId, q);
                router.push(`/app/chat/${id}?ask=1`);
              } catch (err) {
                toast.error(err.message);
                setBusy(null);
              }
            }}
            className="group flex w-full items-start gap-2 rounded-md border border-line bg-surface px-3 py-2 text-left text-sm text-ink hover:border-line-strong disabled:opacity-60"
          >
            <span className="flex-1">{q}</span>
            <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-ink-3 group-hover:text-ink" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
