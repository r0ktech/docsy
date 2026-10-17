import { FileText, CornerDownLeft } from 'lucide-react';

/**
 * Static product preview for the landing page. It shows the real interface
 * pattern — an answer with numbered citations beside the source page with the
 * cited passage highlighted — using an illustrative sample lease.
 */
export function HeroPreview() {
  return (
    <figure className="relative">
      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-xs text-ink-3">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-surface-3" />
            <span className="size-2.5 rounded-full bg-surface-3" />
            <span className="size-2.5 rounded-full bg-surface-3" />
          </span>
          <span className="ml-2 truncate">Apartment lease · 1 document</span>
        </div>

        <div className="grid md:grid-cols-[1.05fr_1fr]">
          {/* Conversation */}
          <div className="space-y-4 p-5">
            <div className="ml-auto w-fit max-w-[90%] rounded-lg rounded-br-sm bg-surface-2 px-3.5 py-2.5 text-sm text-ink">
              How much notice do I need to give before moving out?
            </div>
            <div className="space-y-3 text-[0.9rem] leading-relaxed text-ink">
              <p>
                You need to give at least <strong>60 days' written notice</strong> before the end of the lease term
                <Cite n={1} active />. Notice has to be delivered by email or post to the address in section 1
                <Cite n={2} />.
              </p>
              <p className="text-ink-2">
                The lease doesn't say whether notice can be given early in the term, so that part isn't covered by
                the document.
              </p>
            </div>
            <div className="space-y-1.5 border-t border-line pt-3">
              <SourceRow n={1} page={4} text="…at least sixty (60) days' written notice prior to the end of the Term…" active />
              <SourceRow n={2} page={1} text="Notices shall be sent to the addresses listed above…" />
            </div>
            <div className="flex items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink-3">
              <span className="flex-1">Ask a follow-up…</span>
              <CornerDownLeft className="size-3.5" aria-hidden />
            </div>
          </div>

          {/* Source page */}
          <div className="hidden border-l border-line bg-surface-2/60 p-5 md:block" aria-hidden>
            <div className="mb-3 flex items-center justify-between text-xs text-ink-3">
              <span className="flex items-center gap-1.5">
                <FileText className="size-3.5" /> lease-agreement.pdf
              </span>
              <span className="tabular-nums">Page 4 of 9</span>
            </div>
            <div className="rounded-md bg-surface px-5 py-6 font-serif text-[0.8rem] leading-[1.7] text-ink-2 shadow-sm">
              <p className="mb-2 font-sans text-[0.7rem] font-semibold text-ink">12. Termination</p>
              <p className="mb-3">
                12.1 This Lease shall automatically renew on a month-to-month basis unless either party provides{' '}
                <span className="mark-sweep text-ink">
                  at least sixty (60) days' written notice prior to the end of the Term
                </span>{' '}
                of its intention not to renew.
              </p>
              <p className="mb-3">
                12.2 Tenant shall return all keys and access devices to Landlord on or before the final day of
                occupancy.
              </p>
              <p>12.3 Any property remaining after vacating may be disposed of in accordance with applicable law.</p>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-xs text-ink-3">Interface preview with a sample lease agreement.</figcaption>
    </figure>
  );
}

function Cite({ n, active }) {
  return (
    <sup
      className={`ml-0.5 inline-grid h-[1.15rem] min-w-[1.15rem] place-items-center rounded px-1 align-[0.15em] text-[0.65rem] font-semibold not-italic ${
        active ? 'bg-mark text-mark-ink' : 'bg-surface-3 text-ink-2'
      }`}
    >
      {n}
    </sup>
  );
}

function SourceRow({ n, page, text, active }) {
  return (
    <div className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-xs ${active ? 'bg-mark-soft' : ''}`}>
      <span className={`mt-px grid size-4 shrink-0 place-items-center rounded text-[0.6rem] font-semibold ${active ? 'bg-mark text-mark-ink' : 'bg-surface-3 text-ink-2'}`}>
        {n}
      </span>
      <span className="text-ink-2">
        <span className="font-medium text-ink">lease-agreement.pdf · p. {page}</span> — {text}
      </span>
    </div>
  );
}
