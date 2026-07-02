import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './client';

// Central cache-key registry so keys stay consistent across screens.
export const queryKeys = {
  presentations: ['presentations'],
  subscription: ['subscription'],
  designs: ['designs'],
};

// ── Subscription / credits (shared across Dashboard, Design, Pricing, etc.) ──
export function useSubscription(options = {}) {
  return useQuery({
    queryKey: queryKeys.subscription,
    queryFn: async () => {
      const { data } = await api.get('/billing/subscription');
      return data.subscription;
    },
    ...options,
  });
}

// ── Presentations list (Dashboard) ──────────────────────────────────────────
export function usePresentations(options = {}) {
  return useQuery({
    queryKey: queryKeys.presentations,
    queryFn: async () => {
      const { data } = await api.get('/presentations');
      return data.presentations || [];
    },
    ...options,
  });
}

// Optimistically remove a presentation, rolling back on error.
export function useDeletePresentation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/presentations/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.presentations });
      const previous = qc.getQueryData(queryKeys.presentations);
      qc.setQueryData(queryKeys.presentations, (old = []) => old.filter(p => p.id !== id));
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKeys.presentations, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.presentations }),
  });
}

// ── Designs list (Design Gallery) ───────────────────────────────────────────
export function useDesigns(options = {}) {
  return useQuery({
    queryKey: queryKeys.designs,
    queryFn: async () => {
      const { data } = await api.get('/design');
      return data.generations || [];
    },
    ...options,
  });
}
