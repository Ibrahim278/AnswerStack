import { useState } from 'react';
import { Menu, ActionIcon } from '@mantine/core';
import { IconDots, IconPencil, IconTrash, IconEraser } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useNavigate, useParams } from 'react-router';
import { useClearSession, useDeleteSession } from '../../hooks/useSessions';
import { ConfirmModal } from '../common/ConfirmModal';

interface SessionMenuProps {
  projectId: string;
  sessionId: string;
  opened: boolean;
  onOpenChange: (opened: boolean) => void;
  onRename: () => void;
}

export function SessionMenu({ projectId, sessionId, opened, onOpenChange, onRename }: SessionMenuProps) {
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const navigate = useNavigate();
  const params = useParams();
  const clearSession = useClearSession(projectId);
  const deleteSession = useDeleteSession(projectId);

  const handleClear = () => {
    clearSession.mutate(sessionId, {
      onSuccess: () => {
        setClearModalOpen(false);
      },
      onError: () => {
        notifications.show({
          title: 'Failed to clear session',
          message: 'Could not clear chat messages. Please try again.',
          color: 'red',
          autoClose: 5000,
        });
      },
    });
  };

  const handleDelete = () => {
    deleteSession.mutate(sessionId, {
      onSuccess: () => {
        setDeleteModalOpen(false);
        // Navigate away if deleting active session
        if (params.sessionId === sessionId) {
          void navigate(`/projects/${projectId}/chat`);
        }
      },
      onError: () => {
        notifications.show({
          title: 'Failed to delete session',
          message: 'Could not delete chat session. Please try again.',
          color: 'red',
          autoClose: 5000,
        });
      },
    });
  };

  return (
    <>
      <Menu opened={opened} onChange={onOpenChange} position="bottom-end" withArrow>
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onOpenChange(!opened); }}
            aria-label="Session options"
          >
            <IconDots size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconPencil size={14} />}
            onClick={(e) => { e.stopPropagation(); onRename(); }}
          >
            Rename
          </Menu.Item>
          <Menu.Item
            leftSection={<IconEraser size={14} />}
            onClick={(e) => { e.stopPropagation(); setClearModalOpen(true); }}
          >
            Clear
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={(e) => { e.stopPropagation(); setDeleteModalOpen(true); }}
          >
            Delete
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <ConfirmModal
        opened={clearModalOpen}
        onClose={() => setClearModalOpen(false)}
        onConfirm={handleClear}
        title="Clear Chat?"
        message="This will delete all messages in this session. The session will remain in your sidebar."
        confirmLabel="Clear Chat"
        confirmColor="red"
        loading={clearSession.isPending}
      />

      <ConfirmModal
        opened={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Session?"
        message="This will permanently delete this chat session and all its messages. This cannot be undone."
        confirmLabel="Delete Session"
        confirmColor="red"
        loading={deleteSession.isPending}
      />
    </>
  );
}
