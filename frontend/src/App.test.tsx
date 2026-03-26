import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders with Mantine and QueryClient providers', () => {
    render(<App />);
    expect(screen.getByText(/AnswerStack/i)).toBeInTheDocument();
  });
});
