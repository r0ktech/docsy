/**
 * Content-based file type detection. The declared extension and MIME type are
 * only hints; the bytes decide.
 */

const PDF_MAGIC = Buffer.from('%PDF-');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const DOCX_MARKER = Buffer.from('word/document.xml');

export function sniffFileType(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buf.length === 0) return null;

  // PDF headers may be preceded by a little junk; the spec allows up to 1 KB.
  if (buf.subarray(0, 1024).indexOf(PDF_MAGIC) !== -1) return 'PDF';

  if (buf.subarray(0, 4).equals(ZIP_MAGIC)) {
    // A DOCX is a ZIP containing word/document.xml (named in the central directory).
    return buf.indexOf(DOCX_MARKER) !== -1 ? 'DOCX' : null;
  }

  return looksLikeText(buf) ? 'TXT' : null;
}

/** UTF-8 (or ASCII) text without NUL bytes and with few control characters. */
export function looksLikeText(buf) {
  const sample = buf.subarray(0, 64 * 1024);
  let control = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) control++;
  }
  if (control / Math.max(1, sample.length) > 0.01) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(trimPartialUtf8(sample, buf.length));
    return true;
  } catch {
    return false;
  }
}

// Avoid rejecting valid UTF-8 just because the 64 KB sample split a character.
function trimPartialUtf8(sample, totalLength) {
  if (sample.length === totalLength) return sample;
  let end = sample.length;
  for (let i = 1; i <= 3 && end - i >= 0; i++) {
    const b = sample[end - i];
    if ((b & 0xc0) === 0xc0) return sample.subarray(0, end - i);
    if ((b & 0x80) === 0) break;
  }
  return sample;
}
