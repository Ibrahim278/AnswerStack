import { useEffect } from 'react';
import {
  Drawer,
  Button,
  NavLink,
  Stack,
  ScrollArea,
  Text,
  Box,
  Group,
  ActionIcon,
  Select,
  Badge,
  ThemeIcon,
} from '@mantine/core';
import {
  IconPlus,
  IconSettings,
  IconFolder,
  IconMessage2,
  IconCircleFilled,
  IconCheck,
} from '@tabler/icons-react';
import { useNavigate, useLocation } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import { SessionList } from '../chat/SessionList';

interface MobileDrawerProps {
  opened: boolean;
  onClose: () => void;
}

function getStatusColor(status: string | undefined): string {
  switch (status) {
    case 'indexed':
      return 'green';
    case 'stale':
      return 'orange';
    case 'indexing':
      return 'blue';
    case 'failed':
      return 'red';
    default:
      return 'gray';
  }
}

function getStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'indexed':
      return 'Indexed';
    case 'stale':
      return 'Needs rebuild';
    case 'indexing':
      return 'Indexing';
    case 'failed':
      return 'Needs attention';
    default:
      return 'Not indexed';
  }
}

function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return 'Recently updated';

  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'Updated just now';
  if (diffMinutes < 60) return `Updated ${diffMinutes}m ago`;
  if (diffHours < 24) return `Updated ${diffHours}h ago`;
  if (diffDays < 30) return `Updated ${diffDays}d ago`;
  return `Updated ${date.toLocaleDateString()}`;
}

export function MobileDrawer({ opened, onClose }: MobileDrawerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: projectsData } = useProjects();

  const projects = projectsData?.items ?? [];
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const projectOptions = projects.map((project) => ({
    value: project.id,
    label: project.name,
  }));
  const projectMatch = location.pathname.match(/\/projects\/([^/]+)/);
  const activeProjectId = projectMatch?.[1] ?? null;
  const chatTargetProjectId = activeProjectId ?? projects[0]?.id ?? null;
  const activeProject = activeProjectId ? projectsById.get(activeProjectId) : null;

  const handleNewChat = () => {
    if (chatTargetProjectId) {
      void navigate(`/projects/${chatTargetProjectId}/chat`);
      return;
    }
    void navigate('/projects?new=1');
  };

  // Close drawer on any navigation
  useEffect(() => {
    if (opened) {
      onClose();
    }
    // Only trigger when pathname changes, not when opened/onClose change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="left"
      size={280}
      padding="md"
      title="AnswerStack"
      hiddenFrom="md"
    >
      <Stack h="calc(100vh - 120px)" gap={0}>
        <Box className="sidebar-action-wrap">
          <Button
            leftSection={<IconPlus size={16} />}
            variant="white"
            color="dark"
            radius="xl"
            fullWidth
            className="sidebar-primary-action"
            onClick={handleNewChat}
          >
            New Chat
          </Button>
        </Box>

        <ScrollArea style={{ flex: 1 }} className="sidebar-scroll">
          <Box className="sidebar-section sidebar-section-card">
            <Group className="sidebar-section-header" gap="xs" mb="xs" wrap="nowrap" align="center">
              <Text className="sidebar-section-title" size="xs" fw={700} c="dimmed" tt="uppercase" style={{ flex: 1, letterSpacing: '0.14em' }}>
                Projects
              </Text>
              <Text className="sidebar-section-count" size="xs" c="dimmed">
                {projects.length}
              </Text>
              <ActionIcon
                variant="subtle"
                radius="xl"
                color="dark"
                onClick={() => { void navigate('/projects?new=1'); }}
                aria-label="New Project"
              >
                <IconPlus size={16} />
              </ActionIcon>
            </Group>
            {projects.length === 0 ? (
              <Text size="sm" c="dimmed" px="xs" py="sm">
                No projects yet
              </Text>
            ) : (
              <Select
                className="sidebar-project-select"
                classNames={{
                  input: 'sidebar-project-select__input',
                  dropdown: 'sidebar-project-select__dropdown',
                  option: 'sidebar-project-select__option',
                }}
                data={projectOptions}
                value={activeProjectId}
                placeholder="Select a project"
                leftSection={<IconFolder size={16} />}
                onChange={(value) => {
                  if (value) {
                    void navigate(`/projects/${value}`);
                  }
                }}
                searchable={projects.length > 6}
                nothingFoundMessage="No projects"
                checkIconPosition="right"
                renderOption={({ option, checked }) => {
                  const project = projectsById.get(option.value);
                  const statusColor = getStatusColor(project?.index_status);
                  return (
                    <Group justify="space-between" wrap="nowrap" gap="sm">
                      <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                        <Text fw={checked ? 700 : 600} truncate>
                          {option.label}
                        </Text>
                        {project && (
                          <Text size="xs" c="dimmed" truncate>
                            {getStatusLabel(project.index_status)} · {formatRelativeTime(project.last_used_at ?? project.updated_at)}
                          </Text>
                        )}
                      </Stack>
                      <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
                        <IconCircleFilled
                          size={10}
                          style={{ color: `var(--mantine-color-${statusColor}-6)` }}
                        />
                        {checked && (
                          <ThemeIcon size="sm" radius="xl" variant="light" color="ocean">
                            <IconCheck size={12} />
                          </ThemeIcon>
                        )}
                      </Group>
                    </Group>
                  );
                }}
              />
            )}
            {activeProject && (
              <Box className="sidebar-project-summary">
                <Group justify="space-between" align="center" gap="xs">
                  <Stack gap={2}>
                    <Text size="sm" fw={600} truncate>
                      {activeProject.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {formatRelativeTime(activeProject.last_used_at ?? activeProject.updated_at)}
                    </Text>
                  </Stack>
                  <Badge
                    variant="light"
                    color={getStatusColor(activeProject.index_status)}
                    radius="xl"
                  >
                    {getStatusLabel(activeProject.index_status)}
                  </Badge>
                </Group>
              </Box>
            )}
          </Box>

          <Box className="sidebar-section sidebar-section-card">
            <Group className="sidebar-section-header" gap="xs" mb="xs">
              <IconMessage2 size={14} style={{ color: 'var(--mantine-color-dimmed)' }} />
              <Text className="sidebar-section-title" size="xs" fw={700} c="dimmed" tt="uppercase">
                Chats
              </Text>
            </Group>
            {activeProjectId ? (
              <SessionList projectId={activeProjectId} />
            ) : (
              <Text size="sm" c="dimmed" px="xs" py="sm">
                Select a project to view chats.
              </Text>
            )}
          </Box>
        </ScrollArea>

        <Box className="sidebar-footer">
          <NavLink
            active={location.pathname === '/settings'}
            onClick={() => { void navigate('/settings'); }}
            label="Settings"
            leftSection={<IconSettings size={20} />}
          />
        </Box>
      </Stack>
    </Drawer>
  );
}
