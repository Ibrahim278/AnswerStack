import { Container, Title, Text, Button, Group, Paper, Stack, ThemeIcon } from '@mantine/core';
import { IconArrowLeft, IconCompass, IconSettings } from '@tabler/icons-react';
import { useNavigate } from 'react-router';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Container size="sm" py="xl">
      <Paper className="surface-card" radius="xl" p="xl">
        <Stack gap="lg" align="flex-start">
          <ThemeIcon size={56} radius="xl" color="ocean" variant="light">
            <IconCompass size={28} stroke={1.8} />
          </ThemeIcon>
          <div>
            <Text className="page-intro__eyebrow" mb={8}>
              Recovery
            </Text>
            <Title order={1}>Page not found</Title>
            <Text c="dimmed" mt="sm">
              The link may be outdated, the item may have been removed, or the address may be incomplete.
            </Text>
          </div>
          <Group>
            <Button
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => { void navigate('/projects'); }}
            >
              Back to Projects
            </Button>
            <Button
              variant="light"
              leftSection={<IconSettings size={16} />}
              onClick={() => { void navigate('/settings'); }}
            >
              Open Settings
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Container>
  );
}
