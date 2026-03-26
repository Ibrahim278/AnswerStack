import { Menu, ActionIcon } from '@mantine/core';
import {
  IconDots,
  IconMessageCircle,
  IconPencil,
  IconTrash,
} from '@tabler/icons-react';
import { useNavigate } from 'react-router';

interface ProjectCardMenuProps {
  projectId: string;
  onEdit: () => void;
  onDelete: () => void;
}

export function ProjectCardMenu({
  projectId,
  onEdit,
  onDelete,
}: ProjectCardMenuProps) {
  const navigate = useNavigate();

  return (
    <Menu shadow="md" width={180} position="bottom-end" withArrow>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          aria-label="Project actions"
        >
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <Menu.Item
          leftSection={<IconMessageCircle size={14} />}
          onClick={() => void navigate(`/projects/${projectId}/chat`)}
        >
          Open Chat
        </Menu.Item>
        <Menu.Item
          leftSection={<IconPencil size={14} />}
          onClick={onEdit}
        >
          Edit
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          color="red"
          leftSection={<IconTrash size={14} />}
          onClick={onDelete}
        >
          Delete
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
