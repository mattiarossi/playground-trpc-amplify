'use client';

import { trpc } from '@/lib/trpc/provider';

/**
 * Hook for fetching a user by ID
 */
export function useUser(userId: string) {
  const query = trpc.users.byId.useQuery(
    { id: userId },
    {
      enabled: !!userId,
      // User data doesn't change often
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );

  return query;
}

/**
 * Hook for fetching a user by name
 */
export function useUserByName(name: string) {
  const utils = trpc.useUtils();

  const query = trpc.users.byName.useQuery(
    { name },
    {
      enabled: !!name,
      staleTime: 5 * 60 * 1000,
    }
  );

  return query;
}

/**
 * Hook for updating user profile
 */
export function useUpdateUser() {
  const utils = trpc.useUtils();

  return trpc.users.update.useMutation({
    onMutate: async (updatedUser) => {
      // Cancel outgoing refetches
      if (updatedUser.id) {
        await utils.users.byId.cancel({ id: updatedUser.id });
      }
      if (updatedUser.name) {
        await utils.users.byName.cancel({ name: updatedUser.name });
      }

      // Snapshot previous values
      const previousUserById = updatedUser.id
        ? utils.users.byId.getData({ id: updatedUser.id })
        : undefined;
      const previousUserByName = updatedUser.name
        ? utils.users.byName.getData({ name: updatedUser.name })
        : undefined;

      return { previousUserById, previousUserByName };
    },
    onError: (err, updatedUser, context) => {
      // Rollback on error
      if (context?.previousUserById && updatedUser.id) {
        utils.users.byId.setData({ id: updatedUser.id }, context.previousUserById);
      }
      if (context?.previousUserByName && updatedUser.name) {
        utils.users.byName.setData({ name: updatedUser.name }, context.previousUserByName);
      }
    },
    onSettled: (data, error, variables) => {
      // Invalidate related queries
      if (variables.id) {
        utils.users.byId.invalidate({ id: variables.id });
      }
      if (variables.name) {
        utils.users.byName.invalidate({ name: variables.name });
      }
      // User changes might affect posts and comments
      utils.posts.list.invalidate();
      if (variables.id) {
        utils.posts.byAuthor.invalidate({ authorId: variables.id });
      }
    },
  });
}

/**
 * For admin checking, use:
 * import { useIsAdmin } from '@/lib/hooks/useIsAdmin';
 * 
 * Returns: { isAdmin: boolean, isLoading: boolean }
 */
