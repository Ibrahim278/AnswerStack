import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderOpen, Trash2, Clock, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjects, useCreateProject, useDeleteProject } from '@/hooks/useProjects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/lib/utils';
import type { ProjectResponse } from '@/types';

const indexStatusConfig: Record<string, { label: string; className: string }> = {
  ready: { label: 'Ready', className: 'bg-success/10 text-success' },
  indexed: { label: 'Indexed', className: 'bg-success/10 text-success' },
  no_documents: { label: 'No documents', className: 'bg-muted text-muted-foreground' },
  indexing: { label: 'Indexing', className: 'bg-warning/10 text-warning' },
  stale: { label: 'Stale index', className: 'bg-warning/10 text-warning' },
  not_indexed: { label: 'Not indexed', className: 'bg-muted text-muted-foreground' },
  failed: { label: 'Failed', className: 'bg-destructive/10 text-destructive' },
};

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ProjectResponse | null>(null);

  const { data, isLoading, isError } = useProjects();
  const createMutation = useCreateProject();
  const deleteMutation = useDeleteProject();

  const projects = data?.items ?? [];

  const handleCreate = () => {
    createMutation.mutate(
      { name: name.trim(), description: description.trim() || undefined },
      {
        onSuccess: (project) => {
          setCreateOpen(false);
          setName('');
          setDescription('');
          navigate(`/projects/${project.id}`);
        },
      },
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  const selectProject = (project: ProjectResponse) => {
    navigate(`/projects/${project.id}`);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">Create and manage your knowledge projects</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-1.5" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
              <DialogDescription>Give your project a name and optional description.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Name</label>
                <Input placeholder="e.g. Q1 Financial Review" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Description</label>
                <Textarea placeholder="What is this project about?" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!name.trim() || createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Delete confirmation modal */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={deleteTarget ? `Delete "${deleteTarget.name}"?` : 'Delete project?'}
        message="This will permanently remove the project, all uploaded documents, chat sessions, and indexed data. This cannot be undone."
        confirmLabel="Delete Project"
        destructive
        loading={deleteMutation.isPending}
        icon={<Trash2 className="w-5 h-5 text-destructive" />}
      />

      {/* Error state */}
      {isError && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <FolderOpen className="w-8 h-8 text-destructive" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">Failed to load projects</h3>
          <p className="text-sm text-muted-foreground">Check your connection to the backend server and try again.</p>
        </div>
      )}

      {/* Project list */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map(i => (
            <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : !isError && projects.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="w-8 h-8" />}
          title="No projects yet"
          description="Create your first project to start building a knowledge base."
          action={{ label: 'Create your first project', onClick: () => setCreateOpen(true) }}
        />
      ) : !isError && (
        <AnimatePresence mode="popLayout">
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((project, idx) => {
              const status = indexStatusConfig[project.index_status] || indexStatusConfig.no_documents;
              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: idx * 0.05 }}
                  className="group relative tech-panel rounded-lg p-5 hover:border-primary/40 hover:shadow-elevated transition-all cursor-pointer"
                  onClick={() => selectProject(project)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FolderOpen className="w-4.5 h-4.5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground text-sm">{project.name}</h3>
                        <span className={cn('inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5', status.className)}>
                          {status.label}
                        </span>
                      </div>
                    </div>
                    <button
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(project);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {project.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{project.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {formatDate(project.last_used_at)}
                    </span>
                  </div>
                  <ArrowRight className="absolute bottom-5 right-5 w-4 h-4 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
