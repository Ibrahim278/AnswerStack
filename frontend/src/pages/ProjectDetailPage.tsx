import { useParams, useNavigate } from 'react-router';
import { Stack, Skeleton, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
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

function DetailSkeleton() {
  return (
    <Stack gap="md">
      <Skeleton height={40} width={300} radius="md" />
      <Skeleton height={80} radius="md" />
      <Skeleton height={200} radius="md" />
    </Stack>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 48em)');
  const { data: project, isLoading: projectLoading, isError: projectError } = useProject(id ?? '');
  const { data: documentsData, isLoading: docsLoading } = useDocuments(id ?? '');
  const { data: statusData } = useSystemStatus(id);

  if (!id) {
    return <Text>Invalid project ID</Text>;
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

  return (
    <Stack gap="lg">
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

      <InlineProjectName project={project} />

      <IndexSection projectId={id} />

      {staleCount > 0 && <StaleBanner staleCount={staleCount} projectId={id} />}

      <DocumentDropzone
        projectId={id}
        hasDocuments={documents.length > 0}
        existingDocuments={documents}
      />

      {documents.length > 0 && (
        isMobile ? (
          <DocumentCards documents={documents} projectId={id} />
        ) : (
          <DocumentTable documents={documents} projectId={id} />
        )
      )}
    </Stack>
  );
}
