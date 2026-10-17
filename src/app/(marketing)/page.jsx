import Link from 'next/link';
import {
  ShieldCheck,
  FolderTree,
  MessagesSquare,
  BookOpenText,
  Search,
  CircleSlash,
  Check,
  Lock,
  Trash2,
  Server,
  FileWarning,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HeroPreview } from '@/components/marketing/hero-preview';
import { planLimits } from '@/server/services/usage';
import { formatBytes } from '@/lib/files';

export const dynamic = 'force-dynamic';

export default function LandingPage() {
  const limits = planLimits('free');

  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-14 lg:pt-20">
        <div>
          <h1 className="font-serif text-[2.6rem] font-medium leading-[1.04] tracking-[-0.025em] text-ink sm:text-6xl">
            Ask your documents.
            <br />
            Check every answer.
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-ink-2">
            Docsy reads the PDFs, Word files and notes you upload, answers questions in plain language, and shows the
            exact passage — and page — each answer came from.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/sign-up" size="lg">Create a free account</Button>
            <Button href="#how" variant="secondary" size="lg">See how it works</Button>
          </div>
          <p className="mt-5 text-sm text-ink-3">
            Free plan: {limits.maxDocuments} documents and {limits.maxQuestionsPerMonth} questions a month. No card
            needed.
          </p>
        </div>
        <HeroPreview />
      </section>

      {/* How it works — a genuine sequence, so it is numbered */}
      <section id="how" className="scroll-mt-20 border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="max-w-2xl font-serif text-3xl font-medium tracking-[-0.015em] text-ink sm:text-4xl">
            From upload to a cited answer
          </h2>
          <p className="mt-3 max-w-2xl text-ink-2">
            Docsy doesn't paste your whole library into a chatbot. It finds the few passages that matter and makes the
            model answer from those alone.
          </p>
          <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            <Step n={1} title="Upload">
              Drop in a PDF, DOCX or TXT file. Docsy extracts the text page by page, splits it into overlapping
              passages, and indexes each one by meaning and by exact wording.
            </Step>
            <Step n={2} title="Ask">
              Your question is matched against your passages using both kinds of search. Only the most relevant
              handful are sent to the language model, together with strict instructions to stay within them.
            </Step>
            <Step n={3} title="Check">
              Each claim carries a numbered citation. Click it to open the document at that page with the passage
              highlighted. If the documents don't cover something, Docsy says so.
            </Step>
          </ol>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="font-serif text-3xl font-medium tracking-[-0.015em] text-ink sm:text-4xl">
              Built for reading closely
            </h2>
            <p className="mt-3 text-ink-2">
              Contracts, research papers, policies, manuals, meeting notes — anything where you need the answer and
              the line it came from.
            </p>
          </div>
          <dl className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
            <Feature icon={CircleSlash} title="Says when it doesn't know">
              When the documents don't contain the answer, you get a plain statement saying so — not a confident
              guess. Inferences are labelled as inferences.
            </Feature>
            <Feature icon={FolderTree} title="Choose what to ask">
              Ask one document, a hand-picked set, a collection, or your whole library. The active scope is always
              shown above the conversation.
            </Feature>
            <Feature icon={BookOpenText} title="A reader, not just a chat">
              PDFs render page by page with the cited passage highlighted. Word and text files open as clean,
              searchable text.
            </Feature>
            <Feature icon={MessagesSquare} title="Follow-up questions">
              Ask "what about the second option?" and Docsy works out what you mean, then searches again — earlier
              answers never stand in for the sources.
            </Feature>
            <Feature icon={Search} title="Search inside everything">
              Find documents by name or by any phrase inside them, and filter by type, collection or status.
            </Feature>
            <Feature icon={ShieldCheck} title="Your library stays yours">
              Every request is checked against your account on the server. Other people's documents never appear in
              your results.
            </Feature>
          </dl>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="scroll-mt-20 border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="max-w-2xl font-serif text-3xl font-medium tracking-[-0.015em] text-ink sm:text-4xl">
            What happens to your files
          </h2>
          <p className="mt-3 max-w-2xl text-ink-2">
            Plain statements about how Docsy handles documents, so you can decide what to upload.
          </p>
          <ul className="mt-10 grid gap-x-10 gap-y-7 md:grid-cols-2">
            <PrivacyPoint icon={Lock} title="Private storage">
              Files go to private object storage. They are served only to the account that uploaded them, after an
              ownership check on every request.
            </PrivacyPoint>
            <PrivacyPoint icon={Server} title="Only relevant passages leave Docsy">
              Answering a question sends that question and a few matching passages to the AI provider this service is
              configured with. Whole documents are never sent for chat. That provider's data policy applies to those
              passages.
            </PrivacyPoint>
            <PrivacyPoint icon={FileWarning} title="Documents are content, not commands">
              The model is instructed to treat text inside your files as material to read, never as instructions to
              follow, which limits what a malicious document can make it do.
            </PrivacyPoint>
            <PrivacyPoint icon={Trash2} title="Deleting means deleting">
              Delete a document and its file, extracted text and search index are removed. Delete your account and
              everything tied to it goes too.
            </PrivacyPoint>
          </ul>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="font-serif text-3xl font-medium tracking-[-0.015em] text-ink sm:text-4xl">Pricing</h2>
        <p className="mt-3 max-w-2xl text-ink-2">One plan today. These are the limits the service actually enforces.</p>
        <div className="mt-10 grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-ink bg-surface p-7 shadow-md">
            <div className="flex items-baseline justify-between">
              <h3 className="text-lg font-semibold text-ink">Free</h3>
              <p className="font-serif text-4xl font-medium text-ink">$0</p>
            </div>
            <ul className="mt-6 space-y-3 text-sm text-ink">
              <PlanItem>{limits.maxDocuments} documents in your library</PlanItem>
              <PlanItem>{formatBytes(limits.maxStorageBytes)} of total storage</PlanItem>
              <PlanItem>Files up to {formatBytes(limits.maxUploadBytes)} and {limits.maxPagesPerDocument} pages each</PlanItem>
              <PlanItem>{limits.maxQuestionsPerMonth} questions per month, reset on the 1st (UTC)</PlanItem>
              <PlanItem>Collections, cited answers, full conversation history</PlanItem>
            </ul>
            <Button href="/sign-up" className="mt-8 w-full" size="lg">Create a free account</Button>
          </div>
          <div className="rounded-lg border border-dashed border-line-strong p-7">
            <h3 className="text-lg font-semibold text-ink">Higher limits</h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">
              Paid plans with larger libraries and more questions aren't available yet, and there's no way to pay
              today. When you reach a free limit, Docsy tells you which one and what you can do — like deleting
              documents you no longer need.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
          <h2 className="font-serif text-3xl font-medium tracking-[-0.015em] text-ink sm:text-4xl">Questions</h2>
          <div className="divide-y divide-line border-y border-line">
            <Faq q="Which files can I upload?">
              PDF, Word (.docx) and plain-text files, up to {formatBytes(limits.maxUploadBytes)} each. Docsy checks the
              file contents, not just the extension, before accepting them.
            </Faq>
            <Faq q="Does it work with scanned PDFs?">
              Not yet. Docsy reads the text layer of a PDF and doesn't run OCR. If a PDF is a scan with no selectable
              text, Docsy marks it as failed and explains why instead of pretending it was processed. Running it
              through an OCR tool first fixes this.
            </Faq>
            <Faq q="How does Docsy avoid making things up?">
              The model only sees passages retrieved from your documents and is told to answer from them alone, cite
              every claim, and say when the information isn't there. Citations are checked against the passages that
              were actually retrieved, and page numbers come from the document itself — never from the model. No
              system is perfect, which is exactly why every answer links back to its source.
            </Faq>
            <Faq q="Which AI models does it use?">
              Whatever the operator of this deployment configures. The default setup uses Anthropic's Claude for
              answers and an OpenAI or Voyage embedding model for search.
            </Faq>
            <Faq q="What happens when I reach a limit?">
              Uploads or questions are paused with a message naming the limit. Questions reset on the 1st of each
              month; document and storage space free up when you delete documents.
            </Faq>
            <Faq q="Can I delete my data?">
              Yes. Delete individual documents, conversations or collections at any time, or delete your whole account
              from Settings.
            </Faq>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
        <h2 className="font-serif text-3xl font-medium tracking-[-0.015em] text-ink sm:text-4xl">
          Start with one document.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-ink-2">Upload something you'd normally skim, then ask it what you actually need to know.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Button href="/sign-up" size="lg">Create a free account</Button>
          <Link href="/sign-in" className="self-center px-3 text-sm text-ink-2 underline-offset-4 hover:text-ink hover:underline">
            I already have one
          </Link>
        </div>
      </section>
    </>
  );
}

function Step({ n, title, children }) {
  return (
    <li>
      <div className="flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded-full bg-mark font-serif text-base font-semibold text-mark-ink">
          {n}
        </span>
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
      </div>
      <p className="mt-3 leading-relaxed text-ink-2">{children}</p>
    </li>
  );
}

function Feature({ icon: Icon, title, children }) {
  return (
    <div>
      <dt className="flex items-center gap-2.5 font-semibold text-ink">
        <Icon className="size-[18px] text-ink-2" aria-hidden />
        {title}
      </dt>
      <dd className="mt-2 text-sm leading-relaxed text-ink-2">{children}</dd>
    </div>
  );
}

function PrivacyPoint({ icon: Icon, title, children }) {
  return (
    <li className="flex gap-4">
      <Icon className="mt-0.5 size-5 shrink-0 text-ink-2" aria-hidden />
      <div>
        <h3 className="font-semibold text-ink">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{children}</p>
      </div>
    </li>
  );
}

function PlanItem({ children }) {
  return (
    <li className="flex gap-2.5">
      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
      {children}
    </li>
  );
}

function Faq({ q, children }) {
  return (
    <details className="group py-5">
      <summary className="flex list-none items-center justify-between gap-4 font-medium text-ink [&::-webkit-details-marker]:hidden">
        {q}
        <span className="text-xl leading-none text-ink-3 transition-transform group-open:rotate-45" aria-hidden>
          +
        </span>
      </summary>
      <p className="mt-3 max-w-prose leading-relaxed text-ink-2">{children}</p>
    </details>
  );
}
