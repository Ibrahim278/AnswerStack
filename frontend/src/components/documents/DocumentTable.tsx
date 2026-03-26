import { useState } from 'react';
import {
  Table,
  Group,
  Text,
  UnstyledButton,
  Collapse,
  Stack,
  Button,
  Tooltip,
  Paper,
  Badge,
} from '@mantine/core';
import {
  IconTrash,
  IconChevronDown,
  IconChevronRight,
  IconSortAscending,
  IconSortDescending,
  IconUpload,
} from '@tabler/icons-react';
import { useDeleteDocument } from '../../hooks/useDocuments';
import { DocumentStatusBadge } from './DocumentStatusBadge';
import type { DocumentResponse } from '../../types';

interface DocumentTableProps {
  documents: DocumentResponse[];
  projectId: string;
}

type SortField = 'original_filename' | 'file_type' | 'file_size' | 'status' | 'chunk_count' | 'updated_at';
type SortDirection = 'asc' | 'desc';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function SortableHeader({
  label,
  field,
  sortField,
  sortDirection,
  onSort,
}: {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}) {
  const isActive = sortField === field;
  return (
    <UnstyledButton onClick={() => onSort(field)}>
      <Group gap={4} wrap="nowrap">
        <Text size="sm" fw={700}>
          {label}
        </Text>
        {isActive &&
          (sortDirection === 'asc' ? (
            <IconSortAscending size={14} />
          ) : (
            <IconSortDescending size={14} />
          ))}
      </Group>
    </UnstyledButton>
  );
}

function getErrorMessage(errorDetail: Record<string, unknown> | null): string {
  if (!errorDetail) return 'An unknown error occurred';
  if (typeof errorDetail.message === 'string') return errorDetail.message;
  if (typeof errorDetail.error === 'string') return errorDetail.error;
  return JSON.stringify(errorDetail);
}

export function DocumentTable({ documents, projectId }: DocumentTableProps) {
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const deleteDocument = useDeleteDocument();

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedDocs = [...documents].sort((a, b) => {
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    const aVal = a[sortField];
    const bVal = b[sortField];

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return multiplier * aVal.localeCompare(bVal);
    }
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return multiplier * (aVal - bVal);
    }
    return 0;
  });

  const handleToggleExpand = (docId: string) => {
    setExpandedId((prev) => (prev === docId ? null : docId));
  };

  return (
    <Paper withBorder radius="xl" p="lg" className="surface-card document-table-card">
      <Stack gap="md">
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <div>
            <Text fw={700}>Document library</Text>
            <Text size="sm" c="dimmed">
              Review status, freshness, and index coverage at a glance.
            </Text>
          </div>
          <Badge variant="light" color="ocean" radius="xl">
            Sorted by {sortField === 'updated_at' ? 'last updated' : sortField.replace('_', ' ')}
          </Badge>
        </Group>

        <Table.ScrollContainer minWidth={880}>
          <Table striped highlightOnHover verticalSpacing="md" className="document-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 30 }} />
                <Table.Th>
                  <SortableHeader label="Name" field="original_filename" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                </Table.Th>
                <Table.Th>
                  <SortableHeader label="Type" field="file_type" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                </Table.Th>
                <Table.Th>
                  <SortableHeader label="Size" field="file_size" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                </Table.Th>
                <Table.Th>
                  <SortableHeader label="Status" field="status" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                </Table.Th>
                <Table.Th>
                  <SortableHeader label="Chunks" field="chunk_count" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                </Table.Th>
                <Table.Th>
                  <SortableHeader label="Last Updated" field="updated_at" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                </Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sortedDocs.flatMap((doc) => {
                const rows = [
                  <Table.Tr
                    key={doc.id}
                    style={{ cursor: doc.status === 'failed' ? 'pointer' : undefined }}
                    onClick={() => doc.status === 'failed' && handleToggleExpand(doc.id)}
                  >
                    <Table.Td>
                      {doc.status === 'failed' && (
                        expandedId === doc.id ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text fw={600}>{doc.original_filename}</Text>
                        <Text size="xs" c="dimmed">
                          Updated {formatRelativeTime(doc.updated_at)}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>{doc.file_type}</Table.Td>
                    <Table.Td>{formatFileSize(doc.file_size)}</Table.Td>
                    <Table.Td>
                      <DocumentStatusBadge status={doc.status} />
                    </Table.Td>
                    <Table.Td>{doc.chunk_count}</Table.Td>
                    <Table.Td>{formatRelativeTime(doc.updated_at)}</Table.Td>
                    <Table.Td>
                      <Tooltip label={`Delete ${doc.original_filename}`} withArrow>
                        <Button
                          variant="subtle"
                          color="red"
                          size="xs"
                          className="document-action-button"
                          leftSection={<IconTrash size={14} />}
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            deleteDocument.mutate({
                              projectId,
                              documentId: doc.id,
                            });
                          }}
                          loading={deleteDocument.isPending}
                          aria-label={`Delete ${doc.original_filename}`}
                        >
                          Delete
                        </Button>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>,
                ];

                if (doc.status === 'failed') {
                  rows.push(
                    <Table.Tr key={`${doc.id}-detail`}>
                      <Table.Td colSpan={8} style={{ padding: 0 }}>
                        <Collapse in={expandedId === doc.id}>
                          <Stack gap="xs" p="sm" bg="var(--mantine-color-red-0)">
                            <Text size="sm" c="red">
                              {getErrorMessage(doc.error_detail)}
                            </Text>
                            <Group>
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
                            </Group>
                          </Stack>
                        </Collapse>
                      </Table.Td>
                    </Table.Tr>,
                  );
                }

                return rows;
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Stack>
    </Paper>
  );
}
