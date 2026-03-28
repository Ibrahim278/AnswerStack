import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import { useUploadDocuments } from '@/hooks/useDocuments';
import { UploadProgressList } from './UploadProgressList';
import type { UploadItem } from './UploadProgressList';
import type { DocumentResponse } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.pdf'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

interface DocumentDropzoneProps {
  projectId: string;
  hasDocuments: boolean;
  existingDocuments: DocumentResponse[];
}

function isAcceptedFile(file: File): boolean {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext);
}

export function DocumentDropzone({
  projectId,
  hasDocuments,
  existingDocuments,
}: DocumentDropzoneProps) {
  const uploadDocuments = useUploadDocuments();
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (files: File[]) => {
      const existingNames = new Set(
        existingDocuments.map((doc) => doc.original_filename),
      );

      const newUploads: UploadItem[] = [];
      const rejected: UploadItem[] = [];

      for (const file of files) {
        if (!isAcceptedFile(file)) {
          rejected.push({
            file,
            status: 'failed',
            error: `Unsupported file type. Only .txt, .md, .pdf are accepted.`,
          });
        } else if (file.size > MAX_FILE_SIZE) {
          rejected.push({
            file,
            status: 'failed',
            error: `File exceeds 50 MB limit.`,
          });
        } else if (existingNames.has(file.name)) {
          newUploads.push({ file, status: 'duplicate' });
        } else {
          newUploads.push({ file, status: 'pending' });
        }
      }

      const allUploads = [...newUploads, ...rejected];
      setUploads(allUploads);

      const filesToUpload = newUploads
        .filter((u) => u.status === 'pending')
        .map((u) => u.file);

      if (filesToUpload.length > 0) {
        setUploads((prev) =>
          prev.map((u) =>
            u.status === 'pending' ? { ...u, status: 'uploading' } : u,
          ),
        );

        uploadDocuments.mutate(
          { projectId, files: filesToUpload },
          {
            onSuccess: () => {
              setUploads((prev) =>
                prev.map((u) =>
                  u.status === 'uploading' ? { ...u, status: 'done' } : u,
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
                        status: 'failed',
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
        u.file === file ? { ...u, status: 'uploading' } : u,
      ),
    );
    uploadDocuments.mutate(
      { projectId, files: [file] },
      {
        onSuccess: () => {
          setUploads((prev) =>
            prev.map((u) =>
              u.file === file ? { ...u, status: 'done' } : u,
            ),
          );
        },
        onError: (error) => {
          setUploads((prev) =>
            prev.map((u) =>
              u.file === file
                ? {
                    ...u,
                    status: 'failed',
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

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleDrop(Array.from(e.dataTransfer.files));
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleDrop(Array.from(e.target.files));
    }
    if (e.target) e.target.value = '';
  };

  return (
    <div className="space-y-3">
      {/* Mobile: show a button instead of dropzone */}
      <div className="block sm:hidden space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Upload
          </p>
          <p className="text-sm font-semibold text-foreground">
            Add source files
          </p>
          <p className="text-xs text-muted-foreground">
            Bring in markdown, text, or PDF files and fold them into the
            workspace without leaving this page.
          </p>
        </div>
        <Button
          variant="outline"
          className="w-full"
          disabled={uploadDocuments.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-4 h-4 mr-1.5" />
          {uploadDocuments.isPending ? 'Uploading...' : 'Tap to upload files'}
        </Button>
        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">
          Supported: .txt, .md, .pdf (max 50MB)
        </span>
      </div>

      {/* Desktop: full dropzone */}
      <div
        className={cn(
          'hidden sm:block border-2 border-dashed rounded-lg transition-colors cursor-pointer',
          hasDocuments ? 'p-5' : 'p-8',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/40',
          uploadDocuments.isPending && 'opacity-60 pointer-events-none',
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div
          className={cn(
            'flex items-center justify-between gap-6',
            hasDocuments ? 'min-h-[72px]' : 'min-h-[120px]',
          )}
          style={{ pointerEvents: 'none' }}
        >
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'rounded-2xl bg-primary/10 flex items-center justify-center shrink-0',
                hasDocuments ? 'w-14 h-14' : 'w-[72px] h-[72px]',
              )}
            >
              {dragOver ? (
                <Upload
                  className={cn(
                    'text-primary',
                    hasDocuments ? 'w-6 h-6' : 'w-8 h-8',
                  )}
                />
              ) : (
                <FileText
                  className={cn(
                    'text-primary',
                    hasDocuments ? 'w-6 h-6' : 'w-8 h-8',
                  )}
                />
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                {hasDocuments ? 'Add more files' : 'Start the workspace library'}
              </p>
              <p
                className={cn(
                  'font-semibold text-foreground',
                  hasDocuments ? 'text-sm' : 'text-base',
                )}
              >
                Drop files here or click to upload
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {hasDocuments
                  ? 'Keep the workspace fresh with more source material whenever the project grows.'
                  : 'Upload markdown, text, and PDF documents to build the first grounded knowledge base.'}
              </p>
            </div>
          </div>

          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground whitespace-nowrap shrink-0">
            Supported: .txt, .md, .pdf (max 50MB)
          </span>
        </div>
      </div>

      {/* Shared hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.md,.pdf"
        className="hidden"
        onChange={onFileInputChange}
      />

      <UploadProgressList
        uploads={uploads}
        onReplace={handleReplace}
        onSkip={handleSkip}
        onUploadAsNew={handleReplace}
      />
    </div>
  );
}
