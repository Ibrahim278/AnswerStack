import { useState } from 'react';
import {
  Title,
  SimpleGrid,
  Group,
  Button,
  Stack,
  Skeleton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus, IconStack2 } from '@tabler/icons-react';
import { useProjects } from '../hooks/useProjects';
import { ProjectCard } from '../components/projects/ProjectCard';
import { CreateProjectModal } from '../components/projects/CreateProjectModal';
import { DeleteProjectModal } from '../components/projects/DeleteProjectModal';
import { EmptyState } from '../components/common/EmptyState';
import type { ProjectResponse } from '../types';

function ProjectListSkeleton() {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} height={160} radius="md" />
      ))}
    </SimpleGrid>
  );
}

export default function ProjectListPage() {
  const { data, isLoading } = useProjects();
  const [createOpened, createHandlers] = useDisclosure(false);
  const [deleteProject, setDeleteProject] = useState<ProjectResponse | null>(null);

  const projects = data?.items ?? [];

  if (isLoading) {
    return (
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Title order={1}>Projects</Title>
        </Group>
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
          description="Create your first project to start building a knowledge base"
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
      <Group justify="space-between" align="center">
        <Title order={1}>Projects</Title>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={createHandlers.open}
        >
          New Project
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onEdit={() => void 0}
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
