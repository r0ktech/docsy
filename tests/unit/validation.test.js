import { describe, expect, it } from 'vitest';
import { signUpSchema, scopeSchema, questionSchema } from '@/lib/validation';
import { fileTypeFromName, sanitizeFilename, titleFromFilename, formatBytes } from '@/lib/files';

describe('validation schemas', () => {
  it('normalises email and enforces password length', () => {
    const ok = signUpSchema.parse({ name: ' Ada ', email: ' Ada@Example.COM ', password: 'long enough pw' });
    expect(ok.email).toBe('ada@example.com');
    expect(ok.name).toBe('Ada');
    expect(signUpSchema.safeParse({ name: 'A', email: 'a@b.co', password: 'short' }).success).toBe(false);
    expect(signUpSchema.safeParse({ name: 'A', email: 'not-an-email', password: 'long enough pw' }).success).toBe(false);
  });

  it('validates conversation scopes', () => {
    expect(scopeSchema.safeParse({ type: 'LIBRARY' }).success).toBe(true);
    expect(scopeSchema.safeParse({ type: 'DOCUMENTS', documentIds: [] }).success).toBe(false);
    expect(scopeSchema.safeParse({ type: 'COLLECTION', collectionId: "x'; drop" }).success).toBe(false);
  });

  it('bounds question length', () => {
    expect(questionSchema.safeParse('a').success).toBe(false);
    expect(questionSchema.safeParse('x'.repeat(2001)).success).toBe(false);
  });
});

describe('file helpers', () => {
  it('maps extensions to supported types only', () => {
    expect(fileTypeFromName('Report.PDF')).toBe('PDF');
    expect(fileTypeFromName('notes.md')).toBe('TXT');
    expect(fileTypeFromName('brief.docx')).toBe('DOCX');
    expect(fileTypeFromName('virus.exe')).toBeNull();
    expect(fileTypeFromName('old.doc')).toBeNull();
  });

  it('strips paths and control characters from filenames', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\me\\a\u0000b.pdf')).toBe('ab.pdf');
  });

  it('derives readable titles and sizes', () => {
    expect(titleFromFilename('q3_board_update.pdf')).toBe('q3 board update');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(20 * 1024 * 1024)).toBe('20 MB');
  });
});
