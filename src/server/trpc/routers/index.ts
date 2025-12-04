import { createTRPCRouter } from '../trpc';
import { postsRouter } from './posts';
import { commentsRouter } from './comments';
import { usersRouter } from './users';
import { tagsRouter } from './tags';

/**
 * Main tRPC router - combines all sub-routers
 */
export const appRouter = createTRPCRouter({
  posts: postsRouter,
  comments: commentsRouter,
  users: usersRouter,
  tags: tagsRouter,
});

// Export type definition of API
export type AppRouter = typeof appRouter;
