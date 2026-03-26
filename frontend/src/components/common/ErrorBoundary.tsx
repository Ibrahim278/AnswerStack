import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Center, Stack, Title, Text, Button, Code, Box } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * App-wide error boundary that catches render errors and shows a
 * user-friendly fallback instead of the React dev stack trace.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to console for debugging
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/projects';
  };

  render() {
    if (this.state.hasError) {
      return (
        <Center mih="60vh" p="xl">
          <Stack align="center" gap="md" maw={500}>
            <IconAlertTriangle size={56} color="var(--mantine-color-yellow-6)" />
            <Title order={2} ta="center">
              Something went wrong
            </Title>
            <Text c="dimmed" ta="center">
              An unexpected error occurred. You can try reloading the page
              or going back to the projects list.
            </Text>
            {this.state.error && (
              <Box w="100%">
                <Code block style={{ maxHeight: 120, overflow: 'auto', fontSize: 12 }}>
                  {this.state.error.message}
                </Code>
              </Box>
            )}
            <Stack gap="xs" w="100%">
              <Button onClick={this.handleReload} variant="filled" fullWidth>
                Reload Page
              </Button>
              <Button onClick={this.handleGoHome} variant="light" fullWidth>
                Back to Projects
              </Button>
            </Stack>
          </Stack>
        </Center>
      );
    }

    return this.props.children;
  }
}
