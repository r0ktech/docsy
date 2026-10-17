import { tokenize } from '@/server/ai/mock';

/**
 * Citation post-processing. The model cites sources as [n]; this module
 * validates every marker against the sources that were actually supplied,
 * drops anything that doesn't match, and renumbers the cited sources 1..k in
 * order of first appearance. Citation metadata (document, page, offsets) always
 * comes from the retrieved chunk — never from model output.
 */

const MARKER = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

export function extractCitedIds(text) {
  const ids = [];
  for (const m of String(text).matchAll(MARKER)) {
    for (const part of m[1].split(',')) {
      const id = Number.parseInt(part.trim(), 10);
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/**
 * @param {string} text   model output
 * @param {Array<{id:number}>} sources  sources supplied to the model
 * @returns {{ text: string, cited: Array<{ sourceIndex:number, source:object }> }}
 */
export function resolveCitations(text, sources) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const order = extractCitedIds(text).filter((id) => byId.has(id));
  const renumber = new Map(order.map((id, i) => [id, i + 1]));

  const rewritten = String(text).replace(MARKER, (_, group) => {
    const valid = [];
    for (const part of group.split(',')) {
      const n = renumber.get(Number.parseInt(part.trim(), 10));
      if (n && !valid.includes(n)) valid.push(n);
    }
    return valid.map((n) => `[${n}]`).join('');
  });

  return {
    text: rewritten.replace(/[ \t]+([.,;:!?])/g, '$1').replace(/[ \t]{2,}/g, ' '),
    cited: order.map((id) => ({ sourceIndex: renumber.get(id), source: byId.get(id) })),
  };
}

/**
 * Picks the window of a chunk most relevant to the question for display as
 * the citation excerpt. Returns the excerpt plus its offsets within the chunk.
 */
export function bestExcerpt(content, query, maxLength = 320) {
  const text = String(content);
  if (text.length <= maxLength) return { excerpt: text, start: 0, end: text.length };
  const terms = new Set(tokenize(query));
  const sentences = [...text.matchAll(/[^.!?\n]+[.!?]*\s*/g)].map((m) => ({ s: m[0], i: m.index }));
  let best = { score: -1, start: 0, end: Math.min(text.length, maxLength) };
  for (let a = 0; a < sentences.length; a++) {
    let end = a;
    let length = 0;
    let score = 0;
    while (end < sentences.length && length + sentences[end].s.length <= maxLength) {
      length += sentences[end].s.length;
      score += tokenize(sentences[end].s).filter((w) => terms.has(w)).length;
      end++;
    }
    if (end === a) continue;
    if (score > best.score) {
      best = { score, start: sentences[a].i, end: sentences[end - 1].i + sentences[end - 1].s.length };
    }
  }
  const excerpt = text.slice(best.start, best.end).trim();
  return {
    excerpt: (best.start > 0 ? '…' : '') + excerpt + (best.end < text.length ? '…' : ''),
    start: best.start,
    end: best.end,
  };
}
