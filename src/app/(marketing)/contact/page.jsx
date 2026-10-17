import { ProsePage } from '@/components/marketing/prose-page';
import { getConfig } from '@/server/config';

export const metadata = { title: 'Contact' };
export const dynamic = 'force-dynamic';

export default function ContactPage() {
  const email = getConfig().CONTACT_EMAIL;
  return (
    <ProsePage title="Contact">
      {email ? (
        <p>
          Questions, feedback, or a privacy request? Email <a href={`mailto:${email}`}>{email}</a>.
        </p>
      ) : (
        <p>
          The operator of this deployment hasn't published a contact address yet. If you run this deployment, set the{' '}
          <code>CONTACT_EMAIL</code> environment variable to show it here.
        </p>
      )}
    </ProsePage>
  );
}
