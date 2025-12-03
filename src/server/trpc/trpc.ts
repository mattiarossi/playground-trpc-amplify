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
 * Middleware example - could be used for auth
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  // Add authentication logic here if needed
  // For now, this is a placeholder
  return next({
    ctx: {
      ...ctx,
    },
  });
});
