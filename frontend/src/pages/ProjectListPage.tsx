import { useState, useEffect } from 'react';
import {
  SimpleGrid,
  Button,
  Stack,
  Skeleton,
  Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus, IconStack2, IconSparkles, IconFolderOpen } from '@tabler/icons-react';
import { useSearchParams, useNavigate } from 'react-router';
import { useProjects } from '../hooks/useProjects';
import { ProjectCard } from '../components/projects/ProjectCard';
import { CreateProjectModal } from '../components/projects/CreateProjectModal';
import { DeleteProjectModal } from '../components/projects/DeleteProjectModal';
import { EmptyState } from '../components/common/EmptyState';
import { PageIntro } from '../components/common/PageIntro';
import type { ProjectResponse } from '../types';

function ProjectListSkeleton() {
  return (
    <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} height={200} radius="xl" />
      ))}
    </SimpleGrid>
  );
}

export default function ProjectListPage() {
  const { data, isLoading } = useProjects();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [createOpened, createHandlers] = useDisclosure(false);
  const [deleteProject, setDeleteProject] = useState<ProjectResponse | null>(null);

  // Open create modal when navigated from sidebar with ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      createHandlers.open();
      // Remove the query param so refreshing doesn't reopen the modal
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, createHandlers, setSearchParams]);

  const projects = data?.items ?? [];

  if (isLoading) {
    return (
      <Stack gap="lg">
        <PageIntro
          eyebrow="Workspace"
          title="Projects"
          description="Organize your knowledge bases, monitor indexing health, and jump back into active research threads."
        />
        <ProjectListSkeleton />
      </Stack>
    );
  }

  if (projects.length === 0) {
    return (
      <>
        <EmptyState
          icon={<IconStack2 size={48} />}
          title="Welcome to AnswerStack"
          description="Create your first project to start building a source-grounded workspace for documents, indexing, and chat."
          action={{ label: 'New Project', onClick: createHandlers.open }}
        />
        <CreateProjectModal
          opened={createOpened}
          onClose={createHandlers.close}
        />
      </>
    );
  }

  return (
    <Stack gap="lg">
      <PageIntro
        eyebrow="Workspace"
        title="Projects"
        description="Your active knowledge bases, with index health and recency visible at a glance."
        actions={(
          <Button leftSection={<IconPlus size={16} />} onClick={createHandlers.open}>
            New Project
          </Button>
        )}
        meta={(
          <>
            <span className="page-pill">
              <IconFolderOpen size={16} />
              {projects.length} active {projects.length === 1 ? 'project' : 'projects'}
            </span>
            <span className="page-pill">
              <IconSparkles size={16} />
              Pick up recent work faster
            </span>
          </>
        )}
      />

      <Text size="sm" className="muted-copy" px="xs">
        Tip: open a project to upload fresh material, rebuild its index, or continue a chat session.
      </Text>

      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onEdit={() => { void navigate(`/projects/${project.id}`); }}
            onDelete={() => setDeleteProject(project)}
          />
        ))}
      </SimpleGrid>

      <CreateProjectModal
        opened={createOpened}
        onClose={createHandlers.close}
      />

      {deleteProject && (
        <DeleteProjectModal
          opened={!!deleteProject}
          onClose={() => setDeleteProject(null)}
          project={deleteProject}
          documentCount={0}
        />
      )}
    </Stack>
  );
}
