import { z } from 'zod';
import { createTRPCRouter, publicProcedure, protectedProcedure, adminProcedure } from '../trpc';
import { tags, postsTags } from '../../db/schema';
import { eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const tagsRouter = createTRPCRouter({
  // List all tags with post count
  list: publicProcedure.query(async ({ ctx }) => {
    const allTags = await ctx.db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        createdAt: tags.createdAt,
        postCount: sql<number>`count(${postsTags.postId})::int`,
      })
      .from(tags)
      .leftJoin(postsTags, eq(tags.id, postsTags.tagId))
      .groupBy(tags.id)
      .orderBy(tags.name);

    return allTags;
  }),

  // Get tag by slug
  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const tag = await ctx.db.query.tags.findFirst({
        where: eq(tags.slug, input.slug),
        with: {
          postsTags: {
            with: {
              post: {
                with: {
                  author: {
                    columns: {
                      id: true,
                      name: true,
                      avatarUrl: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!tag) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tag not found',
        });
      }

      return tag;
    }),

  // Create tag (authenticated users)
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [newTag] = await ctx.db.insert(tags).values(input).returning();
      return newTag;
    }),

  // Delete tag (admin only)
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Fetch the tag before deletion
      const tagToDelete = await ctx.db.query.tags.findFirst({
        where: eq(tags.id, input.id),
      });

      if (!tagToDelete) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tag not found',
        });
      }

      // Delete the tag
      await ctx.db.delete(tags).where(eq(tags.id, input.id));

      return tagToDelete;
    }),
});
