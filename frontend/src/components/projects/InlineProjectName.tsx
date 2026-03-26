import { useState, useRef, useEffect } from 'react';
import { Title, TextInput, Group, ActionIcon, Loader, Tooltip, Text, Stack } from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { useUpdateProject } from '../../hooks/useProjects';
import type { ProjectResponse } from '../../types';

interface InlineProjectNameProps {
  project: ProjectResponse;
}

export function InlineProjectName({ project }: InlineProjectNameProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateProject = useUpdateProject();

  useEffect(() => {
    setValue(project.name);
  }, [project.name]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === project.name) {
      setValue(project.name);
      setEditing(false);
      return;
    }

    updateProject.mutate(
      { id: project.id, data: { name: trimmed } },
      {
        onSuccess: () => {
          setEditing(false);
        },
        onError: () => {
          setValue(project.name);
          setEditing(false);
        },
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      // Stop propagation to prevent Escape from bubbling to global handlers
      // (e.g. source panel close, or any parent keyboard listeners)
      e.stopPropagation();
      setValue(project.name);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <Group gap="xs" align="center" className="project-title-editor">
        <TextInput
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          size="lg"
          style={{ flex: 1 }}
          rightSection={updateProject.isPending ? <Loader size="xs" /> : null}
          disabled={updateProject.isPending}
        />
      </Group>
    );
  }

  return (
    <Group gap="sm" align="center" wrap="nowrap" className="project-title-row">
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Title order={1}>{project.name}</Title>
        <Text size="sm" className="muted-copy">
          Refine the workspace title without breaking your flow.
        </Text>
      </Stack>
      <Tooltip label="Rename project" withArrow>
        <ActionIcon
          variant="light"
          color="ocean"
          size="lg"
          radius="xl"
          aria-label="Rename project"
          onClick={() => setEditing(true)}
        >
          <IconPencil size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
