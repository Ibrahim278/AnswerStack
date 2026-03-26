import { useEffect } from 'react';
import { Drawer, Button, NavLink, Stack, ScrollArea, Text, Box } from '@mantine/core';
import { IconPlus, IconSettings, IconFolder, IconCircleFilled } from '@tabler/icons-react';
import { useNavigate, useLocation } from 'react-router';
import { useProjects } from '../../hooks/useProjects';

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

interface MobileDrawerProps {
  opened: boolean;
  onClose: () => void;
}

export function MobileDrawer({ opened, onClose }: MobileDrawerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: projectsData } = useProjects();

  const projects = projectsData?.items ?? [];

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
      hiddenFrom="sm"
    >
      <Stack h="calc(100vh - 120px)" gap={0}>
        {/* New Project button */}
        <Box pb="sm">
          <Button
            leftSection={<IconPlus size={16} />}
            variant="light"
            size="compact-md"
            fullWidth
            onClick={() => { void navigate('/projects?new=1'); }}
          >
            New Project
          </Button>
        </Box>

        {/* Project list */}
        <ScrollArea style={{ flex: 1 }}>
          {projects.length === 0 && (
            <Text size="sm" c="dimmed" ta="center" py="md">
              No projects
            </Text>
          )}
          {projects.map((project) => {
            const isActive = location.pathname.startsWith(`/projects/${project.id}`);
            const statusColor = getStatusColor(project.index_status);

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

        {/* Bottom settings link */}
        <Box pt="sm" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
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
