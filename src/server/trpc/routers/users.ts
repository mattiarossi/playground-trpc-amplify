import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../trpc';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const usersRouter = createTRPCRouter({
  // Get user by name (username)
  byName: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.name, input.name),
        columns: {
          id: true,
          name: true,
          email: true,
          bio: true,
          avatarUrl: true,
          createdAt: true,
        },
        with: {
          posts: {
            columns: {
              id: true,
              title: true,
              slug: true,
              excerpt: true,
              published: true,
              createdAt: true,
            },
            limit: 10,
          },
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return user;
    }),

  // Get user by ID (internal use, kept for compatibility)
  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.id),
        columns: {
          id: true,
          name: true,
          email: true,
          bio: true,
          avatarUrl: true,
          createdAt: true,
        },
        with: {
          posts: {
            columns: {
              id: true,
              title: true,
              slug: true,
              excerpt: true,
              published: true,
              createdAt: true,
            },
            limit: 10,
          },
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return user;
    }),

  // Get user by email
  byEmail: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.email, input.email),
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return user;
    }),

  // Create user
  create: publicProcedure
    .input(
      z.object({
        id: z.string(), // Cognito sub or unique identifier
        email: z.string().email(),
        name: z.string().min(1),
        bio: z.string().optional(),
        avatarUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [newUser] = await ctx.db.insert(users).values(input).returning();
      return newUser;
    }),

  // Update user (by name or id)
  update: publicProcedure
    .input(
      z.object({
        name: z.string().optional(),
        id: z.string().optional(),
        bio: z.string().optional(),
        avatarUrl: z.string().url().optional(),
        newName: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { name, id, newName, ...updateData } = input;

      if (!name && !id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Either name or id must be provided',
        });
      }

      // Check authentication
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'You must be logged in to update a profile',
        });
      }

      // Get the user being updated to check permissions
      const targetUser = await ctx.db.query.users.findFirst({
        where: name ? eq(users.name, name) : eq(users.id, id!),
      });

      if (!targetUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Check authorization: user must be editing their own profile OR be an admin
      const isOwnProfile = ctx.user.sub === targetUser.id;
      const isAdmin = ctx.user.groups?.includes('admin');

      if (!isOwnProfile && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to edit this profile',
        });
      }

      // Build the update data
      const updates: any = { ...updateData, updatedAt: new Date() };
      if (newName) {
        updates.name = newName;
      }

      // Update by name or id
      await ctx.db
        .update(users)
        .set(updates)
        .where(name ? eq(users.name, name) : eq(users.id, id!));

      // Fetch the updated user with all fields
      const updatedUser = await ctx.db.query.users.findFirst({
        where: eq(users.id, targetUser.id),
      });

      if (!updatedUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Failed to fetch updated user',
        });
      }

      return updatedUser;
    }),
});
