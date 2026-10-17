export function ProsePage({ title, updated, children }) {
  return (
    <article className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="font-serif text-4xl font-medium tracking-[-0.02em] text-ink">{title}</h1>
      {updated && <p className="mt-2 text-sm text-ink-3">Last updated {updated}</p>}
      <div className="prose prose-neutral mt-8 max-w-none font-serif text-[1.05rem] leading-[1.75] dark:prose-invert prose-headings:font-sans prose-headings:tracking-tight prose-a:text-ink">
        {children}
      </div>
    </article>
  );
}
