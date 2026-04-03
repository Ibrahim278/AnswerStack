import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, MessageSquare, ArrowLeft, Pencil, Loader2 } from 'lucide-react';
import { useProject, useUpdateProject } from '@/hooks/useProjects';
import { useDocuments } from '@/hooks/useDocuments';
import { isValidUuid } from '@/utils/isValidUuid';
import { Button } from '@/components/ui/button';
import { DocumentDropzone } from '@/components/documents/DocumentDropzone';
import { DocumentTable } from '@/components/documents/DocumentTable';
import { IndexSection } from '@/components/indexing/IndexSection';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const routeProjectId = id ?? '';
  const projectId = isValidUuid(routeProjectId) ? routeProjectId : '';

  const { data: project, isLoading: projectLoading, isError: projectError } = useProject(projectId);
  const { data: documentsData, isLoading: docsLoading } = useDocuments(projectId);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const updateProject = useUpdateProject();

  useEffect(() => {
    if (project?.name) setNameValue(project.name);
  }, [project?.name]);

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  const documents = documentsData?.items ?? [];
  const indexedCount = documents.filter(d => d.status === 'indexed').length;
  const failedCount = documents.filter(d => d.status === 'failed').length;

  // Invalid project ID in URL
  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-destructive/40 mx-auto mb-3" />
          <h3 className="font-medium text-foreground mb-1">Invalid project link</h3>
          <p className="text-sm text-muted-foreground mb-4">This project URL is not valid.</p>
          <Button variant="outline" onClick={() => navigate('/projects')}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  // Loading
  if (projectLoading || docsLoading) {
    return (
      <div className="p-6 lg:p-10 max-w-4xl mx-auto">
        <div className="space-y-4">
          <div className="h-10 w-64 bg-muted rounded-lg animate-pulse" />
          <div className="h-32 bg-muted rounded-lg animate-pulse" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  // Project not found
  if (projectError || !project) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-destructive/40 mx-auto mb-3" />
          <h3 className="font-medium text-foreground mb-1">Project not found</h3>
          <p className="text-sm text-muted-foreground mb-4">This project does not exist or has been deleted.</p>
          <Button variant="outline" onClick={() => navigate('/projects')}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  const handleNameSave = () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === project.name) {
      setNameValue(project.name);
      setEditingName(false);
      return;
    }
    updateProject.mutate(
      { id: project.id, data: { name: trimmed } },
      {
        onSuccess: () => setEditingName(false),
        onError: () => { setNameValue(project.name); setEditingName(false); },
      },
    );
  };

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => navigate('/projects')}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  ref={nameInputRef}
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNameSave();
                    if (e.key === 'Escape') { e.stopPropagation(); setNameValue(project.name); setEditingName(false); }
                  }}
                  disabled={updateProject.isPending}
                  className="text-2xl font-semibold text-foreground bg-transparent border-b-2 border-primary outline-none px-0 py-0"
                />
                {updateProject.isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h1 className="text-2xl font-semibold text-foreground">{project.name}</h1>
                <button
                  onClick={() => setEditingName(true)}
                  className="text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-foreground transition-colors"
                  aria-label="Rename project"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1 ml-6">{project.description}</p>
          )}
          <p className="text-sm text-muted-foreground mt-1 ml-6">
            {documents.length} document{documents.length !== 1 ? 's' : ''} · {indexedCount} indexed
            {failedCount > 0 && <span className="text-destructive"> · {failedCount} failed</span>}
          </p>
        </div>
        <Button
          onClick={() => navigate(`/projects/${projectId}/chat`)}
          className="bg-primary text-primary-foreground hover:bg-primary/80"
        >
          <MessageSquare className="w-4 h-4 mr-1.5" />
          Open Chat
        </Button>
      </div>

      {/* Index status section */}
      <div className="mb-6">
        <IndexSection projectId={projectId} />
      </div>


      {/* Upload dropzone */}
      <div className="mb-6">
        <DocumentDropzone
          projectId={projectId}
          hasDocuments={documents.length > 0}
          existingDocuments={documents}
        />
      </div>

      {/* Document table */}
      <DocumentTable documents={documents} projectId={projectId} />
    </div>
  );
}
