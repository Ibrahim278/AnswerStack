import {
  Button,
  NavLink,
  Stack,
  Tooltip,
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
  IconCircleFilled,
  IconMessage2,
  IconCheck,
} from '@tabler/icons-react';
import { useNavigate, useLocation } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import { useUiStore } from '../../stores/uiStore';
import { SessionList } from '../chat/SessionList';

const STATUS_COLORS: Record<string, string> = {
  indexed: 'green',
  not_indexed: 'gray',
  stale: 'orange',
  indexing: 'blue',
  failed: 'red',
};

function getStatusColor(status: string | undefined): string {
  return STATUS_COLORS[status ?? ''] ?? 'gray';
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

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
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

  return (
    <Stack h="100%" gap={0} className="sidebar-panel">
      <Box className="sidebar-action-wrap">
        {sidebarCollapsed ? (
          <Tooltip label={chatTargetProjectId ? 'New Chat' : 'New Project'} position="right" withArrow>
            <Button
              variant="light"
              size="compact-md"
              fullWidth
              onClick={handleNewChat}
              aria-label={chatTargetProjectId ? 'New Chat' : 'New Project'}
            >
              <IconPlus size={18} />
            </Button>
          </Tooltip>
        ) : (
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
        )}
      </Box>

      <ScrollArea style={{ flex: 1 }} className="sidebar-scroll">
        {sidebarCollapsed ? (
          <>
            <Box className="sidebar-section sidebar-section--tight">
              {projects.map((project) => {
                const isActive = location.pathname.startsWith(`/projects/${project.id}`);
                const statusColor = getStatusColor(project.index_status);

                return (
                  <Tooltip key={project.id} label={project.name} position="right" withArrow>
                    <NavLink
                      active={isActive}
                      onClick={() => { void navigate(`/projects/${project.id}`); }}
                      label=""
                      leftSection={<IconFolder size={20} />}
                      rightSection={
                        <IconCircleFilled
                          size={8}
                          style={{ color: `var(--mantine-color-${statusColor}-6)` }}
                        />
                      }
                      aria-label={project.name}
                    />
                  </Tooltip>
                );
              })}
            </Box>
            {activeProjectId && (
              <Box className="sidebar-section sidebar-section--tight">
                <SessionList projectId={activeProjectId} />
              </Box>
            )}
          </>
        ) : (
          <>
            <Box className="sidebar-section sidebar-section-card">
              <Group className="sidebar-section-header" gap="xs" mb="xs" wrap="nowrap" align="center">
                <Text className="sidebar-section-title" size="xs" fw={700} c="dimmed" tt="uppercase" style={{ flex: 1, letterSpacing: '0.14em' }}>
                  Projects
                </Text>
                <Text className="sidebar-section-count" size="xs" c="dimmed">
                  {projects.length}
                </Text>
                <Tooltip label="New Project" withArrow>
                  <ActionIcon
                    variant="subtle"
                    radius="xl"
                    color="dark"
                    onClick={() => { void navigate('/projects?new=1'); }}
                    aria-label="New Project"
                  >
                    <IconPlus size={16} />
                  </ActionIcon>
                </Tooltip>
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
          </>
        )}
      </ScrollArea>

      <Box className="sidebar-footer">
        {sidebarCollapsed ? (
          <Tooltip label="Settings" position="right" withArrow>
            <NavLink
              active={location.pathname === '/settings'}
              onClick={() => { void navigate('/settings'); }}
              label=""
              leftSection={<IconSettings size={20} />}
              aria-label="Settings"
            />
          </Tooltip>
        ) : (
          <NavLink
            active={location.pathname === '/settings'}
            onClick={() => { void navigate('/settings'); }}
            label="Settings"
            leftSection={<IconSettings size={20} />}
          />
        )}
      </Box>
    </Stack>
  );
}
