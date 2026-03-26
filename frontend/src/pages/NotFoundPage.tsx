import { Container, Title, Text, Button, Group } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useNavigate } from 'react-router';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Container size="sm" py="xl">
      <Title order={1}>Page not found</Title>
      <Text c="dimmed" mt="md">
        The page you are looking for does not exist.
      </Text>
      <Group mt="xl">
        <Button
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => { void navigate('/projects'); }}
        >
          Back to Projects
        </Button>
      </Group>
    </Container>
  );
}
