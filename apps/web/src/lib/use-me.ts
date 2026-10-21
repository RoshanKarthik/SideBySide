import type { Me, PatchMe } from '@sidebyside/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from './api';
import { useSession } from './auth-client';

/** The signed-in user's profile and preferences (null for guests). */
export function useMe() {
  const { data: session } = useSession();
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.json<Me>('/me'),
    enabled: !!session,
    staleTime: 5 * 60_000,
  });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: PatchMe) => api.json<Me>('/me', { method: 'PATCH', body: patch }),
    onSuccess: (me) => queryClient.setQueryData(['me'], me),
  });
}

/**
 * Low-bandwidth mode: hides cursor name labels and slows down whiteboard pointer updates
 * (see design-board). Applied as a class on <html> so CSS and code can both read it.
 */
export function usePreferenceClasses() {
  const me = useMe();
  const low = me.data?.lowBandwidth ?? false;
  useEffect(() => {
    document.documentElement.classList.toggle('low-bandwidth', low);
  }, [low]);
}

export function isLowBandwidth(): boolean {
  return document.documentElement.classList.contains('low-bandwidth');
}
