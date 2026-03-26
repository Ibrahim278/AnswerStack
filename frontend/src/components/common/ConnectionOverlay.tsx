import { useState, useEffect, useCallback } from 'react';
import { Overlay, Center, Stack, Title, Text, Button } from '@mantine/core';
import { IconWifiOff } from '@tabler/icons-react';

interface ConnectionOverlayProps {
  visible: boolean;
  onRetry: () => void;
}

// Stub - full implementation in Task 3
export function ConnectionOverlay({ visible, onRetry }: ConnectionOverlayProps) {
  const [countdown, setCountdown] = useState(10);

  const handleRetry = useCallback(() => {
    setCountdown(10);
    onRetry();
  }, [onRetry]);

  useEffect(() => {
    if (!visible) {
      setCountdown(10);
      return;
    }

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleRetry();
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { clearInterval(interval); };
  }, [visible, handleRetry]);

  if (!visible) return null;

  return (
    <Overlay fixed zIndex={9999} backgroundOpacity={0.85} color="#000">
      <Center h="100vh">
        <Stack align="center" gap="md">
          <IconWifiOff size={64} color="var(--mantine-color-yellow-5)" />
          <Title order={2} c="white">Cannot reach server</Title>
          <Text c="dimmed">Attempting to reconnect...</Text>
          <Text c="dimmed" size="sm">Retrying in {countdown}s...</Text>
          <Button onClick={handleRetry} variant="light" color="blue">
            Retry Now
          </Button>
        </Stack>
      </Center>
    </Overlay>
  );
}
