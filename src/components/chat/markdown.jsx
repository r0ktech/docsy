'use client';
import { Fragment } from 'react';

/**
 * A deliberately small Markdown renderer for model output: paragraphs, lists,
 * headings, bold, italic, inline code, and [n] citation markers. It builds
 * React elements directly — model output is never injected as HTML.
 */
export function Markdown({ text, renderCitation }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        if (b.type === 'ul' || b.type === 'ol') {
          const List = b.type;
          return (
            <List key={i} className={`space-y-1.5 pl-5 ${b.type === 'ul' ? 'list-disc' : 'list-decimal'} marker:text-ink-3`}>
              {b.items.map((item, j) => (
                <li key={j} className="pl-1">{inline(item, renderCitation)}</li>
              ))}
            </List>
          );
        }
        if (b.type === 'h') {
          return <p key={i} className="font-semibold text-ink">{inline(b.text, renderCitation)}</p>;
        }
        if (b.type === 'quote') {
          return <blockquote key={i} className="border-l-2 border-line-strong pl-3 text-ink-2">{inline(b.text, renderCitation)}</blockquote>;
        }
        return <p key={i}>{inline(b.text, renderCitation)}</p>;
      })}
    </div>
  );
}

function parseBlocks(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let para = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join(' ') });
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const h = line.match(/^#{1,6}\s+(.*)$/);
    const q = line.match(/^>\s?(.*)$/);
    if (!line.trim()) {
      flush();
    } else if (ul || ol) {
      flush();
      const type = ul ? 'ul' : 'ol';
      const last = blocks[blocks.length - 1];
      if (last?.type === type) last.items.push((ul || ol)[1]);
      else blocks.push({ type, items: [(ul || ol)[1]] });
    } else if (h) {
      flush();
      blocks.push({ type: 'h', text: h[1] });
    } else if (q) {
      flush();
      blocks.push({ type: 'quote', text: q[1] });
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

const TOKEN = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[\d+(?:\s*,\s*\d+)*\])/g;

function inline(text, renderCitation) {
  const parts = String(text).split(TOKEN);
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="rounded bg-surface-2 px-1 py-0.5 text-[0.9em]">{part.slice(1, -1)}</code>;
    if (/^\*[^*]/.test(part) && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    const cite = part.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/);
    if (cite && renderCitation) {
      return (
        <Fragment key={i}>
          {cite[1].split(',').map((n) => renderCitation(Number(n.trim()), `${i}-${n}`))}
        </Fragment>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
