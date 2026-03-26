import { Stack, Skeleton, Group } from '@mantine/core';

interface PageSkeletonProps {
  type?: 'list' | 'detail' | 'form' | 'chat';
}

function ListSkeleton() {
  return (
    <Stack gap="md">
      <Skeleton height={120} radius="md" />
      <Skeleton height={120} radius="md" />
      <Skeleton height={120} radius="md" />
    </Stack>
  );
}

function DetailSkeleton() {
  return (
    <Stack gap="md">
      <Skeleton height={200} radius="md" />
      <Skeleton height={40} radius="md" />
      <Skeleton height={40} radius="md" />
      <Skeleton height={40} radius="md" />
    </Stack>
  );
}

function FormSkeleton() {
  return (
    <Stack gap="lg">
      {Array.from({ length: 5 }, (_, i) => (
        <Stack key={i} gap="xs">
          <Skeleton height={20} width={100} radius="sm" />
          <Skeleton height={40} radius="md" />
        </Stack>
      ))}
    </Stack>
  );
}

function ChatSkeleton() {
  return (
    <Group align="flex-start" gap="md" grow>
      <Stack gap="md" style={{ flex: 2 }}>
        <Skeleton height={40} radius="md" />
        <Skeleton height={300} radius="md" />
        <Skeleton height={60} radius="md" />
      </Stack>
      <Stack gap="md" style={{ flex: 1 }}>
        <Skeleton height={40} radius="md" />
        <Skeleton height={360} radius="md" />
      </Stack>
    </Group>
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
