'use client';
import { UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUpload } from '@/components/app/upload-provider';
import { formatBytes } from '@/lib/files';

export function OnboardingUpload({ maxUploadBytes }) {
  const { openUpload } = useUpload();
  return (
    <section className="rounded-lg border border-line bg-surface p-6 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="grid size-12 shrink-0 place-items-center rounded-full bg-mark text-mark-ink">
          <UploadCloud className="size-5" aria-hidden />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-ink">Add your first document</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            Contracts, papers, manuals, policies, notes — PDF, Word or plain text up to {formatBytes(maxUploadBytes)}.
            It takes a few seconds to index, then you can ask anything about it.
          </p>
        </div>
        <Button onClick={() => openUpload()}>Upload a document</Button>
      </div>
      <ol className="mt-6 grid gap-4 border-t border-line pt-6 text-sm sm:grid-cols-3">
        {[
          ['Upload', 'Docsy extracts the text, page by page.'],
          ['Ask', 'Type a question in plain language.'],
          ['Verify', 'Click any citation to see the exact passage.'],
        ].map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line-strong text-xs font-semibold text-ink-2">{i + 1}</span>
            <span>
              <span className="font-medium text-ink">{title}.</span> <span className="text-ink-2">{body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
