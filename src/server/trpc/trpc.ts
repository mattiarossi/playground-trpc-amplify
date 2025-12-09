import { initTRPC, TRPCError } from '@trpc/server';
import { db } from '../db';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { publishMutationEvent } from '../utils/publish-events';

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
 * Middleware to automatically publish mutation events for cache invalidation
 * Extracts resource information, mutation type, and identifiers from the procedure path and result
 */
const mutationEventMiddleware = t.middleware(async ({ ctx, next, path, type }) => {
  const result = await next({ ctx });
  
  // Only publish events for mutations that have an authenticated user
  if (type === 'mutation' && ctx.user) {
    try {
      // Extract router name and procedure from path (e.g., "posts.create" -> ["posts", "create"])
      const pathParts = path.split('.');
      const resource = pathParts[0];
      const procedure = pathParts[1];
      
      // Determine mutation type from procedure name
      let mutationType: 'create' | 'update' | 'delete' | undefined;
      if (procedure === 'create' || procedure === 'adminCreate') {
        mutationType = 'create';
      } else if (procedure === 'update' || procedure === 'adminUpdate') {
        mutationType = 'update';
      } else if (procedure === 'delete' || procedure === 'adminDelete') {
        mutationType = 'delete';
      }
      
      // Skip if not a standard mutation type
      if (!mutationType) {
        return result;
      }
      
      // Extract relevant IDs from the result
      let ids: Array<string | number> = [];
      let related: Record<string, any> = {};
      
      // Extract the actual data from tRPC result wrapper
      // The result from middleware has structure: { marker, ok, data, ctx }
      const actualData = result && typeof result === 'object' && 'data' in result 
        ? (result as any).data 
        : result;
      
      if (actualData && typeof actualData === 'object') {
        // Handle single entity result (create, update, delete operations)
        if ('id' in actualData && actualData.id !== null && actualData.id !== undefined) {
          ids.push(actualData.id as string | number);
        }
        
        // For posts, prefer slug as the primary identifier
        if ('slug' in actualData && actualData.slug) {
          // Replace numeric ID with slug for posts
          if (resource === 'posts') {
            ids = [actualData.slug as string];
          } else {
            ids.push(actualData.slug as string);
          }
        }
        
        // Extract related resource IDs
        if ('authorId' in actualData && actualData.authorId) {
          related.authorId = actualData.authorId;
        }
        if ('postId' in actualData && actualData.postId !== null && actualData.postId !== undefined) {
          related.postId = actualData.postId;
        }
        if ('parentId' in actualData && actualData.parentId !== null && actualData.parentId !== undefined) {
          related.parentId = actualData.parentId;
        }
      }
      
      // Publish event with mutation type and identifiers
      await publishMutationEvent(resource, mutationType, ids, ctx.user.sub, Object.keys(related).length > 0 ? related : undefined);
    } catch (error) {
      // Log but don't throw - we don't want to break mutations if event publishing fails
      console.error('[Mutation Middleware] Failed to publish event:', error);
    }
  }
  
  return result;
});

/**
 * Export reusable router and procedure helpers
 */
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure.use(mutationEventMiddleware);
export const createCallerFactory = t.createCallerFactory;

/**
 * Protected procedure - requires authentication
 */
export const protectedProcedure = t.procedure
  .use(mutationEventMiddleware)
  .use(async ({ ctx, next }) => {
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
export const adminProcedure = t.procedure
  .use(mutationEventMiddleware)
  .use(async ({ ctx, next }) => {
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
