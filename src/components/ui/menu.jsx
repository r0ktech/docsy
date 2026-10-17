'use client';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/cn';

export const MenuRoot = Menu.Root;
export const MenuTrigger = Menu.Trigger;

export function MenuContent({ children, align = 'end', className, ...props }) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-50 min-w-48 rounded-md border border-line bg-surface p-1 shadow-md data-[state=open]:animate-in',
          className,
        )}
        {...props}
      >
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

export function MenuItem({ children, className, danger, icon: Icon, ...props }) {
  return (
    <Menu.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        danger && 'text-danger',
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="size-4 shrink-0 text-current opacity-80" aria-hidden />}
      {children}
    </Menu.Item>
  );
}

export function MenuSeparator() {
  return <Menu.Separator className="my-1 h-px bg-line" />;
}

export function MenuLabel({ children }) {
  return <Menu.Label className="px-2.5 py-1.5 text-xs text-ink-3">{children}</Menu.Label>;
}

export const MenuSub = Menu.Sub;
export function MenuSubTrigger({ children, icon: Icon }) {
  return (
    <Menu.SubTrigger className="flex cursor-pointer select-none items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-surface-2 data-[state=open]:bg-surface-2">
      {Icon && <Icon className="size-4 opacity-80" aria-hidden />}
      {children}
    </Menu.SubTrigger>
  );
}
export function MenuSubContent({ children }) {
  return (
    <Menu.Portal>
      <Menu.SubContent sideOffset={4} className="z-50 max-h-72 min-w-48 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-md">
        {children}
      </Menu.SubContent>
    </Menu.Portal>
  );
}
