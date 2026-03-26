import { Card, Text, Group, Stack, Button } from '@mantine/core';
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
    <Stack gap="xs">
      {documents.map((doc) => (
        <Card key={doc.id} withBorder padding="sm" radius="xl" className="surface-card document-mobile-card">
          <Stack gap="sm">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" fw={700} truncate>
                  {doc.original_filename}
                </Text>
                <Text size="xs" c="dimmed">
                  {doc.file_type.toUpperCase()} • {formatFileSize(doc.file_size)} • {doc.chunk_count} chunks
                </Text>
              </Stack>
              <Button
                variant="subtle"
                color="red"
                size="xs"
                className="document-action-button"
                leftSection={<IconTrash size={14} />}
                onClick={() =>
                  deleteDocument.mutate({ projectId, documentId: doc.id })
                }
                loading={deleteDocument.isPending}
                aria-label={`Delete ${doc.original_filename}`}
              >
                Delete
              </Button>
            </Group>

            <DocumentStatusBadge status={doc.status} />

            {doc.status === 'failed' && doc.error_detail && (
              <Stack gap="xs">
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

            <Group gap="sm" className="document-mobile-card__meta">
              <Text size="xs" c="dimmed">
                Ready for grounded answers
              </Text>
              <Text size="xs" c="dimmed">
                Manage directly from this card
              </Text>
            </Group>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
