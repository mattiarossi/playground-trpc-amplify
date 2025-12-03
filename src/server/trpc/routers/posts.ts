import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../trpc';
import { posts, postsTags, tags, users } from '../../db/schema';
import { eq, desc, like, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { getUserDisplayName } from '../../utils/haiku-name';

export const postsRouter = createTRPCRouter({
  // Get all posts with pagination
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(10),
        cursor: z.number().optional(),
        search: z.string().optional(),
        tagSlug: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor, search, tagSlug } = input;

      let conditions = [eq(posts.published, true)];

      if (search) {
        conditions.push(
          sql`${posts.title} ILIKE ${`%${search}%`} OR ${posts.content} ILIKE ${`%${search}%`}`
        );
      }

      const items = await ctx.db.query.posts.findMany({
        where: and(...conditions),
        limit: limit + 1,
        offset: cursor || 0,
        orderBy: [desc(posts.createdAt)],
        with: {
          author: {
            columns: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
          postsTags: {
            with: {
              tag: true,
            },
          },
        },
      });

      let nextCursor: number | undefined = undefined;
      if (items.length > limit) {
        items.pop();
        nextCursor = (cursor || 0) + limit;
      }

      return {
        items,
        nextCursor,
      };
    }),

  // Get single post by slug
  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const post = await ctx.db.query.posts.findFirst({
        where: eq(posts.slug, input.slug),
        with: {
          author: {
            columns: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
              bio: true,
            },
          },
          postsTags: {
            with: {
              tag: true,
            },
          },
          comments: {
            where: eq(sql`${posts.id}`, sql`${posts.id}`),
            with: {
              author: {
                columns: {
                  id: true,
                  name: true,
                  avatarUrl: true,
                },
              },
            },
            orderBy: [desc(sql`created_at`)],
          },
        },
      });

      if (!post) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Post not found',
        });
      }

      // Increment view count
      await ctx.db
        .update(posts)
        .set({ viewCount: sql`${posts.viewCount} + 1` })
        .where(eq(posts.id, post.id));

      return post;
    }),

  // Check if slug is available
  checkSlug: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const existingPost = await ctx.db.query.posts.findFirst({
        where: eq(posts.slug, input.slug),
      });
      return { available: !existingPost };
    }),

  // Create new post
  create: publicProcedure
    .input(
      z.object({
        title: z.string().min(1).max(500),
        slug: z.string().min(1).max(500),
        content: z.string().min(1),
        excerpt: z.string().optional(),
        authorId: z.string().optional(), // Changed to string for Cognito sub
        published: z.boolean().default(false),
        tagIds: z.array(z.number()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { tagIds, authorId, ...postData } = input;

      // Check if slug already exists
      const existingPost = await ctx.db.query.posts.findFirst({
        where: eq(posts.slug, postData.slug),
      });

      if (existingPost) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A post with the slug "${postData.slug}" already exists. Please use a different slug.`,
        });
      }

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
          message: 'Must be authenticated to create a post',
        });
      }

      // Create post
      let newPost;
      try {
        [newPost] = await ctx.db.insert(posts).values({
          ...postData,
          authorId: finalAuthorId,
        }).returning();
      } catch (error) {
        // Handle any unexpected database errors
        if (error instanceof Error && error.message.includes('duplicate key')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A post with this slug already exists. Please use a different slug.',
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create post: ${error instanceof Error ? error.message : 'Unknown error'}`,
          cause: error,
        });
      }

      // Associate tags if provided
      if (tagIds && tagIds.length > 0) {
        await ctx.db.insert(postsTags).values(
          tagIds.map((tagId) => ({
            postId: newPost.id,
            tagId,
          }))
        );
      }

      return newPost;
    }),

  // Update post
  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).max(500).optional(),
        slug: z.string().min(1).max(500).optional(),
        content: z.string().min(1).optional(),
        excerpt: z.string().optional(),
        published: z.boolean().optional(),
        tagIds: z.array(z.number()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, tagIds, ...updateData } = input;

      // Update post
      const [updatedPost] = await ctx.db
        .update(posts)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(posts.id, id))
        .returning();

      if (!updatedPost) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Post not found',
        });
      }

      // Update tags if provided
      if (tagIds !== undefined) {
        // Remove existing tags
        await ctx.db.delete(postsTags).where(eq(postsTags.postId, id));

        // Add new tags
        if (tagIds.length > 0) {
          await ctx.db.insert(postsTags).values(
            tagIds.map((tagId) => ({
              postId: id,
              tagId,
            }))
          );
        }
      }

      return updatedPost;
    }),

  // Delete post
  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [deletedPost] = await ctx.db
        .delete(posts)
        .where(eq(posts.id, input.id))
        .returning();

      if (!deletedPost) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Post not found',
        });
      }

      return deletedPost;
    }),
});
