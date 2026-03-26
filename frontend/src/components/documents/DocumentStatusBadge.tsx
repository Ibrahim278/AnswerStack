import { Badge } from '@mantine/core';

interface DocumentStatusBadgeProps {
  status: string;
}

function getStatusConfig(status: string): { color: string; label: string } {
  switch (status) {
    case 'uploaded':
      return { color: 'blue', label: 'Uploaded' };
    case 'parsing':
      return { color: 'blue', label: 'Parsing' };
    case 'parsed':
      return { color: 'teal', label: 'Parsed' };
    case 'indexing':
      return { color: 'blue', label: 'Indexing' };
    case 'indexed':
      return { color: 'green', label: 'Indexed' };
    case 'failed':
      return { color: 'red', label: 'Failed' };
    case 'stale':
      return { color: 'orange', label: 'Stale' };
    case 'reindex_required':
      return { color: 'orange', label: 'Reindex Required' };
    default:
      return { color: 'gray', label: status };
  }
}

export function DocumentStatusBadge({ status }: DocumentStatusBadgeProps) {
  const config = getStatusConfig(status);

  return (
    <Badge color={config.color} variant="light" size="sm">
      {config.label}
    </Badge>
  );
}
