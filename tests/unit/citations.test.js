import { describe, expect, it } from 'vitest';
import { resolveCitations, extractCitedIds, bestExcerpt } from '@/server/ai/citations';

const sources = [1, 2, 3, 4].map((id) => ({ id, documentName: `Doc ${id}`, content: `content ${id}` }));

describe('resolveCitations', () => {
  it('renumbers cited sources in order of first appearance', () => {
    const { text, cited } = resolveCitations('Rent is due monthly [3]. Deposit is one month [1][3].', sources);
    expect(text).toBe('Rent is due monthly [1]. Deposit is one month [2][1].');
    expect(cited.map((c) => [c.sourceIndex, c.source.id])).toEqual([
      [1, 3],
      [2, 1],
    ]);
  });

  it('drops citations to sources that were never provided (no fabricated citations)', () => {
    const { text, cited } = resolveCitations('Claim [2]. Invented claim [9].', sources);
    expect(text).toBe('Claim [1]. Invented claim.');
    expect(cited).toHaveLength(1);
    expect(cited[0].source.id).toBe(2);
  });

  it('handles comma-separated markers', () => {
    const { text, cited } = resolveCitations('Both say so [4, 2].', sources);
    expect(text).toBe('Both say so [1][2].');
    expect(cited.map((c) => c.source.id)).toEqual([4, 2]);
  });

  it('returns no citations for an answer without markers', () => {
    const result = resolveCitations("The documents don't say.", sources);
    expect(result.cited).toEqual([]);
    expect(result.text).toBe("The documents don't say.");
  });

  it('extracts ids without duplicates', () => {
    expect(extractCitedIds('[1] [2][1] [3, 2]')).toEqual([1, 2, 3]);
  });
});

describe('bestExcerpt', () => {
  it('returns short content unchanged with offsets', () => {
    expect(bestExcerpt('Short text.', 'anything')).toEqual({ excerpt: 'Short text.', start: 0, end: 11 });
  });

  it('picks the window most relevant to the question', () => {
    const filler = 'Unrelated sentence about the weather and the sea. '.repeat(10);
    const target = 'The security deposit equals one month of rent. ';
    const content = filler + target + filler;
    const { excerpt, start, end } = bestExcerpt(content, 'How much is the security deposit?', 120);
    expect(excerpt).toContain('security deposit');
    expect(content.slice(start, end)).toContain('security deposit');
  });
});
