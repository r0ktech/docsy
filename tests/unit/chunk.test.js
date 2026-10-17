import { describe, expect, it } from 'vitest';
import { chunkText, chunkSegments, estimateTokens } from '@/server/processing/chunk';

const paragraph = (n, words = 60) =>
  Array.from({ length: words }, (_, i) => `word${n}_${i}`).join(' ') + '.';

describe('chunkText', () => {
  it('returns nothing for empty text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  it('keeps a short text as one chunk with exact offsets', () => {
    const text = 'Hello world. This is short.';
    const [chunk] = chunkText(text);
    expect(chunk.text).toBe(text);
    expect(text.slice(chunk.start, chunk.end)).toBe(text);
  });

  it('splits long text into chunks within the size budget', () => {
    const text = Array.from({ length: 30 }, (_, i) => paragraph(i)).join('\n\n');
    const chunks = chunkText(text, { targetTokens: 400, maxTokens: 550, overlapTokens: 60 });
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(estimateTokens(c.text)).toBeLessThanOrEqual(550);
  });

  it('offsets always point at the chunk text in the source', () => {
    const text = Array.from({ length: 20 }, (_, i) => paragraph(i, 80)).join('\n\n');
    for (const c of chunkText(text)) {
      expect(text.slice(c.start, c.end).trim()).toBe(c.text);
    }
  });

  it('overlaps consecutive chunks so context is not lost at boundaries', () => {
    const text = Array.from({ length: 40 }, (_, i) => paragraph(i, 25)).join('\n\n');
    const chunks = chunkText(text, { targetTokens: 300, maxTokens: 450, overlapTokens: 80 });
    let overlapping = 0;
    for (let i = 1; i < chunks.length; i++) if (chunks[i].start < chunks[i - 1].end) overlapping++;
    expect(overlapping).toBeGreaterThan(0);
  });

  it('always makes progress, even on a single huge run-on sentence', () => {
    const text = Array.from({ length: 5000 }, (_, i) => `w${i}`).join(' ');
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.at(-1).end).toBe(text.length);
  });
});

describe('chunkSegments', () => {
  it('keeps page numbers for paginated documents and never crosses pages', () => {
    const segments = [
      { number: 1, text: paragraph(1) },
      { number: 2, text: paragraph(2) },
    ];
    const chunks = chunkSegments(segments, { paginated: true });
    expect(chunks.map((c) => c.pageNumber)).toEqual([1, 2]);
    expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1]);
  });

  it('records no page number for unpaginated formats', () => {
    const chunks = chunkSegments([{ number: 1, text: paragraph(1) }], { paginated: false });
    expect(chunks[0].pageNumber).toBeNull();
    expect(chunks[0].segmentNumber).toBe(1);
  });
});
