'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowUp,
  Copy,
  Check,
  RotateCw,
  Library,
  FolderTree,
  FileText,
  MoreHorizontal,
  Pencil,
  Trash2,
  TriangleAlert,
  Info,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { MenuRoot, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { Markdown } from '@/components/chat/markdown';
import { SourcePanel } from '@/components/chat/source-panel';
import { api } from '@/lib/api';
import { postStream } from '@/lib/sse';
import { cn } from '@/lib/cn';

export function ChatView({ conversation: initial, suggestions }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(initial.title);
  const [messages, setMessages] = useState(initial.messages);
  const [streaming, setStreaming] = useState(false);
  const [input, setInput] = useState('');
  const [activeSource, setActiveSource] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const startedPending = useRef(false);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
  }, []);

  useEffect(() => scrollToBottom(false), [scrollToBottom]);

  /** Runs one streamed answer. `replaceAssistantId` is set for regenerate. */
  const runStream = useCallback(
    async (path, body, { optimisticUser, replaceAssistantId } = {}) => {
      setStreaming(true);
      const placeholderId = `pending-${Date.now()}`;
      setMessages((list) => {
        let next = replaceAssistantId ? list.filter((m) => m.id !== replaceAssistantId) : [...list];
        if (optimisticUser) next.push(optimisticUser);
        next.push({ id: placeholderId, role: 'ASSISTANT', content: '', status: 'PENDING', stage: 'searching', citations: [] });
        return next;
      });
      setTimeout(() => scrollToBottom(), 30);

      let assistantId = placeholderId;
      const patchAssistant = (patch) =>
        setMessages((list) => list.map((m) => (m.id === assistantId || m.id === placeholderId ? { ...m, ...patch } : m)));

      try {
        await postStream(path, body, {
          onEvent: (event, data) => {
            if (event === 'start') {
              setMessages((list) =>
                list.map((m) => {
                  if (optimisticUser && m.id === optimisticUser.id) return data.userMessage;
                  if (m.id === placeholderId) return { ...m, id: data.assistantMessageId, replyToId: data.userMessage.id };
                  return m;
                }),
              );
              assistantId = data.assistantMessageId;
              if (data.title) setTitle(data.title);
            } else if (event === 'status') {
              patchAssistant({ stage: data.stage, sourceCount: data.sources, documentCount: data.documents });
            } else if (event === 'delta') {
              setMessages((list) =>
                list.map((m) => (m.id === assistantId ? { ...m, content: m.content + data.text, stage: 'writing' } : m)),
              );
            } else if (event === 'done') {
              setMessages((list) => list.map((m) => (m.id === assistantId ? data.message : m)));
            } else if (event === 'title') {
              setTitle(data.title);
            } else if (event === 'error') {
              patchAssistant({ status: 'FAILED', errorMessage: data.message, errorCode: data.code, content: '' });
            }
          },
        });
      } catch (err) {
        if (assistantId === placeholderId) {
          // The request was rejected before anything was saved.
          setMessages((list) =>
            list.filter((m) => m.id !== placeholderId && (!optimisticUser || m.id !== optimisticUser.id)),
          );
          if (optimisticUser) setInput(optimisticUser.content);
          toast.error(err.message);
        } else {
          patchAssistant({ status: 'FAILED', errorMessage: err.message, errorCode: err.code });
        }
      } finally {
        setStreaming(false);
        router.refresh();
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [router, scrollToBottom, toast],
  );

  const ask = useCallback(
    (question) => {
      const q = question.trim();
      if (q.length < 2 || streaming) return;
      setInput('');
      runStream(`/api/conversations/${initial.id}/messages`, { question: q }, {
        optimisticUser: { id: `user-${Date.now()}`, role: 'USER', content: q, status: 'COMPLETE', citations: [] },
      });
    },
    [initial.id, runStream, streaming],
  );

  const regenerate = useCallback(
    (assistant) => {
      if (streaming || !assistant.replyToId) return;
      runStream(`/api/conversations/${initial.id}/regenerate`, { userMessageId: assistant.replyToId }, { replaceAssistantId: assistant.id });
    },
    [initial.id, runStream, streaming],
  );

  // A question handed over from the dashboard / new-chat page.
  useEffect(() => {
    if (startedPending.current) return;
    startedPending.current = true;
    let pending = null;
    try {
      pending = sessionStorage.getItem(`docsy:pending:${initial.id}`);
      if (pending) sessionStorage.removeItem(`docsy:pending:${initial.id}`);
    } catch {}
    if (pending && initial.messages.length === 0) ask(pending);
    if (window.location.search.includes('ask=1')) router.replace(`/app/chat/${initial.id}`, { scroll: false });
  }, [ask, initial.id, initial.messages.length, router]);

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'ASSISTANT');

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader conversation={initial} title={title} onTitle={setTitle} />

        <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite" aria-busy={streaming}>
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
            {messages.length === 0 && !streaming ? (
              <EmptyConversation conversation={initial} suggestions={suggestions} onAsk={ask} />
            ) : (
              <ol className="space-y-8">
                {messages.map((m) => (
                  <li key={m.id}>
                    {m.role === 'USER' ? (
                      <UserMessage message={m} />
                    ) : (
                      <AssistantMessage
                        message={m}
                        canRegenerate={!streaming && m.id === lastAssistant?.id && m.status !== 'PENDING'}
                        onRegenerate={() => regenerate(m)}
                        onOpenSource={setActiveSource}
                        activeSourceId={activeSource?.id}
                      />
                    )}
                  </li>
                ))}
              </ol>
            )}
            <div ref={bottomRef} className="h-2" />
          </div>
        </div>

        <Composer
          inputRef={inputRef}
          value={input}
          onChange={setInput}
          onSubmit={() => ask(input)}
          disabled={streaming}
          scopeLabel={scopeText(initial)}
        />
      </div>

      <SourcePanel citation={activeSource} onClose={() => setActiveSource(null)} />
    </div>
  );
}

function scopeText(c) {
  if (c.scopeType === 'LIBRARY') return 'all documents';
  if (c.scopeType === 'COLLECTION') return c.collection ? `the “${c.collection.name}” collection` : 'a deleted collection';
  if (c.documents.length === 1) return `“${c.documents[0].title}”`;
  return `${c.documents.length} selected documents`;
}

function ChatHeader({ conversation, title, onTitle }) {
  const router = useRouter();
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(title);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const ScopeIcon = conversation.scopeType === 'LIBRARY' ? Library : conversation.scopeType === 'COLLECTION' ? FolderTree : FileText;

  return (
    <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[0.95rem] font-semibold text-ink">{title}</h1>
        <p className="flex items-center gap-1.5 truncate text-xs text-ink-3">
          <ScopeIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            Searching{' '}
            {conversation.scopeType === 'COLLECTION' && conversation.collection ? (
              <Link href={`/app/collections/${conversation.collection.id}`} className="underline-offset-2 hover:underline">
                {conversation.collection.name}
              </Link>
            ) : conversation.scopeType === 'DOCUMENTS' && conversation.documents.length === 1 ? (
              <Link href={`/app/documents/${conversation.documents[0].id}`} className="underline-offset-2 hover:underline">
                {conversation.documents[0].title}
              </Link>
            ) : (
              scopeText(conversation)
            )}
          </span>
        </p>
      </div>
      <MenuRoot>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Conversation actions">
            <MoreHorizontal />
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem icon={Pencil} onSelect={() => { setDraft(title); setRenaming(true); }}>Rename</MenuItem>
          <MenuSeparator />
          <MenuItem icon={Trash2} danger onSelect={() => setDeleting(true)}>Delete conversation</MenuItem>
        </MenuContent>
      </MenuRoot>

      <Dialog open={renaming} onOpenChange={setRenaming} title="Rename conversation" size="sm">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const res = await api(`/api/conversations/${conversation.id}`, { method: 'PATCH', body: { title: draft } });
              onTitle(res.title);
              setRenaming(false);
              router.refresh();
            } catch (err) {
              toast.error(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Title">{(p) => <Input {...p} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={120} autoFocus />}</Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRenaming(false)}>Cancel</Button>
            <Button type="submit" loading={busy} disabled={!draft.trim()}>Save</Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this conversation?"
        description="All questions, answers and citations in it will be permanently deleted. Your documents are not affected."
        confirmLabel="Delete conversation"
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api(`/api/conversations/${conversation.id}`, { method: 'DELETE' });
            toast.success('Conversation deleted');
            router.replace('/app/chats');
            router.refresh();
          } catch (err) {
            toast.error(err.message);
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function EmptyConversation({ conversation, suggestions, onAsk }) {
  const notReady = conversation.scopeType === 'DOCUMENTS' && conversation.documents.every((d) => d.status !== 'READY');
  return (
    <div className="py-10">
      <h2 className="font-serif text-2xl font-medium tracking-[-0.015em] text-ink">What would you like to know?</h2>
      <p className="mt-1.5 text-sm text-ink-2">
        Answers come only from {scopeText(conversation)}, with a citation for every claim.
      </p>
      {notReady && (
        <p className="mt-4 rounded-md bg-warn-soft px-3 py-2 text-sm text-ink">
          The documents in this conversation aren't ready yet. You can ask once processing finishes.
        </p>
      )}
      {suggestions.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-3">
            <Sparkles className="size-3.5" aria-hidden /> Suggested from your documents
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {suggestions.map((q) => (
              <li key={q}>
                <button
                  onClick={() => onAsk(q)}
                  className="h-full w-full rounded-md border border-line bg-surface px-3.5 py-3 text-left text-sm text-ink transition-colors hover:border-line-strong hover:bg-surface-2/60"
                >
                  {q}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function UserMessage({ message }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-surface-3 px-4 py-2.5 text-[0.95rem] leading-relaxed text-ink">
        {message.content}
      </div>
    </div>
  );
}

function AssistantMessage({ message, canRegenerate, onRegenerate, onOpenSource, activeSourceId }) {
  const [copied, setCopied] = useState(false);
  const citations = message.citations || [];
  const byIndex = new Map(citations.map((c) => [c.sourceIndex, c]));

  if (message.status === 'FAILED') {
    return (
      <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-4">
        <div className="flex items-start gap-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <div className="flex-1 text-sm">
            <p className="font-medium text-ink">The answer couldn't be generated</p>
            <p className="mt-1 text-ink-2">{message.errorMessage || errorText(message.errorCode)}</p>
          </div>
        </div>
        {canRegenerate && message.replyToId && (
          <Button variant="secondary" size="sm" className="mt-3" onClick={onRegenerate}>
            <RotateCw /> Try again
          </Button>
        )}
      </div>
    );
  }

  if (message.status === 'PENDING' && !message.content) {
    return (
      <div className="flex items-center gap-2.5 text-sm text-ink-2">
        <Spinner className="size-3.5" />
        {message.stage === 'generating'
          ? `Reading ${message.sourceCount} passage${message.sourceCount === 1 ? '' : 's'} from ${message.documentCount} document${message.documentCount === 1 ? '' : 's'}…`
          : 'Searching your documents…'}
      </div>
    );
  }

  const streamingNow = message.status === 'PENDING';

  return (
    <div className="group/answer">
      <div className={cn('text-[0.95rem] leading-[1.7] text-ink', streamingNow && 'caret')}>
        <Markdown
          text={message.content}
          renderCitation={(n, key) => {
            const c = byIndex.get(n);
            if (streamingNow || !c) {
              // While streaming, markers use provisional numbers; render them neutrally.
              return streamingNow ? (
                <sup key={key} className="ml-0.5 rounded bg-surface-3 px-1 text-[0.65rem] text-ink-3">{n}</sup>
              ) : null;
            }
            return (
              <button
                key={key}
                onClick={() => onOpenSource(c)}
                aria-label={`Source ${n}: ${c.documentName}${c.pageNumber ? `, page ${c.pageNumber}` : ''}`}
                className={cn(
                  'relative -top-[0.45em] ml-0.5 inline-grid h-[1.15rem] min-w-[1.15rem] place-items-center rounded px-1 align-baseline text-[0.65rem] font-semibold leading-none transition-colors',
                  activeSourceId === c.id ? 'bg-mark text-mark-ink ring-1 ring-ink/30' : 'bg-mark-soft text-ink hover:bg-mark hover:text-mark-ink',
                )}
              >
                {n}
              </button>
            );
          }}
        />
      </div>

      {!streamingNow && message.grounding === 'insufficient' && citations.length === 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3">
          <Info className="size-3.5" aria-hidden /> No supporting passages were cited for this answer.
        </p>
      )}

      {!streamingNow && citations.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-ink-3">Sources</p>
          <ul className="space-y-1.5">
            {citations.map((c) => (
              <SourceRow key={c.id} citation={c} active={activeSourceId === c.id} onOpen={() => onOpenSource(c)} />
            ))}
          </ul>
        </div>
      )}

      {!streamingNow && (
        <div className="mt-3 flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/answer:opacity-100 sm:focus-within:opacity-100">
          <Button
            variant="ghost"
            size="xs"
            onClick={async () => {
              await navigator.clipboard.writeText(answerToPlainText(message));
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copied' : 'Copy answer'}
          </Button>
          {canRegenerate && message.replyToId && (
            <Button variant="ghost" size="xs" onClick={onRegenerate}>
              <RotateCw /> Regenerate
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function SourceRow({ citation: c, active, onOpen }) {
  const [copied, setCopied] = useState(false);
  return (
    <li className={cn('group/src flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors', active ? 'border-ink/40 bg-mark-soft/60' : 'border-line bg-surface hover:border-line-strong')}>
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded bg-mark-soft text-[0.65rem] font-semibold text-ink">{c.sourceIndex}</span>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate font-medium text-ink">
          {c.documentName}
          {c.pageNumber ? <span className="font-normal text-ink-3"> · p. {c.pageNumber}</span> : null}
          {!c.documentId && <span className="font-normal text-ink-3"> · deleted</span>}
        </span>
        <span className="mt-0.5 line-clamp-2 font-serif text-[0.9rem] leading-snug text-ink-2">{c.excerpt}</span>
      </button>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(citationToText(c));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="mt-0.5 shrink-0 rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
        aria-label={`Copy citation ${c.sourceIndex}`}
        title="Copy citation"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </li>
  );
}

function Composer({ inputRef, value, onChange, onSubmit, disabled, scopeLabel }) {
  return (
    <div className="border-t border-line bg-bg px-4 pb-4 pt-3 sm:px-6">
      <form
        className="mx-auto flex max-w-3xl items-end gap-2 rounded-lg border border-line-strong bg-surface p-2 shadow-sm focus-within:border-ink"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor="chat-input" className="sr-only">Ask a follow-up question</label>
        <textarea
          id="chat-input"
          ref={inputRef}
          rows={1}
          value={value}
          maxLength={2000}
          onChange={(e) => {
            onChange(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(200, e.target.scrollHeight)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder={disabled ? 'Answering…' : 'Ask a question'}
          className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.95rem] text-ink placeholder:text-ink-3 focus:outline-none"
        />
        <Button type="submit" size="icon-sm" aria-label="Send" disabled={disabled || value.trim().length < 2}>
          <ArrowUp />
        </Button>
      </form>
      <p className="mx-auto mt-2 max-w-3xl truncate text-center text-xs text-ink-3">
        Searching {scopeLabel}. Answers can be wrong — check the cited sources.
      </p>
    </div>
  );
}

function errorText(code) {
  return (
    {
      AI_RATE_LIMITED: 'The AI provider is busy right now. Try again in a minute.',
      AI_UNAVAILABLE: 'The AI provider is unavailable right now. Try again shortly.',
      AI_NOT_CONFIGURED: 'AI is not configured on this deployment.',
      QUESTION_LIMIT_REACHED: "You've reached this month's question limit.",
    }[code] || 'Something went wrong while generating this answer.'
  );
}

export function citationToText(c) {
  return `“${c.excerpt.replace(/^…|…$/g, '')}” — ${c.documentName}${c.pageNumber ? `, p. ${c.pageNumber}` : ''}`;
}

function answerToPlainText(message) {
  const sources = (message.citations || []).map((c) => `[${c.sourceIndex}] ${c.documentName}${c.pageNumber ? `, p. ${c.pageNumber}` : ''}`);
  return sources.length ? `${message.content}\n\nSources:\n${sources.join('\n')}` : message.content;
}
