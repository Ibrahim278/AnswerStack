import { Card, Title, Text, Group, Badge, Box, Stack, ThemeIcon } from '@mantine/core';
import { IconFolderCode, IconArrowUpRight } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import type { ProjectResponse } from '../../types';
import { ProjectCardMenu } from './ProjectCardMenu';

interface ProjectCardProps {
  project: ProjectResponse;
  onEdit: () => void;
  onDelete: () => void;
}

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never';
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

function getStatusColor(status: string): string {
  switch (status) {
    case 'indexed':
      return 'green';
    case 'not_indexed':
      return 'gray';
    case 'stale':
      return 'orange';
    case 'indexing':
      return 'blue';
    default:
      return 'gray';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'indexed':
      return 'Indexed';
    case 'not_indexed':
      return 'Not indexed';
    case 'stale':
      return 'Stale';
    case 'indexing':
      return 'Indexing';
    default:
      return status;
  }
}

export function ProjectCard({ project, onEdit, onDelete }: ProjectCardProps) {
  const navigate = useNavigate();

  return (
    <Card
      className="project-card surface-card"
      padding="lg"
      radius="xl"
      withBorder
      style={{ position: 'relative' }}
      onClick={() => void navigate(`/projects/${project.id}`)}
    >
      <Box style={{ position: 'absolute', top: 12, right: 12 }}>
        <ProjectCardMenu
          projectId={project.id}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </Box>

      <Stack gap="md" h="100%">
        <Group justify="space-between" align="flex-start" pr={34}>
          <Group gap="sm" wrap="nowrap" align="flex-start">
            <ThemeIcon
              variant="light"
              color="ocean"
              radius="xl"
              size="xl"
            >
              <IconFolderCode size={18} stroke={1.8} />
            </ThemeIcon>
            <div>
              <Title order={4} mb={4}>
                {project.name}
              </Title>
              <Text size="xs" c="dimmed">
                Last active {formatRelativeTime(project.last_used_at ?? project.updated_at)}
              </Text>
            </div>
          </Group>

          <ThemeIcon variant="subtle" color="gray" radius="xl" size="lg">
            <IconArrowUpRight size={16} stroke={1.8} />
          </ThemeIcon>
        </Group>

        <Text size="sm" c="dimmed" lineClamp={3}>
          {project.description || 'Organize documents, build an index, and ask evidence-backed questions from one workspace.'}
        </Text>

        <Group justify="space-between" mt="auto">
          <Badge variant="light" color={getStatusColor(project.index_status)} size="lg">
            {getStatusLabel(project.index_status)}
          </Badge>
          <Text size="xs" c="dimmed">
            Open workspace
          </Text>
        </Group>
      </Stack>
    </Card>
  );
}
