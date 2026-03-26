import { IconAlertTriangle } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { notifications } from '@mantine/notifications';
import { ConfirmModal } from '../common/ConfirmModal';
import { useDeleteProject } from '../../hooks/useProjects';
import type { ProjectResponse } from '../../types';

interface DeleteProjectModalProps {
  opened: boolean;
  onClose: () => void;
  project: ProjectResponse;
  documentCount: number;
}

export function DeleteProjectModal({
  opened,
  onClose,
  project,
  documentCount,
}: DeleteProjectModalProps) {
  const navigate = useNavigate();
  const deleteProject = useDeleteProject();

  const handleConfirm = () => {
    deleteProject.mutate(project.id, {
      onSuccess: () => {
        onClose();
        void navigate('/projects');
        notifications.show({
          title: 'Project deleted',
          message: `"${project.name}" has been permanently deleted.`,
          color: 'green',
        });
      },
    });
  };

  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      onConfirm={handleConfirm}
      title={`Delete ${project.name}?`}
      icon={<IconAlertTriangle size={20} color="var(--mantine-color-red-6)" />}
      message={`This will permanently delete all documents (${documentCount}), the vector index, and all chat sessions in this project. This cannot be undone.`}
      confirmLabel="Delete Project"
      confirmColor="red"
      loading={deleteProject.isPending}
    />
  );
}
