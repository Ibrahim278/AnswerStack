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

function getStatusBadgeConfig(status: string): { color: string; label: string; bg: string; text: string; border: string } {
  switch (status) {
    case 'indexed':
      return { color: 'green', label: 'Indexed', bg: 'rgba(18, 128, 109, 0.14)', text: '#0f5147', border: 'rgba(18, 128, 109, 0.22)' };
    case 'not_indexed':
      return { color: 'gray', label: 'Not indexed', bg: 'rgba(73, 91, 82, 0.12)', text: '#33463e', border: 'rgba(73, 91, 82, 0.16)' };
    case 'stale':
      return { color: 'orange', label: 'Stale', bg: 'rgba(183, 111, 21, 0.14)', text: '#7f4b08', border: 'rgba(183, 111, 21, 0.2)' };
    case 'indexing':
      return { color: 'blue', label: 'Indexing', bg: 'rgba(20, 92, 176, 0.12)', text: '#124a87', border: 'rgba(20, 92, 176, 0.18)' };
    default:
      return { color: 'gray', label: status, bg: 'rgba(73, 91, 82, 0.12)', text: '#33463e', border: 'rgba(73, 91, 82, 0.16)' };
  }
}

export function ProjectCard({ project, onEdit, onDelete }: ProjectCardProps) {
  const navigate = useNavigate();
  const statusBadge = getStatusBadgeConfig(project.index_status);
  const handleOpen = () => {
    void navigate(`/projects/${project.id}`);
  };

  return (
    <Card
      className="project-card surface-card"
      data-active={project.is_active ? 'true' : undefined}
      padding="lg"
      radius="xl"
      withBorder
      style={{ position: 'relative' }}
      role="link"
      tabIndex={0}
      aria-label={`Open project ${project.name}`}
      onClick={handleOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleOpen();
        }
      }}
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

        <Group justify="space-between" mt="auto" align="center">
          <Group gap="xs">
            <Badge
              variant="light"
              color={statusBadge.color}
              size="lg"
              styles={{
                root: {
                  background: statusBadge.bg,
                  color: statusBadge.text,
                  border: `1px solid ${statusBadge.border}`,
                },
              }}
            >
              {statusBadge.label}
            </Badge>
            {project.is_active && (
              <Badge
                variant="light"
                color="ocean"
                size="md"
                styles={{
                  root: {
                    background: 'rgba(18, 128, 109, 0.14)',
                    color: '#0f5147',
                    border: '1px solid rgba(18, 128, 109, 0.22)',
                  },
                }}
              >
                Active now
              </Badge>
            )}
          </Group>
          <Text size="xs" className="project-card__cta">
            Open workspace
          </Text>
        </Group>
      </Stack>
    </Card>
  );
}
