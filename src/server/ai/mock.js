import { EMBEDDING_DIMENSIONS } from '@/server/config';

/**
 * Deterministic stand-ins used by the automated test suite (and optionally in
 * local development) so tests never depend on paid API calls.
 *
 * mockEmbed: hashed bag-of-words vectors — lexical, not semantic, but stable
 * and good enough to exercise retrieval end to end.
 * mockAnswer: an extractive answer built only from the supplied sources, so it
 * never invents content. It is clearly labelled in the UI as a test provider.
 */

const STOP = new Set('a an and are as at be by for from has have in is it its of on or that the this to was were will with what which who how why when does do did can'.split(' '));

export function tokenize(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

function stem(w) {
  return w.replace(/(ing|edly|ed|ies|es|s|ly)$/u, '') || w;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mockEmbed(text) {
  const v = new Float32Array(EMBEDDING_DIMENSIONS);
  const words = tokenize(text);
  for (let i = 0; i < words.length; i++) {
    const h = hash(words[i]);
    v[h % EMBEDDING_DIMENSIONS] += h & 1 ? 1 : -1;
    if (i + 1 < words.length) {
      const b = hash(words[i] + ' ' + words[i + 1]);
      v[b % EMBEDDING_DIMENSIONS] += (b & 1 ? 1 : -1) * 0.5;
    }
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return Array.from(v, (x) => x / norm);
}

export function mockAnswer({ question, sources }) {
  if (sources.length === 0) {
    return "The documents in scope don't contain enough information to answer this question.";
  }
  const q = new Set(tokenize(question));
  const picks = sources
    .map((s) => {
      const sentences = s.content.split(/(?<=[.!?])\s+/);
      let best = sentences[0];
      let bestScore = -1;
      for (const sentence of sentences) {
        const score = tokenize(sentence).filter((w) => q.has(w)).length;
        if (score > bestScore) {
          best = sentence;
          bestScore = score;
        }
      }
      return { id: s.id, sentence: best.replace(/\s+/g, ' ').trim(), score: bestScore };
    })
    .filter((p) => p.score > 0)
    .slice(0, 3);
  if (picks.length === 0) {
    return "The documents in scope don't contain enough information to answer this question.";
  }
  return [
    'Here is what the documents say:',
    '',
    ...picks.map((p) => `- "${p.sentence}" [${p.id}]`),
  ].join('\n');
}
