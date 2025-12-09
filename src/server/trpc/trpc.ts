import { initTRPC, TRPCError } from '@trpc/server';
import { db } from '../db';
import superjson from 'superjson';
import { ZodError } from 'zod';

/**
 * User information from authentication
 */
export interface User {
  sub: string;
  username: string;
  email?: string;
  groups?: string[];
}

/**
 * Create tRPC context
 */
export const createTRPCContext = async (opts: { 
  headers?: Headers;
  user?: User;
}) => {
  return {
    db,
    headers: opts.headers,
    user: opts.user,
  };
};

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

/**
 * Initialize tRPC with context
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Export reusable router and procedure helpers
 */
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

/**
 * Protected procedure - requires authentication
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // Type refinement - user is guaranteed to exist
    },
  });
});

/**
 * Admin-only procedure
 * Requires user to be authenticated and member of 'admin' group
 */
export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const isAdmin = ctx.user.groups?.includes('admin');
  if (!isAdmin) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // Type refinement - user is guaranteed to exist
    },
  });
});
