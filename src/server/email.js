import 'server-only';
import { getConfig } from '@/server/config';
import { log } from '@/server/log';

/**
 * Sends transactional email through Resend's HTTP API when configured.
 * Returns { delivered: boolean }. In development without configuration the
 * message is written to the server log so flows can be tested locally.
 */
export async function sendEmail({ to, subject, text }) {
  const config = getConfig();
  if (!config.RESEND_API_KEY || !config.EMAIL_FROM) {
    if (config.NODE_ENV !== 'production') {
      log.info('Email delivery not configured — printing message instead', { to, subject, text });
    } else {
      log.warn('Email delivery not configured; message dropped', { subject });
    }
    return { delivered: false };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.EMAIL_FROM, to, subject, text }),
  });
  if (!res.ok) {
    log.error('Email delivery failed', { status: res.status });
    return { delivered: false };
  }
  return { delivered: true };
}
