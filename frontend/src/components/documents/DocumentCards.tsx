import { Card, Text, Group, Stack, ActionIcon, Button } from '@mantine/core';
import { IconTrash, IconUpload } from '@tabler/icons-react';
import { useDeleteDocument } from '../../hooks/useDocuments';
import { DocumentStatusBadge } from './DocumentStatusBadge';
import type { DocumentResponse } from '../../types';

interface DocumentCardsProps {
  documents: DocumentResponse[];
  projectId: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getErrorMessage(errorDetail: Record<string, unknown> | null): string {
  if (!errorDetail) return 'An unknown error occurred';
  if (typeof errorDetail.message === 'string') return errorDetail.message;
  if (typeof errorDetail.error === 'string') return errorDetail.error;
  return JSON.stringify(errorDetail);
}

export function DocumentCards({ documents, projectId }: DocumentCardsProps) {
  const deleteDocument = useDeleteDocument();

  return (
    <Stack gap="sm">
      {documents.map((doc) => (
        <Card key={doc.id} withBorder padding="sm" radius="md">
          <Group justify="space-between" wrap="nowrap" mb="xs">
            <Text size="sm" fw={500} truncate style={{ flex: 1 }}>
              {doc.original_filename}
            </Text>
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              onClick={() =>
                deleteDocument.mutate({ projectId, documentId: doc.id })
              }
              loading={deleteDocument.isPending}
              aria-label={`Delete ${doc.original_filename}`}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>

          <DocumentStatusBadge status={doc.status} />

          {doc.status === 'failed' && doc.error_detail && (
            <Stack gap="xs" mt="xs">
              <Text size="xs" c="red">
                {getErrorMessage(doc.error_detail)}
              </Text>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconUpload size={14} />}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.txt,.md,.pdf';
                  input.click();
                }}
              >
                Re-upload
              </Button>
            </Stack>
          )}

          <Group gap="lg" mt="xs">
            <Text size="xs" c="dimmed">
              {doc.file_type}
            </Text>
            <Text size="xs" c="dimmed">
              {formatFileSize(doc.file_size)}
            </Text>
            <Text size="xs" c="dimmed">
              {doc.chunk_count} chunks
            </Text>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
