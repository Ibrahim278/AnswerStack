import { Modal, TextInput, Textarea, Button, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { useNavigate } from 'react-router';
import { useCreateProject } from '../../hooks/useProjects';

interface CreateProjectModalProps {
  opened: boolean;
  onClose: () => void;
}

export function CreateProjectModal({ opened, onClose }: CreateProjectModalProps) {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const navigate = useNavigate();
  const createProject = useCreateProject();

  const form = useForm({
    initialValues: {
      name: '',
      description: '',
    },
    validate: {
      name: (value) => {
        if (!value.trim()) return 'Project name is required';
        if (value.trim().length > 255) return 'Name must be 255 characters or fewer';
        return null;
      },
    },
  });

  const handleSubmit = form.onSubmit((values) => {
    createProject.mutate(
      {
        name: values.name.trim(),
        description: values.description.trim() || undefined,
      },
      {
        onSuccess: (project) => {
          form.reset();
          onClose();
          void navigate(`/projects/${project.id}`);
        },
      },
    );
  });

  const handleClose = () => {
    form.reset();
    createProject.reset();
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="New Project"
      fullScreen={isMobile ?? false}
      centered
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            label="Project Name"
            placeholder="My Knowledge Base"
            required
            data-autofocus
            {...form.getInputProps('name')}
          />
          <Textarea
            label="Description"
            placeholder="What is this project about?"
            autosize
            minRows={3}
            maxRows={6}
            {...form.getInputProps('description')}
          />
          {createProject.isError && (
            <TextInput
              error={
                createProject.error instanceof Error
                  ? createProject.error.message
                  : 'Failed to create project'
              }
              style={{ display: 'none' }}
            />
          )}
          <Button
            type="submit"
            loading={createProject.isPending}
            fullWidth
          >
            Create Project
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
