import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../trpc';
import { comments, users } from '../../db/schema';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { getUserDisplayName } from '../../utils/haiku-name';
import { EventEmitter } from 'events';
import { observable } from '@trpc/server/observable';

// Event emitter for real-time comment updates
const commentEvents = new EventEmitter();

export const commentsRouter = createTRPCRouter({
  // Get comments for a post
  byPostId: publicProcedure
    .input(
      z.object({
        postId: z.number(),
        includeReplies: z.boolean().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      const allComments = await ctx.db.query.comments.findMany({
        where: and(
          eq(comments.postId, input.postId),
          isNull(comments.parentId)
        ),
        orderBy: [desc(comments.createdAt)],
        with: {
          author: {
            columns: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          replies: input.includeReplies
            ? {
                with: {
                  author: {
                    columns: {
                      id: true,
                      name: true,
                      avatarUrl: true,
                    },
                  },
                },
                orderBy: [desc(comments.createdAt)],
              }
            : undefined,
        },
      });

      return allComments;
    }),

  // Create comment
  create: publicProcedure
    .input(
      z.object({
        content: z.string().min(1),
        postId: z.number(),
        authorId: z.string().optional(),
        parentId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { authorId, ...commentData } = input;

      // Log incoming data for debugging
      console.log('Comment create mutation called:', {
        inputAuthorId: authorId,
        hasCtxUser: !!ctx.user,
        ctxUserSub: ctx.user?.sub,
        ctxUserUsername: ctx.user?.username,
        postId: input.postId,
      });

      // Get or create user based on authenticated user
      let finalAuthorId = authorId;

      if (!finalAuthorId && ctx.user) {
        // Use Cognito sub as the user ID
        const cognitoSub = ctx.user.sub;
        const cognitoEmail = ctx.user.email || `${ctx.user.sub}@cognito.local`;
        const displayName = getUserDisplayName(ctx.user);
        
        try {
          // Look up user by Cognito sub
          let user = await ctx.db.query.users.findFirst({
            where: eq(users.id, cognitoSub),
          });

          // Create user if doesn't exist
          if (!user) {
            [user] = await ctx.db.insert(users).values({
              id: cognitoSub,
              email: cognitoEmail,
              name: displayName,
              bio: 'Cognito authenticated user',
            }).returning();
          }

          finalAuthorId = user.id;
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to create/fetch user: ${error instanceof Error ? error.message : 'Unknown error'}`,
            cause: error,
          });
        }
      }

      if (!finalAuthorId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Must be authenticated to create a comment',
        });
      }

      // Log final author ID being used
      console.log('Creating comment with finalAuthorId:', finalAuthorId);

      const [newComment] = await ctx.db
        .insert(comments)
        .values({
          ...commentData,
          authorId: finalAuthorId,
        })
        .returning();

      // Fetch with author info
      const commentWithAuthor = await ctx.db.query.comments.findFirst({
        where: eq(comments.id, newComment.id),
        with: {
          author: {
            columns: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      });

      // Emit event for real-time updates
      if (commentWithAuthor) {
        commentEvents.emit('newComment', {
          postId: commentWithAuthor.postId,
          comment: commentWithAuthor,
        });
      }

      return commentWithAuthor;
    }),

  // Update comment
  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        content: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updatedComment] = await ctx.db
        .update(comments)
        .set({ content: input.content, updatedAt: new Date() })
        .where(eq(comments.id, input.id))
        .returning();

      if (!updatedComment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      return updatedComment;
    }),

  // Delete comment
  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [deletedComment] = await ctx.db
        .delete(comments)
        .where(eq(comments.id, input.id))
        .returning();

      if (!deletedComment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      return deletedComment;
    }),

  // Subscribe to new comments for a post
  onNewComment: publicProcedure
    .input(z.object({ postId: z.number() }))
    .subscription(({ input }) => {
      return observable<any>((emit) => {
        const onComment = (data: { postId: number; comment: any }) => {
          if (data.postId === input.postId) {
            emit.next(data.comment);
          }
        };

        // Listen for new comments
        commentEvents.on('newComment', onComment);

        // Cleanup
        return () => {
          commentEvents.off('newComment', onComment);
        };
      });
    }),
});
