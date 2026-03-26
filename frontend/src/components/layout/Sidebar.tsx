import { Button, NavLink, Stack, Tooltip, ScrollArea, Text, Box } from '@mantine/core';
import { IconPlus, IconSettings, IconFolder, IconCircleFilled } from '@tabler/icons-react';
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

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const { data: projectsData } = useProjects();

  const projects = projectsData?.items ?? [];

  // Extract projectId from URL for session list context
  const projectMatch = location.pathname.match(/\/projects\/([^/]+)/);
  const activeProjectId = projectMatch?.[1] ?? null;

  return (
    <Stack h="100%" gap={0}>
      {/* New Project button */}
      <Box p="xs">
        {sidebarCollapsed ? (
          <Tooltip label="New Project" position="right" withArrow>
            <Button
              variant="light"
              size="compact-md"
              fullWidth
              onClick={() => { void navigate('/projects?new=1'); }}
              aria-label="New Project"
            >
              <IconPlus size={18} />
            </Button>
          </Tooltip>
        ) : (
          <Button
            leftSection={<IconPlus size={16} />}
            variant="light"
            size="compact-md"
            fullWidth
            onClick={() => { void navigate('/projects?new=1'); }}
          >
            New Project
          </Button>
        )}
      </Box>

      {/* Project list */}
      <ScrollArea style={{ flex: 1 }} px="xs">
        {projects.length === 0 && !sidebarCollapsed && (
          <Text size="sm" c="dimmed" ta="center" py="md">
            No projects
          </Text>
        )}
        {projects.map((project) => {
          const isActive = location.pathname.startsWith(`/projects/${project.id}`);
          const statusColor = getStatusColor(project.index_status);

          if (sidebarCollapsed) {
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
          }

          return (
            <NavLink
              key={project.id}
              active={isActive}
              onClick={() => { void navigate(`/projects/${project.id}`); }}
              label={project.name}
              leftSection={<IconFolder size={20} />}
              rightSection={
                <IconCircleFilled
                  size={8}
                  style={{ color: `var(--mantine-color-${statusColor}-6)` }}
                />
              }
            />
          );
        })}
      </ScrollArea>

      {/* Session list when project is active */}
      {activeProjectId && <SessionList projectId={activeProjectId} />}

      {/* Bottom settings link */}
      <Box p="xs" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
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
