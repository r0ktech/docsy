'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Dialog } from '@/components/ui/dialog';
import { Meter } from '@/components/ui/misc';
import { ThemeToggle } from '@/components/theme-toggle';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/files';
import { formatDate, formatNumber } from '@/lib/format';

function Section({ id, title, description, children }) {
  return (
    <section id={id} className="scroll-mt-20 border-b border-line py-8 first:pt-2 last:border-0">
      <div className="mb-5">
        <h2 className="font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function SettingsView({ account, usage }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(account.name || '');
  const [savingName, setSavingName] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwError, setPwError] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const { limits } = usage;
  const resetDate = new Date(new Date(usage.periodStart).setUTCMonth(new Date(usage.periodStart).getUTCMonth() + 1));

  return (
    <div>
      <Section id="profile" title="Profile">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSavingName(true);
            try {
              await api('/api/account', { method: 'PATCH', body: { name } });
              toast.success('Profile saved');
              router.refresh();
            } catch (err) {
              toast.error(err.message);
            } finally {
              setSavingName(false);
            }
          }}
        >
          <Field label="Name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" />}</Field>
          <Field label="Email" hint={account.providers.includes('google') ? 'Linked to your Google account.' : undefined}>
            {(p) => <Input {...p} value={account.email} readOnly disabled />}
          </Field>
          <Button type="submit" size="sm" loading={savingName} disabled={!name.trim() || name === account.name}>Save profile</Button>
        </form>
      </Section>

      <Section
        id="security"
        title={account.hasPassword ? 'Password' : 'Add a password'}
        description={account.hasPassword ? 'Changing your password signs you out on all other devices.' : 'You sign in with Google. Add a password to sign in with email too.'}
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPwError('');
            if (pw.newPassword.length < 10) return setPwError('Use at least 10 characters.');
            setSavingPw(true);
            try {
              const res = await api('/api/account/password', { method: 'POST', body: account.hasPassword ? pw : { newPassword: pw.newPassword } });
              toast.success(res.signedOut ? `Password saved. Signed out ${res.signedOut} other session${res.signedOut === 1 ? '' : 's'}.` : 'Password saved');
              setPw({ currentPassword: '', newPassword: '' });
              router.refresh();
            } catch (err) {
              setPwError(err.message);
            } finally {
              setSavingPw(false);
            }
          }}
        >
          {account.hasPassword && (
            <Field label="Current password">
              {(p) => <Input {...p} type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />}
            </Field>
          )}
          <Field label="New password" hint="At least 10 characters." error={pwError}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />}
          </Field>
          <Button type="submit" size="sm" loading={savingPw}>{account.hasPassword ? 'Change password' : 'Add password'}</Button>
        </form>

        <div className="mt-6 flex flex-col gap-3 rounded-md border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-medium text-ink">Active sessions</p>
            <p className="text-ink-2">You're signed in on {account.activeSessions} device{account.activeSessions === 1 ? '' : 's'}.</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            loading={sessionsBusy}
            disabled={account.activeSessions <= 1}
            onClick={async () => {
              setSessionsBusy(true);
              try {
                const res = await api('/api/account/sessions', { method: 'DELETE' });
                toast.success(`Signed out ${res.signedOut} other session${res.signedOut === 1 ? '' : 's'}`);
                router.refresh();
              } catch (err) {
                toast.error(err.message);
              } finally {
                setSessionsBusy(false);
              }
            }}
          >
            Sign out other devices
          </Button>
        </div>
      </Section>

      <Section id="usage" title="Usage" description={`Free plan · member since ${formatDate(account.createdAt)}`}>
        <div className="space-y-5 rounded-md border border-line bg-surface p-5">
          <Meter label="Documents" value={usage.documents} max={limits.maxDocuments} detail={`${usage.documents} of ${limits.maxDocuments}`} />
          <Meter label="Storage" value={usage.storageBytes} max={limits.maxStorageBytes} detail={`${formatBytes(usage.storageBytes)} of ${formatBytes(limits.maxStorageBytes)}`} />
          <Meter label="Questions this month" value={usage.questionsThisMonth} max={limits.maxQuestionsPerMonth} detail={`${usage.questionsThisMonth} of ${limits.maxQuestionsPerMonth}`} />
          <p className="text-sm text-ink-2">
            {formatNumber(usage.tokensThisMonth)} AI tokens used this month for search indexing and answers.
          </p>
        </div>
        <ul className="mt-4 space-y-1.5 text-sm text-ink-2">
          <li>Files can be up to {formatBytes(limits.maxUploadBytes)} and {limits.maxPagesPerDocument} pages.</li>
          <li>When you reach the document or storage limit, uploads are paused until you delete documents.</li>
          <li>Question allowance resets on {formatDate(resetDate)} (1st of the month, UTC). Regenerating an answer counts as a question.</li>
          <li>Paid plans with higher limits aren't available yet.</li>
        </ul>
      </Section>

      <Section id="appearance" title="Appearance">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-ink-2">Theme</p>
          <ThemeToggle />
        </div>
      </Section>

      <Section id="danger" title="Delete account" description="Permanently delete your account, documents, files, search indexes and conversations.">
        <Button variant="danger" size="sm" onClick={() => { setConfirmText(''); setDeleteOpen(true); }}>Delete my account</Button>
        <Dialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete your account?"
          description="This permanently deletes everything in your Docsy account. It can't be undone."
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
              <Button
                variant="danger"
                disabled={confirmText !== 'DELETE'}
                loading={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await api('/api/account', { method: 'DELETE', body: { confirm: 'DELETE' } });
                    window.location.assign('/');
                  } catch (err) {
                    toast.error(err.message);
                    setDeleting(false);
                  }
                }}
              >
                Delete account
              </Button>
            </>
          }
        >
          <Field label="Type DELETE to confirm">
            {(p) => <Input {...p} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />}
          </Field>
        </Dialog>
      </Section>
    </div>
  );
}
