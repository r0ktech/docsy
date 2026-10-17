// Client-safe file helpers shared by the uploader UI and the server.

export const FILE_TYPES = {
  PDF: { ext: ['pdf'], mime: 'application/pdf', label: 'PDF' },
  DOCX: {
    ext: ['docx'],
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'Word',
  },
  TXT: { ext: ['txt', 'text', 'md'], mime: 'text/plain', label: 'Text' },
};

export const ACCEPT_ATTRIBUTE = '.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown';

export function fileTypeFromName(filename) {
  const ext = String(filename).toLowerCase().split('.').pop();
  for (const [type, def] of Object.entries(FILE_TYPES)) {
    if (def.ext.includes(ext)) return type;
  }
  return null;
}

export function titleFromFilename(filename) {
  const base = String(filename).replace(/\.[^.]+$/, '');
  const cleaned = base.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || 'Untitled document').slice(0, 200);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** Strips path components and control characters from a client filename. */
export function sanitizeFilename(filename) {
  const base = String(filename).split(/[\\/]/).pop() || 'document';
  return base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200) || 'document';
}
