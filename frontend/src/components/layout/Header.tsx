import {
  Group,
  Burger,
  Text,
  Breadcrumbs,
  Anchor,
  ActionIcon,
  Box,
  Stack,
  ThemeIcon,
} from '@mantine/core';
import { IconSparkles, IconStack2, IconSettings } from '@tabler/icons-react';
import { useLocation, useParams, useNavigate } from 'react-router';
import { useUiStore } from '../../stores/uiStore';
import { useProject } from '../../hooks/useProjects';
import { StatusBadge } from '../common/StatusBadge';

interface HeaderProps {
  onMobileMenuToggle: () => void;
  mobileMenuOpened: boolean;
}

export function Header({ onMobileMenuToggle, mobileMenuOpened }: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ id: string }>();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  // Determine if we're on a project page
  const projectId = location.pathname.startsWith('/projects/') ? params.id : undefined;
  const { data: project } = useProject(projectId ?? '');

  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap">
      {/* Left section */}
      <Group gap="sm" wrap="nowrap">
        {/* Mobile hamburger */}
        <Burger
          opened={mobileMenuOpened}
          onClick={onMobileMenuToggle}
          hiddenFrom="md"
          size="sm"
          aria-label="Toggle navigation"
        />
        {/* Desktop sidebar toggle */}
        <Burger
          opened={false}
          onClick={toggleSidebar}
          visibleFrom="md"
          size="sm"
          aria-label="Toggle sidebar"
        />
        {/* App name -- clickable logo navigates to projects */}
        <Box
          component="button"
          onClick={() => { void navigate('/projects'); }}
          className="brand-button"
          style={{ cursor: 'pointer', border: 'none', color: 'inherit' }}
          aria-label="Go to projects"
        >
          <span className="brand-mark">
            <IconStack2 size={20} stroke={1.8} />
          </span>
          <Stack gap={0} visibleFrom="xs">
            <Text fw={700} size="sm" lh={1.1}>
              AnswerStack
            </Text>
            <Text size="xs" c="dimmed" lh={1.1}>
              Evidence-first workspace
            </Text>
          </Stack>
        </Box>
      </Group>

      {/* Center section - Breadcrumb (desktop only) */}
      {projectId && project && (
        <Box visibleFrom="md" style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <Breadcrumbs separator="·">
            <Anchor onClick={() => { void navigate('/projects'); }} style={{ cursor: 'pointer' }}>
              Projects
            </Anchor>
            <Text lineClamp={1}>{project.name}</Text>
          </Breadcrumbs>
        </Box>
      )}

      {/* Right section */}
      <Group gap="sm" wrap="nowrap">
        <ThemeIcon
          variant="light"
          color="ocean"
          radius="xl"
          size="lg"
          visibleFrom="md"
        >
          <IconSparkles size={16} stroke={1.8} />
        </ThemeIcon>
        <StatusBadge />
        <ActionIcon
          variant="light"
          color="ocean"
          size="lg"
          onClick={() => { void navigate('/settings'); }}
          aria-label="Settings"
          visibleFrom="xs"
        >
          <IconSettings size={20} stroke={1.5} />
        </ActionIcon>
      </Group>
    </Group>
  );
}
