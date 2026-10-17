import { describe, expect, it } from 'vitest';
import { buildTsQuery, reciprocalRankFusion, toVectorLiteral } from '@/server/retrieval/search';
import { mockEmbed } from '@/server/ai/mock';

describe('buildTsQuery', () => {
  it('builds a safe prefix query from free text', () => {
    expect(buildTsQuery('Security deposit!')).toBe('security:* | deposit:*');
  });

  it('strips characters that would break to_tsquery', () => {
    const q = buildTsQuery("rent'); DROP TABLE users; -- & | !");
    expect(q).not.toMatch(/[;'()&!-]/);
    expect(q).toContain('rent:*');
  });

  it('supports AND semantics for library search', () => {
    expect(buildTsQuery('home office', '&')).toBe('home:* & office:*');
  });

  it('returns null when there are no searchable terms', () => {
    expect(buildTsQuery('the of a')).toBeNull();
    expect(buildTsQuery('')).toBeNull();
  });
});

describe('reciprocalRankFusion', () => {
  it('rewards results found by both vector and keyword search', () => {
    const fused = reciprocalRankFusion(
      [{ id: 'a', similarity: 0.9 }, { id: 'b', similarity: 0.8 }],
      [{ id: 'b' }, { id: 'c' }],
    );
    expect(fused[0].id).toBe('b');
    expect(fused.map((f) => f.id).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('vectors', () => {
  it('serialises vectors and rejects invalid values', () => {
    expect(toVectorLiteral([0.5, -1, 0])).toBe('[0.5,-1,0]');
    expect(() => toVectorLiteral([1, NaN])).toThrow();
    expect(() => toVectorLiteral('not a vector')).toThrow();
  });

  it('mock embeddings are deterministic, normalised and 1024-dimensional', () => {
    const a = mockEmbed('security deposit refund');
    expect(a).toHaveLength(1024);
    expect(mockEmbed('security deposit refund')).toEqual(a);
    const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });
});
