import { Card, Title, Text, Group, Badge, Box } from '@mantine/core';
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
      shadow="sm"
      padding="lg"
      radius="md"
      withBorder
      style={{ cursor: 'pointer', position: 'relative' }}
      onClick={() => void navigate(`/projects/${project.id}`)}
    >
      <Box style={{ position: 'absolute', top: 12, right: 12 }}>
        <ProjectCardMenu
          projectId={project.id}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </Box>

      <Title order={4} mb="xs" pr={30}>
        {project.name}
      </Title>

      {project.description && (
        <Text
          size="sm"
          c="dimmed"
          mb="md"
          lineClamp={2}
        >
          {project.description}
        </Text>
      )}

      <Group justify="space-between" mt="auto">
        <Text size="xs" c="dimmed">
          {formatRelativeTime(project.last_used_at ?? project.updated_at)}
        </Text>
        <Badge
          variant="dot"
          color={getStatusColor(project.index_status)}
          size="sm"
        >
          {getStatusLabel(project.index_status)}
        </Badge>
      </Group>
    </Card>
  );
}
