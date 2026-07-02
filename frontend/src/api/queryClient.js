import { QueryClient } from '@tanstack/react-query';

// Shared React Query client. Sensible defaults for this app:
// - data is considered fresh for 30s (dedupes rapid re-navigations)
// - no refetch on window focus (SSE + explicit invalidation keep things live)
// - a single retry on transient failures
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
