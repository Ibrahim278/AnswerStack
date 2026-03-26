import { useParams, useNavigate } from 'react-router';
import { Stack, Skeleton, Text, Button, Group, Box } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconMessageCircle, IconFolders, IconHistory, IconSparkles } from '@tabler/icons-react';
import { useProject } from '../hooks/useProjects';
import { useDocuments } from '../hooks/useDocuments';
import { useSystemStatus } from '../hooks/useSystemStatus';
import { InlineProjectName } from '../components/projects/InlineProjectName';
import { IndexSection } from '../components/indexing/IndexSection';
import { StaleBanner } from '../components/documents/StaleBanner';
import { DocumentDropzone } from '../components/documents/DocumentDropzone';
import { DocumentTable } from '../components/documents/DocumentTable';
import { DocumentCards } from '../components/documents/DocumentCards';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { isValidUuid } from '../utils/isValidUuid';

function DetailSkeleton() {
  return (
    <Stack gap="md">
      <Skeleton height={40} width={300} radius="md" />
      <Skeleton height={80} radius="md" />
      <Skeleton height={200} radius="md" />
    </Stack>
  );
}

function formatIndexedMeta(dateString: string | null | undefined): string {
  if (!dateString) return 'Awaiting first build';

  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'Indexed just now';
  if (diffMinutes < 60) return `Indexed ${diffMinutes}m ago`;
  if (diffHours < 24) return `Indexed ${diffHours}h ago`;
  if (diffDays < 30) return `Indexed ${diffDays}d ago`;
  return `Indexed ${date.toLocaleDateString()}`;
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 48em)');
  const routeProjectId = id ?? '';
  const projectId = isValidUuid(routeProjectId) ? routeProjectId : '';
  const { data: project, isLoading: projectLoading, isError: projectError } = useProject(projectId);
  const { data: documentsData, isLoading: docsLoading } = useDocuments(projectId);
  const { data: statusData } = useSystemStatus(projectId);

  const statusLabel = (() => {
    switch (statusData?.status) {
      case 'ready':
        return 'Ready';
      case 'indexing':
        return 'Indexing';
      case 'misconfigured':
        return 'Setup needed';
      case 'degraded':
        return 'Needs attention';
      case 'no_documents':
        return 'No documents yet';
      case 'stale':
        return 'Needs rebuild';
      default:
        return 'Unknown';
    }
  })();

  if (!id) {
    return <Text>Invalid project ID</Text>;
  }

  if (!projectId) {
    return (
      <ErrorBanner
        title="Project not found"
        message="This workspace link is invalid or no longer available."
        actions={[
          {
            label: 'Back to Projects',
            onClick: () => void navigate('/projects'),
          },
        ]}
      />
    );
  }

  if (projectLoading || docsLoading) {
    return <DetailSkeleton />;
  }

  if (projectError || !project) {
    return (
      <ErrorBanner
        title="Project not found"
        message="The project you are looking for does not exist or has been deleted."
        actions={[
          {
            label: 'Back to Projects',
            onClick: () => void navigate('/projects'),
          },
        ]}
      />
    );
  }

  const documents = documentsData?.items ?? [];
  const staleCount = documents.filter(
    (doc) => doc.status === 'stale' || doc.status === 'reindex_required',
  ).length;
  const headerSummary = documents.length > 0
    ? 'Manage uploaded material, track index freshness, and keep the workspace ready for cited chat.'
    : 'Start this workspace with a first batch of markdown, text, or PDF files, then build the index to unlock grounded chat.';

  return (
    <Stack gap={isMobile ? 'lg' : 'xl'} className="project-detail-page">
      {statusData?.status === 'misconfigured' && (
        <ErrorBanner
          color="orange"
          title="Provider not configured"
          message="Set up your LLM provider to enable indexing and chat"
          actions={[
            {
              label: 'Go to Settings',
              onClick: () => void navigate('/settings'),
            },
          ]}
        />
      )}

      <Box className="surface-card project-hero" p="lg">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
            <Stack gap="md" className="project-hero__copy">
              <Text className="page-intro__eyebrow" mb={0}>
                Workspace
              </Text>
              <InlineProjectName project={project} />
              <Text className="muted-copy project-hero__summary">
                {headerSummary}
              </Text>
            </Stack>

            <Stack gap="sm" className="project-hero__actions">
              <Button
                leftSection={<IconMessageCircle size={16} />}
                onClick={() => { void navigate(`/projects/${id}/chat`); }}
                size="md"
                radius="xl"
                styles={{
                  root: {
                    backgroundColor: '#12806d',
                  },
                }}
              >
                Open Chat
              </Button>
              <Text size="sm" className="muted-copy project-hero__hint">
                Ask questions against the current document set.
              </Text>
            </Stack>
          </Group>

          <Group gap="sm" wrap="wrap">
            <span className="page-pill project-hero__pill">
              <IconFolders size={16} />
              {documents.length} {documents.length === 1 ? 'document' : 'documents'}
            </span>
            <span className="page-pill project-hero__pill">
              <IconSparkles size={16} />
              Workspace: {statusLabel}
            </span>
            <span className="page-pill project-hero__pill">
              <IconHistory size={16} />
              {formatIndexedMeta(statusData?.project?.last_indexed ?? null)}
            </span>
          </Group>
        </Stack>
      </Box>

      <Box className="project-detail-section">
        <Group justify="space-between" align="flex-end" wrap="wrap" gap="md" mb={isMobile ? 'sm' : 'md'}>
          <Stack gap={4}>
            <Text className="page-intro__eyebrow" mb={0}>
              Index Health
            </Text>
            <Text fw={700} size="lg">
              Keep answers aligned with your latest source material
            </Text>
            <Text size="sm" className="muted-copy">
              Monitor readiness, rebuild when documents change, and catch indexing problems before they affect chat.
            </Text>
          </Stack>
        </Group>
        <IndexSection projectId={projectId} />
      </Box>

      {staleCount > 0 && <StaleBanner staleCount={staleCount} projectId={projectId} />}

      <Box className="project-detail-section">
        <Group justify="space-between" align="flex-end" wrap="wrap" gap="md" mb={isMobile ? 'sm' : 'md'}>
          <Stack gap={4}>
            <Text className="page-intro__eyebrow" mb={0}>
              Documents
            </Text>
            <Text fw={700} size="lg">
              Curate the workspace knowledge base
            </Text>
            <Text size="sm" className="muted-copy">
              Upload fresh files, scan what is already indexed, and prune outdated material without leaving the page.
            </Text>
          </Stack>
          {documents.length > 0 && (
            <span className="page-pill">
              Library ready for chat
            </span>
          )}
        </Group>

        <DocumentDropzone
          projectId={projectId}
          hasDocuments={documents.length > 0}
          existingDocuments={documents}
        />

        {documents.length === 0 && (
          <Box className="surface-card surface-card--soft project-empty-state" p="lg">
            <Stack gap={6}>
              <Text fw={700}>No documents yet</Text>
              <Text size="sm" className="muted-copy">
                Upload markdown, text, or PDF files to turn this workspace into a searchable source base for chat.
              </Text>
            </Stack>
          </Box>
        )}

        {documents.length > 0 && (
          isMobile ? (
            <DocumentCards documents={documents} projectId={projectId} />
          ) : (
            <DocumentTable documents={documents} projectId={projectId} />
          )
        )}
      </Box>
    </Stack>
  );
}
