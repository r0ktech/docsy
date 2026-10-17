import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { getSessionUser } from '@/server/auth/session';

export default async function MarketingLayout({ children }) {
  const user = await getSessionUser().catch(() => null);
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <SiteHeader signedIn={Boolean(user)} />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
