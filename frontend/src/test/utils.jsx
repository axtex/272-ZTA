import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(ui) {
  const queryClient = createTestQueryClient();
  const needsRouter = !(ui?.props && Object.prototype.hasOwnProperty.call(ui.props, 'router'));
  return render(
    <QueryClientProvider client={queryClient}>
      {needsRouter ? <MemoryRouter>{ui}</MemoryRouter> : ui}
    </QueryClientProvider>,
  );
}

