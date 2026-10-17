import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractText, normalizeText, joinWrappedLines } from '@/server/processing/extract';
import { sniffFileType, looksLikeText } from '@/server/processing/filetype';
import { ProcessingError } from '@/server/processing/errors';
import { sample } from '../setup/helpers';

describe('sniffFileType', () => {
  it('identifies real files by content', () => {
    expect(sniffFileType(fs.readFileSync(sample('sample-apartment-lease.pdf')))).toBe('PDF');
    expect(sniffFileType(fs.readFileSync(sample('sample-product-launch-brief.docx')))).toBe('DOCX');
    expect(sniffFileType(fs.readFileSync(sample('sample-remote-work-policy.txt')))).toBe('TXT');
  });

  it('rejects binaries and non-DOCX zip files', () => {
    expect(sniffFileType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toBeNull();
    expect(sniffFileType(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 1]))).toBeNull();
    expect(sniffFileType(Buffer.alloc(0))).toBeNull();
  });

  it('treats a renamed text file as text, not PDF', () => {
    expect(sniffFileType(Buffer.from('this is not really a pdf'))).toBe('TXT');
  });

  it('accepts UTF-8 text with multibyte characters', () => {
    expect(looksLikeText(Buffer.from('Café — naïve résumé 日本語'))).toBe(true);
  });
});

describe('extractText', () => {
  it('extracts PDF text page by page', async () => {
    const result = await extractText(fs.readFileSync(sample('sample-apartment-lease.pdf')), 'PDF');
    expect(result.paginated).toBe(true);
    expect(result.pageCount).toBe(result.segments.length);
    expect(result.segments[0].number).toBe(1);
    expect(result.segments.map((s) => s.text).join(' ')).toContain('sixty (60) days');
  });

  it('extracts DOCX text as a single unpaginated segment', async () => {
    const result = await extractText(fs.readFileSync(sample('sample-product-launch-brief.docx')), 'DOCX');
    expect(result.paginated).toBe(false);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].text).toContain('Tidewater Notes 3.0');
  });

  it('extracts TXT and strips a byte-order mark', async () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Hello\r\nworld')]);
    const result = await extractText(bytes, 'TXT');
    expect(result.segments[0].text).toBe('Hello\nworld');
  });

  it('fails clearly on empty documents', async () => {
    await expect(extractText(Buffer.from('   \n  '), 'TXT')).rejects.toMatchObject({ code: 'EMPTY_DOCUMENT' });
  });

  it('fails clearly on corrupt PDFs', async () => {
    await expect(extractText(Buffer.from('%PDF-1.4\ngarbage that is not a pdf'), 'PDF')).rejects.toBeInstanceOf(ProcessingError);
  });
});

describe('text normalisation', () => {
  it('collapses whitespace but keeps paragraph breaks', () => {
    expect(normalizeText('a  b\t c\n\n\n\nd')).toBe('a b c\n\nd');
  });

  it('re-joins words hyphenated across lines', () => {
    expect(normalizeText('docu-\nment')).toBe('document');
  });

  it('joins PDF lines that wrap mid-sentence but keeps headings', () => {
    expect(joinWrappedLines('the tenant shall\npay rent.\nRENT\nTenant pays')).toBe('the tenant shall pay rent.\nRENT\nTenant pays');
  });
});
