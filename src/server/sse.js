import 'server-only';

/**
 * Converts an async generator of { event, data } into a Server-Sent Events
 * response. Generation continues to completion even if the client disconnects,
 * so the answer is still persisted and visible when the user returns.
 */
export function sseResponse(generator) {
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const heartbeat = setInterval(() => send(': keep-alive\n\n'), 15000);
      try {
        for await (const { event, data } of generator) {
          send(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        }
      } finally {
        clearInterval(heartbeat);
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
