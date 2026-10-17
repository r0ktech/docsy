'use client';
import { handleResponse, ApiError } from '@/lib/api';

/**
 * POSTs JSON and reads a Server-Sent Events response, calling onEvent(name, data)
 * for each event. Non-streaming error responses are thrown as ApiError.
 */
export async function postStream(path, body, { onEvent, signal }) {
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', "Can't reach Docsy. Check your connection and try again.");
  }
  if (!res.ok || !res.headers.get('content-type')?.includes('text/event-stream')) {
    await handleResponse(res);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        let event = 'message';
        let data = '';
        for (const line of raw.split('\n')) {
          if (line.startsWith('event: ')) event = line.slice(7);
          else if (line.startsWith('data: ')) data += line.slice(6);
        }
        if (data) onEvent(event, JSON.parse(data));
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'STREAM_INTERRUPTED', 'The connection dropped while the answer was streaming. Reload to see the saved answer.');
  }
}
