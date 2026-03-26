import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dropzone/styles.css';

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from './queryClient';
import { theme } from './theme';

export function App() {
  return (
    <MantineProvider theme={theme}>
      <Notifications position="top-right" autoClose={5000} />
      <QueryClientProvider client={queryClient}>
        <div>AnswerStack - Frontend Shell (routing added in Plan 03)</div>
      </QueryClientProvider>
    </MantineProvider>
  );
}
