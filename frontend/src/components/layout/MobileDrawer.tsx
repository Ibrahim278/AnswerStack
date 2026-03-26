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
} from '@mantine/core';
import {
  IconPlus,
  IconSettings,
  IconFolder,
  IconMessage2,
} from '@tabler/icons-react';
import { useNavigate, useLocation } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import { SessionList } from '../chat/SessionList';

interface MobileDrawerProps {
  opened: boolean;
  onClose: () => void;
}

export function MobileDrawer({ opened, onClose }: MobileDrawerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: projectsData } = useProjects();

  const projects = projectsData?.items ?? [];
  const projectOptions = projects.map((project) => ({
    value: project.id,
    label: project.name,
  }));
  const projectMatch = location.pathname.match(/\/projects\/([^/]+)/);
  const activeProjectId = projectMatch?.[1] ?? null;
  const chatTargetProjectId = activeProjectId ?? projects[0]?.id ?? null;

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
      hiddenFrom="sm"
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
              />
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
