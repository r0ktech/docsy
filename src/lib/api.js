'use client';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** JSON fetch wrapper with consistent error objects and expired-session handling. */
export async function api(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      signal,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', "Can't reach Docsy. Check your connection and try again.");
  }
  return handleResponse(res);
}

export async function handleResponse(res) {
  if (res.ok) return res.status === 204 ? null : res.json();
  let payload = {};
  try {
    payload = await res.json();
  } catch {}
  const error = payload.error || {};
  if (res.status === 401 && typeof window !== 'undefined') {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/sign-in?expired=1&next=${next}`);
  }
  throw new ApiError(res.status, error.code || 'UNKNOWN', error.message || 'Something went wrong. Please try again.', error.details);
}
