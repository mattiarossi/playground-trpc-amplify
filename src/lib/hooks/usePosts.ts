'use client';

import { trpc } from '@/lib/trpc/provider';
import type { AppRouter } from '@/server/trpc/routers';
import type { inferRouterOutputs } from '@trpc/server';
import { useEventsQuery } from '@/lib/utils/query-subscriptions';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Post = RouterOutputs['posts']['bySlug'];
type PostList = RouterOutputs['posts']['list']['items'];

/**
 * Hook for fetching a single post by slug with automatic cache management
 * Uses AppSync Events subscriptions for real-time updates
 */
export function usePost(slug: string) {
  const utils = trpc.useUtils();
  
  // Subscribe to posts mutations for real-time updates
  useEventsQuery('posts');
  
  const query = trpc.posts.bySlug.useQuery(
    { slug },
    {
      enabled: !!slug,
    }
  );

  // Helper to update this post in the cache
  const updateCache = (updater: (old: Post | undefined) => Post | undefined) => {
    utils.posts.bySlug.setData({ slug }, updater);
    // Also invalidate list queries to ensure consistency
    utils.posts.list.invalidate();
    utils.posts.byAuthor.invalidate();
  };

  return {
    ...query,
    updateCache,
  };
}

/**
 * Hook for fetching posts by author with cache management
 * Uses AppSync Events subscriptions for real-time updates
 */
export function usePostsByAuthor(authorId: string, includeUnpublished = false) {
  const utils = trpc.useUtils();

  // Subscribe to posts mutations for real-time updates
  useEventsQuery('posts');

  const query = trpc.posts.byAuthor.useQuery(
    { authorId, includeUnpublished },
    {
      enabled: !!authorId,
    }
  );

  return query;
}

/**
 * Hook for creating a new post with optimistic updates
 */
export function useCreatePost() {
  const utils = trpc.useUtils();

  return trpc.posts.create.useMutation({
    onMutate: async (newPost) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await utils.posts.byAuthor.cancel();

      // Snapshot the previous value
      const previousPosts = utils.posts.byAuthor.getData({
        authorId: newPost.authorId || '',
        includeUnpublished: true,
      });

      return { previousPosts };
    },
    onError: (err, newPost, context) => {
      // Rollback to previous value on error
      if (context?.previousPosts) {
        utils.posts.byAuthor.setData(
          {
            authorId: newPost.authorId || '',
            includeUnpublished: true,
          },
          context.previousPosts
        );
      }
    },
    onSettled: () => {
      // Invalidate and refetch
      utils.posts.byAuthor.invalidate();
      utils.posts.list.invalidate();
    },
  });
}

/**
 * Hook for updating a post with cache updates
 */
export function useUpdatePost() {
  const utils = trpc.useUtils();

  return trpc.posts.update.useMutation({
    onMutate: async (updatedPost) => {
      // Cancel queries
      await utils.posts.bySlug.cancel();
      await utils.posts.byAuthor.cancel();

      // Get current post if we have a slug context
      const previousPost = updatedPost.slug
        ? utils.posts.bySlug.getData({ slug: updatedPost.slug })
        : undefined;

      // Optimistically update the cache if we have the previous data
      if (previousPost && updatedPost.slug) {
        utils.posts.bySlug.setData({ slug: updatedPost.slug }, {
          ...previousPost,
          ...updatedPost,
          updatedAt: new Date(),
        });
      }

      return { previousPost };
    },
    onError: (err, updatedPost, context) => {
      // Rollback on error
      if (context?.previousPost && updatedPost.slug) {
        utils.posts.bySlug.setData({ slug: updatedPost.slug }, context.previousPost);
      }
    },
    onSettled: (data, error, variables) => {
      // Invalidate related queries
      if (variables.slug) {
        utils.posts.bySlug.invalidate({ slug: variables.slug });
      }
      utils.posts.byAuthor.invalidate();
      utils.posts.list.invalidate();
      utils.posts.adminListAll.invalidate();
    },
  });
}

/**
 * Hook for deleting a post with cache management
 */
export function useDeletePost() {
  const utils = trpc.useUtils();

  return trpc.posts.delete.useMutation({
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await utils.posts.byAuthor.cancel();
      await utils.posts.list.cancel();

      return { postId: variables.id };
    },
    onSuccess: (data, variables) => {
      // Remove from cache
      utils.posts.bySlug.setData({ slug: data.slug }, undefined);

      // Invalidate list queries
      utils.posts.byAuthor.invalidate();
      utils.posts.list.invalidate();
      utils.posts.adminListAll.invalidate();
    },
  });
}

/**
 * Hook for admin publish/unpublish operations
 */
export function useAdminPublishPost() {
  const utils = trpc.useUtils();

  const publishMutation = trpc.posts.adminPublish.useMutation({
    onSuccess: (data) => {
      // Invalidate the post cache to refetch with updated data
      utils.posts.bySlug.invalidate({ slug: data.slug });
      // Invalidate lists
      utils.posts.adminListAll.invalidate();
      utils.posts.list.invalidate();
    },
  });

  const unpublishMutation = trpc.posts.adminUnpublish.useMutation({
    onSuccess: (data) => {
      // Invalidate the post cache to refetch with updated data
      utils.posts.bySlug.invalidate({ slug: data.slug });
      // Invalidate lists
      utils.posts.adminListAll.invalidate();
      utils.posts.list.invalidate();
    },
  });

  return {
    publish: publishMutation,
    unpublish: unpublishMutation,
  };
}

/**
 * Hook for checking slug availability with debouncing
 */
export function useCheckSlug(slug: string, enabled = true) {
  return trpc.posts.checkSlug.useQuery(
    { slug },
    {
      enabled: enabled && slug.length > 0,
      refetchOnWindowFocus: false,
    }
  );
}
