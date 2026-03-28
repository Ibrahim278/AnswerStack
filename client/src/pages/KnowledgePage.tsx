import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileText, Trash2, RefreshCw, AlertCircle, CheckCircle2, Clock, Loader2, File } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/mock-api';
import { useApp } from '@/hooks/useApp';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Document, DocumentStatus } from '@/types/api';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const statusConfig: Record<DocumentStatus, { icon: typeof CheckCircle2; label: string; className: string }> = {
  uploaded: { icon: Clock, label: 'Uploaded', className: 'text-muted-foreground' },
  parsing: { icon: Loader2, label: 'Parsing...', className: 'text-info animate-spin' },
  parsed: { icon: CheckCircle2, label: 'Parsed', className: 'text-info' },
  indexing: { icon: Loader2, label: 'Indexing...', className: 'text-warning animate-spin' },
  indexed: { icon: CheckCircle2, label: 'Indexed', className: 'text-success' },
  failed: { icon: AlertCircle, label: 'Failed', className: 'text-destructive' },
  stale: { icon: Clock, label: 'Stale', className: 'text-warning' },
  reindex_required: { icon: RefreshCw, label: 'Reindex needed', className: 'text-warning' },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

export default function KnowledgePage() {
  const { activeProject } = useApp();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const projectId = activeProject?.id || '';

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', projectId],
    queryFn: () => api.getDocuments(projectId),
    enabled: !!projectId,
    refetchInterval: 3000,
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['indexJobs', projectId],
    queryFn: () => api.getIndexJobs(projectId),
    enabled: !!projectId,
    refetchInterval: 2000,
  });

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => api.uploadDocuments(projectId, files),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents', projectId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => api.deleteDocument(projectId, docId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents', projectId] }),
  });

  const indexMutation = useMutation({
    mutationFn: () => api.startIndexJob(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['indexJobs', projectId] });
      queryClient.invalidateQueries({ queryKey: ['documents', projectId] });
    },
  });

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    uploadMutation.mutate(Array.from(files));
  };

  const activeJob = jobs.find(j => j.status === 'running' || j.status === 'pending');
  const indexedCount = documents.filter(d => d.status === 'indexed').length;
  const failedCount = documents.filter(d => d.status === 'failed').length;

  if (!activeProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-medium text-foreground mb-1">No project selected</h3>
          <p className="text-sm text-muted-foreground">Select a project from the Projects page to manage its knowledge base.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {documents.length} document{documents.length !== 1 ? 's' : ''} · {indexedCount} indexed
            {failedCount > 0 && <span className="text-destructive"> · {failedCount} failed</span>}
          </p>
        </div>
        <Button
          onClick={() => indexMutation.mutate()}
          disabled={!!activeJob || documents.length === 0 || indexMutation.isPending}
        >
          {activeJob ? (
            <>
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              Indexing {activeJob.progress_current}/{activeJob.progress_total}
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Build Index
            </>
          )}
        </Button>
      </div>

      {/* Upload zone */}
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center mb-6 transition-colors cursor-pointer',
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
          uploadMutation.isPending && 'opacity-60 pointer-events-none'
        )}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,.pdf"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
        <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground mb-1">
          {uploadMutation.isPending ? 'Uploading...' : 'Drop files here or click to browse'}
        </p>
        <p className="text-xs text-muted-foreground">Supports .txt, .md, and .pdf files</p>
      </div>

      {/* Document list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12">
          <File className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No documents yet. Upload files to build your knowledge base.</p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="space-y-2">
            {documents.map((doc, idx) => {
              const status = statusConfig[doc.status];
              const StatusIcon = status.icon;
              return (
                <motion.div
                  key={doc.document_id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: idx * 0.03 }}
                  className="group flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3 hover:shadow-raised transition-shadow"
                >
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{doc.filename}</span>
                      <span className="text-[10px] text-muted-foreground">{formatBytes(doc.size_bytes)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <StatusIcon className={cn('w-3 h-3', status.className)} />
                      <span className={cn('text-[11px]', status.className)}>{status.label}</span>
                      {doc.status === 'indexed' && doc.chunk_count > 0 && (
                        <span className="text-[11px] text-muted-foreground">· {doc.chunk_count} chunks</span>
                      )}
                      {doc.parse_error && (
                        <span className="text-[11px] text-destructive truncate max-w-[200px]">· {doc.parse_error}</span>
                      )}
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove "{doc.filename}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will delete the document and its indexed chunks. You'll need to rebuild the index after removal.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => deleteMutation.mutate(doc.document_id)}
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
