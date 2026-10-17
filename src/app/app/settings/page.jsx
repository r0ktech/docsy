import { requireUser } from '@/server/auth/session';
import { getAccount } from '@/server/services/account';
import { getUsage } from '@/server/services/usage';
import { PageHeader, PageBody } from '@/components/app/page-header';
import { SettingsView } from '@/components/app/settings-view';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await requireUser();
  const [account, usage] = await Promise.all([getAccount(user.id), getUsage(user.id, user.plan)]);
  return (
    <>
      <PageHeader title="Settings" description="Your profile, security, usage and appearance." />
      <PageBody className="max-w-3xl">
        <SettingsView account={JSON.parse(JSON.stringify(account))} usage={JSON.parse(JSON.stringify(usage))} />
      </PageBody>
    </>
  );
}
