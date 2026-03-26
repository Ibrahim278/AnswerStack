import { Badge } from '@mantine/core';

interface DocumentStatusBadgeProps {
  status: string;
}

function getStatusConfig(status: string): { color: string; label: string; bg: string; text: string; border: string } {
  switch (status) {
    case 'uploaded':
      return { color: 'blue', label: 'Uploaded', bg: 'rgba(20, 92, 176, 0.12)', text: '#124a87', border: 'rgba(20, 92, 176, 0.18)' };
    case 'parsing':
      return { color: 'blue', label: 'Parsing', bg: 'rgba(20, 92, 176, 0.12)', text: '#124a87', border: 'rgba(20, 92, 176, 0.18)' };
    case 'parsed':
      return { color: 'teal', label: 'Parsed', bg: 'rgba(17, 114, 103, 0.12)', text: '#0f5b52', border: 'rgba(17, 114, 103, 0.18)' };
    case 'indexing':
      return { color: 'blue', label: 'Indexing', bg: 'rgba(20, 92, 176, 0.12)', text: '#124a87', border: 'rgba(20, 92, 176, 0.18)' };
    case 'indexed':
      return { color: 'green', label: 'Indexed', bg: 'rgba(18, 128, 109, 0.14)', text: '#0f5147', border: 'rgba(18, 128, 109, 0.22)' };
    case 'failed':
      return { color: 'red', label: 'Failed', bg: 'rgba(176, 44, 44, 0.12)', text: '#8d2424', border: 'rgba(176, 44, 44, 0.18)' };
    case 'stale':
      return { color: 'orange', label: 'Stale', bg: 'rgba(183, 111, 21, 0.14)', text: '#7f4b08', border: 'rgba(183, 111, 21, 0.2)' };
    case 'reindex_required':
      return { color: 'orange', label: 'Needs reindex', bg: 'rgba(183, 111, 21, 0.14)', text: '#7f4b08', border: 'rgba(183, 111, 21, 0.2)' };
    default:
      return { color: 'gray', label: status, bg: 'rgba(73, 91, 82, 0.12)', text: '#33463e', border: 'rgba(73, 91, 82, 0.16)' };
  }
}

export function DocumentStatusBadge({ status }: DocumentStatusBadgeProps) {
  const config = getStatusConfig(status);

  return (
    <Badge
      color={config.color}
      variant="light"
      size="sm"
      styles={{
        root: {
          background: config.bg,
          color: config.text,
          border: `1px solid ${config.border}`,
        },
      }}
    >
      {config.label}
    </Badge>
  );
}
