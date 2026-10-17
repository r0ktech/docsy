import { ProcessingErrors, ProcessingError } from '@/server/processing/errors';

/**
 * Text extraction. Returns segments that preserve source structure:
 *  - PDF: one segment per physical page (number = page number)
 *  - DOCX / TXT: a single segment (these formats have no fixed pagination)
 */
export async function extractText(bytes, fileType, { maxPages = 500 } = {}) {
  switch (fileType) {
    case 'PDF':
      return extractPdf(bytes, maxPages);
    case 'DOCX':
      return extractDocx(bytes);
    case 'TXT':
      return extractTxt(bytes);
    default:
      throw ProcessingErrors.unsupported();
  }
}

// Below this many extractable characters per page on average, a PDF is almost
// certainly scanned images rather than real text.
const MIN_CHARS_PER_PAGE = 40;

async function extractPdf(bytes, maxPages) {
  const { getDocumentProxy, extractText: unpdfExtract } = await import('unpdf');
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch (err) {
    if (err?.name === 'PasswordException') throw ProcessingErrors.encrypted();
    throw ProcessingErrors.corrupt(err);
  }
  try {
    if (pdf.numPages > maxPages) throw ProcessingErrors.tooManyPages(maxPages);
    const { totalPages, text } = await unpdfExtract(pdf, { mergePages: false });
    const segments = text.map((t, i) => ({ number: i + 1, text: joinWrappedLines(normalizeText(t)) }));
    const totalChars = segments.reduce((n, s) => n + s.text.length, 0);
    if (totalChars === 0 || totalChars / Math.max(1, totalPages) < MIN_CHARS_PER_PAGE) {
      throw ProcessingErrors.noText();
    }
    return { segments, pageCount: totalPages, paginated: true };
  } catch (err) {
    if (err instanceof ProcessingError) throw err;
    throw ProcessingErrors.corrupt(err);
  } finally {
    await pdf.destroy?.().catch?.(() => {});
  }
}

async function extractDocx(bytes) {
  const mammoth = (await import('mammoth')).default;
  let result;
  try {
    result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  } catch (err) {
    throw ProcessingErrors.corrupt(err);
  }
  const text = normalizeText(result.value);
  if (!text) throw ProcessingErrors.empty();
  return { segments: [{ number: 1, text }], pageCount: null, paginated: false };
}

function extractTxt(bytes) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw ProcessingErrors.unsupported();
  }
  text = normalizeText(text.replace(/^﻿/, ''));
  if (!text) throw ProcessingErrors.empty();
  return { segments: [{ number: 1, text }], pageCount: null, paginated: false };
}

/**
 * PDF text arrives with a hard break at the end of every visual line. Lines
 * are re-joined when the break falls mid-sentence (the next line starts in
 * lowercase); headings and list items keep their own lines.
 */
export function joinWrappedLines(text) {
  return text.replace(/([^.!?:;\n])\n(?=[a-z(])/g, '$1 ');
}

/**
 * Normalises whitespace while keeping paragraph boundaries (blank lines),
 * which the chunker relies on.
 */
export function normalizeText(input) {
  return String(input)
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/(\w)-\n(\w)/g, '$1$2') // re-join words hyphenated across lines
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
