'use client';

import { trpc } from '@/lib/trpc/provider';
import type { AppRouter } from '@/server/trpc/routers';
import type { inferRouterOutputs } from '@trpc/server';
import { useEventsQuery } from '@/lib/utils/query-subscriptions';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Comment = RouterOutputs['comments']['byPostId'][number];

/**
 * Hook for fetching comments for a post with real-time updates via subscriptions
 */
export function useComments(postId: number, options?: {
  includeReplies?: boolean;
  enabled?: boolean;
}) {
  const utils = trpc.useUtils();

  // Subscribe to comments mutations for real-time updates
  useEventsQuery('comments');

  const query = trpc.comments.byPostId.useQuery(
    {
      postId,
      includeReplies: options?.includeReplies ?? true,
    },
    {
      enabled: options?.enabled ?? true,
      // Refetch when window regains focus
      refetchOnWindowFocus: true,
    }
  );

  return query;
}

/**
 * Hook for creating a comment with optimistic updates
 */
export function useCreateComment(postId: number) {
  const utils = trpc.useUtils();

  return trpc.comments.create.useMutation({
    onMutate: async (newComment) => {
      // Cancel outgoing refetches
      await utils.comments.byPostId.cancel({ postId });

      // Snapshot previous value
      const previousComments = utils.comments.byPostId.getData({
        postId,
        includeReplies: true,
      });

      // Optimistically update cache with temporary comment
      const tempComment: Comment = {
        id: Date.now(), // temporary ID
        content: newComment.content,
        postId: newComment.postId,
        authorId: 'temp-user',
        parentId: newComment.parentId || null,
        createdAt: new Date(),
        updatedAt: new Date(),
        author: {
          id: 'temp-user',
          name: 'You',
          avatarUrl: null,
        },
        replies: [],
      };

      utils.comments.byPostId.setData(
        { postId, includeReplies: true },
        (old) => old ? [...old, tempComment] : [tempComment]
      );

      return { previousComments };
    },
    onError: (err, newComment, context) => {
      // Rollback on error
      if (context?.previousComments) {
        utils.comments.byPostId.setData(
          { postId, includeReplies: true },
          context.previousComments
        );
      }
    },
    onSettled: () => {
      // Refetch to get the real data
      utils.comments.byPostId.invalidate({ postId });
      // Also update post comment count if we have that query
      utils.posts.bySlug.invalidate();
    },
  });
}

/**
 * Hook for updating a comment
 */
export function useUpdateComment(postId: number) {
  const utils = trpc.useUtils();

  return trpc.comments.update.useMutation({
    onMutate: async (updatedComment) => {
      await utils.comments.byPostId.cancel({ postId });

      const previousComments = utils.comments.byPostId.getData({
        postId,
        includeReplies: true,
      });

      // Optimistically update
      utils.comments.byPostId.setData(
        { postId, includeReplies: true },
        (old) =>
          old?.map((comment) =>
            comment.id === updatedComment.id
              ? { ...comment, content: updatedComment.content, updatedAt: new Date() }
              : comment
          )
      );

      return { previousComments };
    },
    onError: (err, variables, context) => {
      if (context?.previousComments) {
        utils.comments.byPostId.setData(
          { postId, includeReplies: true },
          context.previousComments
        );
      }
    },
    onSettled: () => {
      utils.comments.byPostId.invalidate({ postId });
    },
  });
}

/**
 * Hook for deleting a comment
 */
export function useDeleteComment(postId: number) {
  const utils = trpc.useUtils();

  return trpc.comments.delete.useMutation({
    onMutate: async (variables) => {
      await utils.comments.byPostId.cancel({ postId });

      const previousComments = utils.comments.byPostId.getData({
        postId,
        includeReplies: true,
      });

      // Optimistically remove comment
      utils.comments.byPostId.setData(
        { postId, includeReplies: true },
        (old) => old?.filter((comment) => comment.id !== variables.id)
      );

      return { previousComments };
    },
    onError: (err, variables, context) => {
      if (context?.previousComments) {
        utils.comments.byPostId.setData(
          { postId, includeReplies: true },
          context.previousComments
        );
      }
    },
    onSettled: () => {
      utils.comments.byPostId.invalidate({ postId });
      // Update post comment count
      utils.posts.bySlug.invalidate();
    },
  });
}
