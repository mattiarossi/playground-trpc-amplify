'use client';

import { trpc } from '@/lib/trpc/provider';
import type { AppRouter } from '@/server/trpc/routers';
import type { inferRouterOutputs } from '@trpc/server';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Tag = RouterOutputs['tags']['list'][number];

/**
 * Hook for fetching all tags with cache management
 */
export function useTags() {
  const utils = trpc.useUtils();

  const query = trpc.tags.list.useQuery(undefined, {
    // Tags don't change often, keep them fresh longer
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return query;
}

/**
 * Hook for fetching a single tag by slug
 */
export function useTag(slug: string) {
  const utils = trpc.useUtils();

  const query = trpc.tags.bySlug.useQuery(
    { slug },
    {
      enabled: !!slug,
      staleTime: 5 * 60 * 1000,
    }
  );

  return query;
}

/**
 * Hook for creating a tag with cache updates
 */
export function useCreateTag() {
  const utils = trpc.useUtils();

  return trpc.tags.create.useMutation({
    onMutate: async (newTag) => {
      // Cancel outgoing refetches
      await utils.tags.list.cancel();

      // Snapshot previous value
      const previousTags = utils.tags.list.getData();

      // Optimistically add new tag
      const tempTag: Tag = {
        id: Date.now(), // temporary ID
        name: newTag.name,
        slug: newTag.slug,
        createdAt: new Date(),
        postCount: 0,
      };

      utils.tags.list.setData(undefined, (old) =>
        old ? [...old, tempTag] : [tempTag]
      );

      return { previousTags };
    },
    onError: (err, newTag, context) => {
      // Rollback on error
      if (context?.previousTags) {
        utils.tags.list.setData(undefined, context.previousTags);
      }
    },
    onSuccess: (data) => {
      // Replace temp tag with real one - include postCount
      utils.tags.list.setData(undefined, (old) =>
        old?.map((tag) => (tag.id > 1000000000 ? { ...data, postCount: 0 } : tag))
      );
    },
    onSettled: () => {
      // Refetch to ensure consistency
      utils.tags.list.invalidate();
    },
  });
}

/**
 * Hook for deleting a tag
 */
export function useDeleteTag() {
  const utils = trpc.useUtils();

  return trpc.tags.delete.useMutation({
    onMutate: async (variables) => {
      await utils.tags.list.cancel();

      const previousTags = utils.tags.list.getData();

      // Optimistically remove tag
      utils.tags.list.setData(undefined, (old) =>
        old?.filter((tag) => tag.id !== variables.id)
      );

      return { previousTags };
    },
    onError: (err, variables, context) => {
      if (context?.previousTags) {
        utils.tags.list.setData(undefined, context.previousTags);
      }
    },
    onSettled: () => {
      utils.tags.list.invalidate();
      // Posts might reference this tag
      utils.posts.list.invalidate();
    },
  });
}
