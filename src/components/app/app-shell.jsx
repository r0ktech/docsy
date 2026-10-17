'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutGrid,
  Files,
  FolderTree,
  MessagesSquare,
  Plus,
  Upload,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  Settings,
  LogOut,
  ChevronsUpDown,
  TriangleAlert,
  FlaskConical,
} from 'lucide-react';
import { Wordmark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { MenuRoot, MenuTrigger, MenuContent, MenuItem, MenuSeparator, MenuLabel } from '@/components/ui/menu';
import { ThemeToggle } from '@/components/theme-toggle';
import { UploadProvider, useUpload } from '@/components/app/upload-provider';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

const NAV = [
  { href: '/app', label: 'Overview', icon: LayoutGrid, exact: true },
  { href: '/app/documents', label: 'My documents', icon: Files },
  { href: '/app/collections', label: 'Collections', icon: FolderTree },
  { href: '/app/chats', label: 'Recent chats', icon: MessagesSquare },
];

export function AppShell({ user, recentChats, limits, aiStatus, children }) {
  return (
    <UploadProvider limits={limits}>
      <ShellInner user={user} recentChats={recentChats} aiStatus={aiStatus}>
        {children}
      </ShellInner>
    </UploadProvider>
  );
}

function ShellInner({ user, recentChats, aiStatus, children }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('docsy:sidebar') === 'collapsed');
    } catch {}
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem('docsy:sidebar', c ? 'open' : 'collapsed');
      } catch {}
      return !c;
    });
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <a href="#app-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden h-dvh shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[68px]' : 'w-64',
        )}
        aria-label="Sidebar"
      >
        <SidebarContent user={user} recentChats={recentChats} collapsed={collapsed} onToggle={toggleCollapsed} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-ink/30 dark:bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-line bg-surface shadow-lg animate-in">
            <SidebarContent user={user} recentChats={recentChats} onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex h-dvh min-w-0 flex-1 flex-col">
        <header className="z-30 flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden">
          <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu />
          </Button>
          <Link href="/app" aria-label="Docsy overview">
            <Wordmark markClassName="size-6" />
          </Link>
          <MobileUploadButton />
        </header>
        <AiBanner status={aiStatus} />
        {/* The main region is the scroll container, so full-height views (chat) fit exactly. */}
        <main id="app-main" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

function MobileUploadButton() {
  const { openUpload } = useUpload();
  return (
    <Button variant="ghost" size="icon" aria-label="Upload documents" onClick={() => openUpload()}>
      <Upload />
    </Button>
  );
}

function SidebarContent({ user, recentChats, collapsed = false, onToggle, onClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const { openUpload } = useUpload();
  const [query, setQuery] = useState('');

  return (
    <>
      <div className={cn('flex h-14 items-center border-b border-line px-3', collapsed ? 'justify-center' : 'justify-between')}>
        {!collapsed && (
          <Link href="/app" className="rounded-md px-1" aria-label="Docsy overview">
            <Wordmark markClassName="size-6" />
          </Link>
        )}
        {onToggle && (
          <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        )}
        {onClose && (
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close navigation">
            <X />
          </Button>
        )}
      </div>

      <div className={cn('space-y-2 p-3', collapsed && 'px-2.5')}>
        <Button href="/app/chat" className={cn('w-full', collapsed && 'px-0')} title="New chat" aria-label="New chat">
          <Plus />
          {!collapsed && 'New chat'}
        </Button>
        <Button variant="secondary" className={cn('w-full', collapsed && 'px-0')} onClick={() => openUpload()} title="Upload" aria-label="Upload documents">
          <Upload />
          {!collapsed && 'Upload'}
        </Button>
      </div>

      {!collapsed && (
        <form
          role="search"
          className="px-3 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/app/documents${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
          }}
        >
          <label className="relative block">
            <span className="sr-only">Search your library</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search library"
              className="h-9 w-full rounded-md border border-line bg-surface-2 pl-8 pr-3 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:bg-surface focus:outline-none"
            />
          </label>
        </form>
      )}

      <nav aria-label="App" className={cn('space-y-0.5 px-3', collapsed && 'px-2.5')}>
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
                active ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                collapsed && 'justify-center px-0',
              )}
            >
              <Icon className="size-[18px] shrink-0" aria-hidden />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      {!collapsed && recentChats.length > 0 && (
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-3">
          <p className="px-2.5 pb-1.5 text-xs font-medium text-ink-3">Recent</p>
          <ul className="space-y-0.5">
            {recentChats.map((c) => {
              const active = pathname === `/app/chat/${c.id}`;
              return (
                <li key={c.id}>
                  <Link
                    href={`/app/chat/${c.id}`}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block truncate rounded-md px-2.5 py-1.5 text-sm',
                      active ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                    )}
                  >
                    {c.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {(collapsed || recentChats.length === 0) && <div className="flex-1" />}

      <div className={cn('border-t border-line p-3', collapsed && 'px-2.5')}>
        <UserMenu user={user} collapsed={collapsed} />
      </div>
    </>
  );
}

function UserMenu({ user, collapsed }) {
  const router = useRouter();
  const initials = (user.name || user.email).split(/[\s@]/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');
  async function signOut() {
    await api('/api/auth/sign-out', { method: 'POST' }).catch(() => {});
    router.replace('/sign-in');
    router.refresh();
  }
  return (
    <MenuRoot>
      <MenuTrigger asChild>
        <button
          className={cn('flex w-full items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-surface-2', collapsed && 'justify-center')}
          aria-label="Account menu"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-semibold text-ink">{initials}</span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{user.name || 'Your account'}</span>
                <span className="block truncate text-xs text-ink-3">{user.email}</span>
              </span>
              <ChevronsUpDown className="size-4 text-ink-3" aria-hidden />
            </>
          )}
        </button>
      </MenuTrigger>
      <MenuContent align="start" side="top" className="w-60">
        <MenuLabel>Theme</MenuLabel>
        <div className="px-2.5 pb-2">
          <ThemeToggle />
        </div>
        <MenuSeparator />
        <MenuItem icon={Settings} onSelect={() => router.push('/app/settings')}>Settings & usage</MenuItem>
        <MenuItem icon={LogOut} onSelect={signOut}>Sign out</MenuItem>
      </MenuContent>
    </MenuRoot>
  );
}

function AiBanner({ status }) {
  if (status.llm.configured && status.embeddings.configured && !status.llm.mock && !status.embeddings.mock) return null;
  const mock = status.llm.mock || status.embeddings.mock;
  const missing = [!status.llm.configured && 'language model', !status.embeddings.configured && 'embeddings'].filter(Boolean);
  if (missing.length) {
    return (
      <div role="status" className="flex items-start gap-2.5 border-b border-warn/30 bg-warn-soft px-4 py-2.5 text-sm text-ink sm:px-6">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
        <p>
          AI isn't configured on this deployment ({missing.join(' and ')}). Uploads are stored, but processing and
          questions won't work until an administrator adds the provider keys.
        </p>
      </div>
    );
  }
  return mock ? (
    <div role="status" className="flex items-start gap-2.5 border-b border-line bg-info-soft px-4 py-2.5 text-sm text-ink sm:px-6">
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-ink-2" aria-hidden />
      <p>
        Test AI provider active. Search uses keyword-hashed vectors and answers quote retrieved passages verbatim — no
        language model is involved.
      </p>
    </div>
  ) : null;
}

