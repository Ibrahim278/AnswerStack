import { useState, useCallback } from 'react';
import {
  Text,
  Group,
  Stack,
  Button,
  rem,
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
      <Stack gap="sm">
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
        <Text size="xs" c="dimmed">
          Supported: .txt, .md, .pdf (max 50MB)
        </Text>
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
    <Stack gap="sm">
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
      >
        <Group
          justify="center"
          gap="xl"
          mih={hasDocuments ? 60 : 120}
          style={{ pointerEvents: 'none' }}
        >
          <Dropzone.Accept>
            <IconUpload
              style={{ width: rem(hasDocuments ? 32 : 52), height: rem(hasDocuments ? 32 : 52) }}
              stroke={1.5}
            />
          </Dropzone.Accept>
          <Dropzone.Reject>
            <IconX
              style={{ width: rem(hasDocuments ? 32 : 52), height: rem(hasDocuments ? 32 : 52) }}
              stroke={1.5}
              color="var(--mantine-color-red-6)"
            />
          </Dropzone.Reject>
          <Dropzone.Idle>
            <IconFileTypePdf
              style={{ width: rem(hasDocuments ? 32 : 52), height: rem(hasDocuments ? 32 : 52) }}
              stroke={1.5}
              color="var(--mantine-color-dimmed)"
            />
          </Dropzone.Idle>

          <div>
            <Text size={hasDocuments ? 'sm' : 'lg'} inline>
              Drop files here or click to upload
            </Text>
            <Text size="xs" c="dimmed" inline mt={7}>
              Supported: .txt, .md, .pdf (max 50MB)
            </Text>
          </div>
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
