/**
 * Processing failures carry a stable code, a user-facing message, and whether
 * retrying could plausibly succeed (provider outages yes, scanned PDFs no).
 */
export class ProcessingError extends Error {
  constructor(code, message, { retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = 'ProcessingError';
    this.code = code;
    this.retryable = retryable;
  }
}

export const ProcessingErrors = {
  unsupported: () =>
    new ProcessingError('UNSUPPORTED_FILE', 'This file is not a valid PDF, DOCX, or plain-text document.'),
  encrypted: () =>
    new ProcessingError('PDF_ENCRYPTED', 'This PDF is password-protected. Remove the password and upload it again.'),
  corrupt: (cause) =>
    new ProcessingError('FILE_CORRUPT', 'The file could not be read. It may be damaged or in an unsupported variant.', { cause }),
  noText: () =>
    new ProcessingError(
      'NO_EXTRACTABLE_TEXT',
      'This PDF contains little or no selectable text — it is probably a scanned image. Docsy does not run OCR yet, so run it through an OCR tool and upload the result.',
    ),
  empty: () => new ProcessingError('EMPTY_DOCUMENT', 'The document has no readable text.'),
  tooManyPages: (max) =>
    new ProcessingError('TOO_MANY_PAGES', `This document has more than ${max} pages, which is the current limit.`),
  missingFile: () =>
    new ProcessingError('FILE_MISSING', 'The uploaded file could not be found in storage. Delete it and upload again.'),
};
