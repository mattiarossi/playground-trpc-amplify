/**
 * Custom TanStack Query hooks for tRPC
 * 
 * These hooks provide:
 * - Automatic cache management
 * - Optimistic updates
 * - Shared query data across components
 * - Proper cache invalidation
 * - Type-safe mutations and queries
 */

export {
  useComments,
  useCreateComment,
  useUpdateComment,
  useDeleteComment,
} from './useComments';

export {
  usePost,
  usePostsByAuthor,
  useCreatePost,
  useUpdatePost,
  useDeletePost,
  useAdminPublishPost,
  useCheckSlug,
} from './usePosts';

export {
  useTags,
  useTag,
  useCreateTag,
  useDeleteTag,
} from './useTags';

export {
  useUser,
  useUserByName,
  useUpdateUser,
} from './useUsers';

// For admin checking, import directly:
// import { useIsAdmin } from '@/lib/hooks/useIsAdmin';
