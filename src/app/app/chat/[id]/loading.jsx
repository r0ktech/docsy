import { Skeleton } from '@/components/ui/misc';

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col" aria-busy="true" aria-label="Loading conversation">
      <div className="border-b border-line bg-surface px-6 py-3"><Skeleton className="h-5 w-56" /></div>
      <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8">
        <Skeleton className="ml-auto h-10 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
