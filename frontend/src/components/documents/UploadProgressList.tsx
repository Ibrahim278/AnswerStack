import {
  Stack,
  Group,
  Text,
  Progress,
  Button,
  ThemeIcon,
  Paper,
} from '@mantine/core';
import {
  IconCheck,
  IconX,
  IconClock,
  IconUpload,
  IconAlertTriangle,
} from '@tabler/icons-react';

export interface UploadItem {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'failed' | 'duplicate';
  error?: string;
}

interface UploadProgressListProps {
  uploads: UploadItem[];
  onReplace?: (file: File) => void;
  onSkip?: (file: File) => void;
  onUploadAsNew?: (file: File) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusIcon({ status }: { status: UploadItem['status'] }) {
  switch (status) {
    case 'done':
      return (
        <ThemeIcon color="green" size="sm" variant="light">
          <IconCheck size={14} />
        </ThemeIcon>
      );
    case 'failed':
      return (
        <ThemeIcon color="red" size="sm" variant="light">
          <IconX size={14} />
        </ThemeIcon>
      );
    case 'uploading':
      return (
        <ThemeIcon color="blue" size="sm" variant="light">
          <IconUpload size={14} />
        </ThemeIcon>
      );
    case 'duplicate':
      return (
        <ThemeIcon color="yellow" size="sm" variant="light">
          <IconAlertTriangle size={14} />
        </ThemeIcon>
      );
    case 'pending':
    default:
      return (
        <ThemeIcon color="gray" size="sm" variant="light">
          <IconClock size={14} />
        </ThemeIcon>
      );
  }
}

export function UploadProgressList({
  uploads,
  onReplace,
  onSkip,
  onUploadAsNew,
}: UploadProgressListProps) {
  if (uploads.length === 0) return null;

  return (
    <Stack gap="xs">
      {uploads.map((item, index) => (
        <Paper key={`${item.file.name}-${index}`} p="xs" withBorder>
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
              <StatusIcon status={item.status} />
              <div style={{ minWidth: 0 }}>
                <Text size="sm" truncate>
                  {item.file.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {formatFileSize(item.file.size)}
                </Text>
              </div>
            </Group>
          </Group>

          {item.status === 'uploading' && (
            <Progress value={50} size="xs" mt="xs" animated />
          )}

          {item.status === 'failed' && item.error && (
            <Text size="xs" c="red" mt="xs">
              {item.error}
            </Text>
          )}

          {item.status === 'duplicate' && (
            <Group gap="xs" mt="xs">
              <Text size="xs" c="yellow.8">
                File already exists
              </Text>
              {onReplace && (
                <Button size="xs" variant="light" onClick={() => onReplace(item.file)}>
                  Replace
                </Button>
              )}
              {onSkip && (
                <Button size="xs" variant="light" color="gray" onClick={() => onSkip(item.file)}>
                  Skip
                </Button>
              )}
              {onUploadAsNew && (
                <Button size="xs" variant="light" onClick={() => onUploadAsNew(item.file)}>
                  Upload as new
                </Button>
              )}
            </Group>
          )}
        </Paper>
      ))}
    </Stack>
  );
}
