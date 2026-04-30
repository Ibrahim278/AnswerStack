import { Skeleton } from '@/components/ui/skeleton';

interface PageSkeletonProps {
  type?: 'list' | 'detail' | 'form' | 'chat';
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-[120px] rounded-md" />
      <Skeleton className="h-[120px] rounded-md" />
      <Skeleton className="h-[120px] rounded-md" />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-[200px] rounded-md" />
      <Skeleton className="h-10 rounded-md" />
      <Skeleton className="h-10 rounded-md" />
      <Skeleton className="h-10 rounded-md" />
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-[100px] rounded-sm" />
          <Skeleton className="h-10 rounded-md" />
        </div>
      ))}
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="flex items-start gap-4">
      <div className="flex flex-[2] flex-col gap-4">
        <Skeleton className="h-10 rounded-md" />
        <Skeleton className="h-[300px] rounded-md" />
        <Skeleton className="h-[60px] rounded-md" />
      </div>
      <div className="flex flex-1 flex-col gap-4">
        <Skeleton className="h-10 rounded-md" />
        <Skeleton className="h-[360px] rounded-md" />
      </div>
    </div>
  );
}

export function PageSkeleton({ type = 'list' }: PageSkeletonProps) {
  switch (type) {
    case 'detail':
      return <DetailSkeleton />;
    case 'form':
      return <FormSkeleton />;
    case 'chat':
      return <ChatSkeleton />;
    case 'list':
    default:
      return <ListSkeleton />;
  }
}
