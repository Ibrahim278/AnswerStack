import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders with Mantine, QueryClient, and Router providers', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/AnswerStack/i)).toBeInTheDocument();
    });
  });
});
