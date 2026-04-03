import {
  CheckCircle2,
  XCircle,
  Clock,
  Upload,
  AlertTriangle,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  const base = 'w-4 h-4 shrink-0';
  switch (status) {
    case 'done':
      return <CheckCircle2 className={cn(base, 'text-success')} />;
    case 'failed':
      return <XCircle className={cn(base, 'text-destructive')} />;
    case 'uploading':
      return <Upload className={cn(base, 'text-primary animate-pulse')} />;
    case 'duplicate':
      return <AlertTriangle className={cn(base, 'text-warning')} />;
    case 'pending':
    default:
      return <Clock className={cn(base, 'text-muted-foreground')} />;
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
    <div className="space-y-2">
      {uploads.map((item, index) => (
        <div
          key={`${item.file.name}-${index}`}
          className="border border-border rounded-lg px-3 py-2.5 bg-card"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <StatusIcon status={item.status} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {item.file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(item.file.size)}
                </p>
              </div>
            </div>
          </div>

          {item.status === 'uploading' && (
            <Progress value={50} className="mt-2 h-1.5" />
          )}

          {item.status === 'failed' && item.error && (
            <p className="text-xs text-destructive mt-1.5">{item.error}</p>
          )}

          {item.status === 'duplicate' && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-warning">File already exists</span>
              {onReplace && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs px-2"
                  onClick={() => onReplace(item.file)}
                >
                  Replace
                </Button>
              )}
              {onSkip && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs px-2"
                  onClick={() => onSkip(item.file)}
                >
                  Skip
                </Button>
              )}
              {onUploadAsNew && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs px-2"
                  onClick={() => onUploadAsNew(item.file)}
                >
                  Upload as new
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
