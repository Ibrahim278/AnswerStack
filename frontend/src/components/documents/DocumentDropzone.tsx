import { useState, useCallback } from 'react';
import {
  Text,
  Group,
  Stack,
  Button,
  rem,
  ThemeIcon,
  Badge,
  Box,
} from '@mantine/core';
import { Dropzone, MIME_TYPES } from '@mantine/dropzone';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconUpload,
  IconFileTypePdf,
  IconX,
} from '@tabler/icons-react';
import { useUploadDocuments } from '../../hooks/useDocuments';
import { UploadProgressList } from './UploadProgressList';
import type { UploadItem } from './UploadProgressList';
import type { DocumentResponse } from '../../types';

const ACCEPTED_TYPES = [
  MIME_TYPES.pdf,
  'text/plain',
  'text/markdown',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

interface DocumentDropzoneProps {
  projectId: string;
  hasDocuments: boolean;
  existingDocuments: DocumentResponse[];
}

export function DocumentDropzone({
  projectId,
  hasDocuments,
  existingDocuments,
}: DocumentDropzoneProps) {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const uploadDocuments = useUploadDocuments();
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  const handleDrop = useCallback(
    (files: File[]) => {
      const existingNames = new Set(
        existingDocuments.map((doc) => doc.original_filename),
      );

      const newUploads: UploadItem[] = files.map((file) => ({
        file,
        status: existingNames.has(file.name) ? ('duplicate' as const) : ('pending' as const),
      }));

      setUploads(newUploads);

      const filesToUpload = newUploads
        .filter((u) => u.status === 'pending')
        .map((u) => u.file);

      if (filesToUpload.length > 0) {
        setUploads((prev) =>
          prev.map((u) =>
            u.status === 'pending' ? { ...u, status: 'uploading' as const } : u,
          ),
        );

        uploadDocuments.mutate(
          { projectId, files: filesToUpload },
          {
            onSuccess: () => {
              setUploads((prev) =>
                prev.map((u) =>
                  u.status === 'uploading' ? { ...u, status: 'done' as const } : u,
                ),
              );
              setTimeout(() => setUploads([]), 3000);
            },
            onError: (error) => {
              setUploads((prev) =>
                prev.map((u) =>
                  u.status === 'uploading'
                    ? {
                        ...u,
                        status: 'failed' as const,
                        error:
                          error instanceof Error
                            ? error.message
                            : 'Upload failed',
                      }
                    : u,
                ),
              );
            },
          },
        );
      }
    },
    [projectId, existingDocuments, uploadDocuments],
  );

  const handleReplace = (file: File) => {
    setUploads((prev) =>
      prev.map((u) =>
        u.file === file ? { ...u, status: 'uploading' as const } : u,
      ),
    );
    uploadDocuments.mutate(
      { projectId, files: [file] },
      {
        onSuccess: () => {
          setUploads((prev) =>
            prev.map((u) =>
              u.file === file ? { ...u, status: 'done' as const } : u,
            ),
          );
        },
        onError: (error) => {
          setUploads((prev) =>
            prev.map((u) =>
              u.file === file
                ? {
                    ...u,
                    status: 'failed' as const,
                    error:
                      error instanceof Error ? error.message : 'Upload failed',
                  }
                : u,
            ),
          );
        },
      },
    );
  };

  const handleSkip = (file: File) => {
    setUploads((prev) => prev.filter((u) => u.file !== file));
  };

  if (isMobile) {
    return (
      <Stack gap="sm" className="document-dropzone-panel surface-card" p="md">
        <Stack gap={4}>
          <Text className="page-intro__eyebrow" mb={0}>
            Upload
          </Text>
          <Text fw={700}>Add source files</Text>
          <Text size="sm" c="dimmed">
            Bring in markdown, text, or PDF files and fold them into the workspace without leaving this page.
          </Text>
        </Stack>
        <Button
          variant="light"
          leftSection={<IconUpload size={16} />}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.accept = '.txt,.md,.pdf';
            input.onchange = (e) => {
              const target = e.target as HTMLInputElement;
              if (target.files) {
                handleDrop(Array.from(target.files));
              }
            };
            input.click();
          }}
          loading={uploadDocuments.isPending}
        >
          Tap to upload files
        </Button>
        <Badge variant="light" color="gray" radius="xl" w="fit-content">
          Supported: .txt, .md, .pdf (max 50MB)
        </Badge>
        <UploadProgressList
          uploads={uploads}
          onReplace={handleReplace}
          onSkip={handleSkip}
          onUploadAsNew={handleReplace}
        />
      </Stack>
    );
  }

  return (
    <Stack gap="sm" className="document-dropzone-panel">
      <Dropzone
        onDrop={handleDrop}
        onReject={(fileRejections) => {
          const rejected: UploadItem[] = fileRejections.map((r) => ({
            file: r.file,
            status: 'failed' as const,
            error: r.errors.map((e) => e.message).join(', '),
          }));
          setUploads(rejected);
        }}
        maxSize={MAX_FILE_SIZE}
        accept={ACCEPTED_TYPES}
        loading={uploadDocuments.isPending}
        p={hasDocuments ? 'sm' : 'xl'}
        className="document-dropzone-shell"
      >
        <Group
          justify="space-between"
          gap="xl"
          mih={hasDocuments ? 92 : 156}
          align="center"
          style={{ pointerEvents: 'none' }}
        >
          <Group gap="md" wrap="nowrap" align="center">
            <ThemeIcon
              size={hasDocuments ? 60 : 76}
              radius={hasDocuments ? 22 : 28}
              variant="light"
              color="ocean"
            >
              <Dropzone.Accept>
                <IconUpload
                  style={{ width: rem(hasDocuments ? 28 : 38), height: rem(hasDocuments ? 28 : 38) }}
                  stroke={1.6}
                />
              </Dropzone.Accept>
              <Dropzone.Reject>
                <IconX
                  style={{ width: rem(hasDocuments ? 28 : 38), height: rem(hasDocuments ? 28 : 38) }}
                  stroke={1.6}
                  color="var(--mantine-color-red-6)"
                />
              </Dropzone.Reject>
              <Dropzone.Idle>
                <IconFileTypePdf
                  style={{ width: rem(hasDocuments ? 28 : 38), height: rem(hasDocuments ? 28 : 38) }}
                  stroke={1.6}
                  color="var(--mantine-color-ocean-7)"
                />
              </Dropzone.Idle>
            </ThemeIcon>

            <Box>
              <Text className="page-intro__eyebrow" mb={6}>
                {hasDocuments ? 'Add more files' : 'Start the workspace library'}
              </Text>
              <Text size={hasDocuments ? 'md' : 'lg'} fw={700}>
                Drop files here or click to upload
              </Text>
              <Text size="sm" c="dimmed" mt={4}>
                {hasDocuments
                  ? 'Keep the workspace fresh with more source material whenever the project grows.'
                  : 'Upload markdown, text, and PDF documents to build the first grounded knowledge base.'}
              </Text>
            </Box>
          </Group>

          <Badge variant="light" color="gray" radius="xl">
            Supported: .txt, .md, .pdf (max 50MB)
          </Badge>
        </Group>
      </Dropzone>

      <UploadProgressList
        uploads={uploads}
        onReplace={handleReplace}
        onSkip={handleSkip}
        onUploadAsNew={handleReplace}
      />
    </Stack>
  );
}
