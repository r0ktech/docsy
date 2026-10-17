/**
 * Splits extracted segments into overlapping chunks sized for embedding and
 * retrieval. Chunks never cross a segment (page) boundary, so every chunk has
 * exactly one page reference, and every chunk records character offsets into
 * its segment so the viewer can highlight the exact passage.
 *
 * Splitting prefers natural boundaries: paragraphs, then sentences, then words.
 */

export const DEFAULT_CHUNK_OPTIONS = { targetTokens: 400, maxTokens: 550, overlapTokens: 60 };

/** Rough token estimate (~4 characters per token for English prose). */
export function estimateTokens(text) {
  return Math.ceil(String(text).length / 4);
}

export function chunkSegments(segments, { paginated, ...opts } = {}) {
  const options = { ...DEFAULT_CHUNK_OPTIONS, ...opts };
  const chunks = [];
  for (const segment of segments) {
    for (const piece of chunkText(segment.text, options)) {
      chunks.push({
        chunkIndex: chunks.length,
        content: piece.text,
        pageNumber: paginated ? segment.number : null,
        segmentNumber: segment.number,
        charStart: piece.start,
        charEnd: piece.end,
        tokenCount: estimateTokens(piece.text),
      });
    }
  }
  return chunks;
}

export function chunkText(text, options = DEFAULT_CHUNK_OPTIONS) {
  const { targetTokens, maxTokens, overlapTokens } = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  const units = splitUnits(text, maxTokens);
  if (units.length === 0) return [];

  const chunks = [];
  let i = 0;
  while (i < units.length) {
    let j = i;
    let tokens = 0;
    // Always take at least one unit; keep adding while under the target.
    while (j < units.length && (j === i || tokens + units[j].tokens <= targetTokens)) {
      tokens += units[j].tokens;
      j++;
    }
    const start = units[i].start;
    const end = units[j - 1].end;
    chunks.push({ text: text.slice(start, end).trim(), start, end });
    if (j >= units.length) break;

    // Step back over trailing units to create overlap, but always advance.
    let k = j;
    let overlap = 0;
    while (k - 1 > i && overlap + units[k - 1].tokens <= overlapTokens) {
      k--;
      overlap += units[k].tokens;
    }
    i = k;
  }
  return chunks.filter((c) => c.text.length > 0);
}

/** Splits text into units no larger than maxTokens, with absolute offsets. */
function splitUnits(text, maxTokens) {
  const units = [];
  for (const para of matchAll(text, /[^\n]+(?:\n(?!\n)[^\n]+)*/g)) {
    if (estimateTokens(para.text) <= maxTokens) {
      units.push(unit(para.start, para.end, para.text));
      continue;
    }
    for (const sentence of matchAll(para.text, /[^.!?]+(?:[.!?]+["')\]]*\s*|$)/g)) {
      const absStart = para.start + sentence.start;
      if (estimateTokens(sentence.text) <= maxTokens) {
        units.push(unit(absStart, absStart + sentence.text.length, sentence.text));
        continue;
      }
      // Very long run-on text: hard-split on word boundaries.
      const maxChars = maxTokens * 4;
      let offset = 0;
      while (offset < sentence.text.length) {
        let end = Math.min(sentence.text.length, offset + maxChars);
        if (end < sentence.text.length) {
          const space = sentence.text.lastIndexOf(' ', end);
          if (space > offset + maxChars / 2) end = space;
        }
        const piece = sentence.text.slice(offset, end);
        units.push(unit(absStart + offset, absStart + end, piece));
        offset = end;
      }
    }
  }
  return units.filter((u) => u.text.trim().length > 0);
}

function unit(start, end, text) {
  return { start, end, text, tokens: estimateTokens(text) };
}

function matchAll(text, regex) {
  const out = [];
  for (const m of text.matchAll(regex)) {
    if (m[0].length === 0) continue;
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}
