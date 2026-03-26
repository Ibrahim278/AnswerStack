import { Group, Burger, Text, Breadcrumbs, Anchor, ActionIcon, Box } from '@mantine/core';
import { IconStack2, IconSettings } from '@tabler/icons-react';
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
          hiddenFrom="sm"
          size="sm"
          aria-label="Toggle navigation"
        />
        {/* Desktop sidebar toggle */}
        <Burger
          opened={false}
          onClick={toggleSidebar}
          visibleFrom="sm"
          size="sm"
          aria-label="Toggle sidebar"
        />
        {/* App name */}
        <Group gap={6} wrap="nowrap">
          <IconStack2 size={24} stroke={1.5} />
          <Text fw={700} size="lg" visibleFrom="xs">
            AnswerStack
          </Text>
        </Group>
      </Group>

      {/* Center section - Breadcrumb (desktop only) */}
      {projectId && project && (
        <Box visibleFrom="sm" style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <Breadcrumbs>
            <Anchor onClick={() => { void navigate('/projects'); }} style={{ cursor: 'pointer' }}>
              Projects
            </Anchor>
            <Text lineClamp={1}>{project.name}</Text>
          </Breadcrumbs>
        </Box>
      )}

      {/* Right section */}
      <Group gap="sm" wrap="nowrap">
        <StatusBadge />
        <ActionIcon
          variant="subtle"
          color="gray"
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
