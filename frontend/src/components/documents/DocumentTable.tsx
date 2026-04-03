import { useState } from 'react';
import { Trash2, FileText, File, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { DocumentStatusBadge } from './DocumentStatusBadge';
import { useDeleteDocument } from '@/hooks/useDocuments';
import { cn } from '@/lib/utils';
import type { DocumentResponse } from '@/types';

interface DocumentTableProps {
  documents: DocumentResponse[];
  projectId: string;
}

type SortField =
  | 'original_filename'
  | 'file_size'
  | 'status'
  | 'updated_at';
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
    <button
      onClick={() => onSort(field)}
      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
    >
      <span>{label}</span>
      {isActive ? (
        sortDirection === 'asc' ? (
          <ArrowUp className="w-3.5 h-3.5" />
        ) : (
          <ArrowDown className="w-3.5 h-3.5" />
        )
      ) : (
        <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />
      )}
    </button>
  );
}

export function DocumentTable({ documents, projectId }: DocumentTableProps) {
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
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

  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <File className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          No documents yet. Upload files to build your knowledge base.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Document library
          </p>
          <p className="text-xs text-muted-foreground">
            Review status, freshness, and index coverage at a glance.
          </p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortableHeader
                label="Name"
                field="original_filename"
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            </TableHead>
            <TableHead className="hidden sm:table-cell">
              <SortableHeader
                label="Size"
                field="file_size"
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            </TableHead>
            <TableHead>
              <SortableHeader
                label="Status"
                field="status"
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            </TableHead>
            <TableHead className="hidden md:table-cell">
              <SortableHeader
                label="Updated"
                field="updated_at"
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            </TableHead>
            <TableHead className="w-[60px]">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedDocs.map((doc) => (
            <TableRow key={doc.id} className="group">
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate max-w-[220px]">
                      {doc.original_filename}
                    </p>
                    <p className="text-[11px] text-muted-foreground sm:hidden">
                      {formatFileSize(doc.file_size)}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                {formatFileSize(doc.file_size)}
              </TableCell>
              <TableCell>
                <DocumentStatusBadge
                  status={doc.status}
                  errorDetail={doc.error_detail}
                />
              </TableCell>
              <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                {formatRelativeTime(doc.updated_at)}
              </TableCell>
              <TableCell>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className={cn(
                        'p-1.5 rounded-md text-muted-foreground',
                        'hover:text-destructive hover:bg-destructive/10',
                        'opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all',
                      )}
                      aria-label={`Delete ${doc.original_filename}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Remove &ldquo;{doc.original_filename}&rdquo;?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete the document and remove any indexed chunks for it.
                        Index health will update automatically after removal.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() =>
                          deleteDocument.mutate({
                            projectId,
                            documentId: doc.id,
                          })
                        }
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
