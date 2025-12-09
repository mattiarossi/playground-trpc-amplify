# TanStack Query Integration with tRPC

This project now uses **TanStack Query (React Query)** with tRPC for efficient data fetching and state management. The implementation provides automatic cache management, optimistic updates, and shared query data across components.

## Architecture

### Core Components

1. **TRPCProvider** (`src/lib/trpc/provider.tsx`)
   - Configured QueryClient with optimized defaults
   - 30-second stale time for queries
   - 5-minute garbage collection time
   - Automatic retry with exponential backoff
   - Integrated with tRPC through `@trpc/react-query`

2. **Custom Hooks** (`src/lib/hooks/`)
   - Type-safe wrappers around tRPC queries and mutations
   - Built-in cache management
   - Optimistic updates for better UX
   - Automatic invalidation of related queries

## Custom Hooks

### Posts

```tsx
import { 
  usePost, 
  usePostsByAuthor, 
  useCreatePost, 
  useUpdatePost, 
  useDeletePost,
  useAdminPublishPost,
  useCheckSlug 
} from '@/lib/hooks/usePosts';

// Fetch a single post
const { data: post, isLoading } = usePost(slug);

// Fetch posts by author
const { data: posts } = usePostsByAuthor(authorId, includeUnpublished);

// Create a post with optimistic updates
const createPost = useCreatePost();
createPost.mutate({ title, content, slug });

// Update with automatic cache updates
const updatePost = useUpdatePost();
updatePost.mutate({ id, title });

// Delete with cache cleanup
const deletePost = useDeletePost();
deletePost.mutate({ id });

// Admin operations
const { publish, unpublish } = useAdminPublishPost();
publish.mutate({ id });

// Check slug availability
const { data: slugCheck } = useCheckSlug(slug);
```

### Comments

```tsx
import { 
  useComments, 
  useCreateComment, 
  useUpdateComment, 
  useDeleteComment 
} from '@/lib/hooks/useComments';

// Fetch comments with auto-refresh
const { data: comments } = useComments(postId, {
  includeReplies: true,
  refetchInterval: 10000, // Poll every 10 seconds
});

// Create with optimistic UI
const createComment = useCreateComment(postId);
createComment.mutate({ content, postId, parentId });

// Update and delete
const updateComment = useUpdateComment(postId);
const deleteComment = useDeleteComment(postId);
```

### Tags

```tsx
import { 
  useTags, 
  useTag, 
  useCreateTag, 
  useUpdateTag, 
  useDeleteTag 
} from '@/lib/hooks/useTags';

// Fetch all tags (cached for 5 minutes)
const { data: tags } = useTags();

// Fetch single tag
const { data: tag } = useTag(slug);

// Mutations with cache updates
const createTag = useCreateTag();
const updateTag = useUpdateTag();
const deleteTag = useDeleteTag();
```

### Users

```tsx
import { 
  useUser, 
  useUserByName, 
  useUpdateUser, 
  useIsAdmin 
} from '@/lib/hooks/useUsers';

// Fetch user data
const { data: user } = useUser(userId);
const { data: user } = useUserByName(name);

// Update with optimistic updates
const updateUser = useUpdateUser();
updateUser.mutate({ userId, name, bio });

// Check admin status
const isAdmin = useIsAdmin();
```

## Key Features

### 1. Automatic Cache Management

Queries are automatically cached and shared across components:

```tsx
// Component A
const { data: post } = usePost('my-post');

// Component B - uses cached data!
const { data: post } = usePost('my-post');
```

### 2. Optimistic Updates

Mutations update the UI immediately before the server responds:

```tsx
const createComment = useCreateComment(postId);

// UI updates immediately, then syncs with server
createComment.mutate({
  content: 'Great post!',
  postId,
});
```

### 3. Smart Invalidation

Related queries are automatically invalidated when data changes:

```tsx
// When a post is updated...
updatePost.mutate({ id, title });

// These are automatically refreshed:
// - posts.bySlug
// - posts.byAuthor
// - posts.list
// - posts.adminListAll
```

### 4. Configurable Stale Times

Different data types have appropriate freshness periods:

- **Posts**: 60 seconds (changes moderately)
- **Comments**: 10 seconds (updates frequently)
- **Tags**: 5 minutes (rarely changes)
- **Users**: 5 minutes (rarely changes)

### 5. Background Refetching

Components can opt-in to real-time updates:

```tsx
const { data: comments } = useComments(postId, {
  refetchInterval: 10000, // Poll every 10 seconds
  refetchOnWindowFocus: true, // Refresh when tab regains focus
});
```

## Migration Guide

### Before (Direct tRPC)

```tsx
import { trpc } from '@/lib/trpc/provider';

const { data, refetch } = trpc.posts.list.useQuery();

const createPost = trpc.posts.create.useMutation({
  onSuccess: () => {
    refetch(); // Manual refetch
  },
});
```

### After (Custom Hooks)

```tsx
import { useCreatePost } from '@/lib/hooks/usePosts';

// Data automatically shared and refetched
const createPost = useCreatePost();

// Automatic cache invalidation - no manual refetch needed!
createPost.mutate({ title, content });
```

## Performance Benefits

1. **Reduced Network Requests**: Cached data is reused across components
2. **Faster UI Updates**: Optimistic updates provide instant feedback
3. **Smarter Refetching**: Only fetch when data is actually stale
4. **Automatic Deduplication**: Multiple identical requests are merged
5. **Background Updates**: Keep data fresh without blocking the UI

## Best Practices

### 1. Use Custom Hooks

Always prefer custom hooks over direct tRPC calls:

```tsx
// ✅ Good
import { usePost } from '@/lib/hooks';
const { data } = usePost(slug);

// ❌ Avoid
import { trpc } from '@/lib/trpc/provider';
const { data } = trpc.posts.bySlug.useQuery({ slug });
```

### 2. Leverage Callbacks

Handle success/error cases in mutation callbacks:

```tsx
createPost.mutate(
  { title, content },
  {
    onSuccess: (data) => {
      router.push(`/posts/${data.slug}`);
    },
    onError: (error) => {
      alert(error.message);
    },
  }
);
```

### 3. Enable Queries Conditionally

Only fetch data when needed:

```tsx
const { data } = usePost(slug, { 
  enabled: !!slug // Only fetch if slug exists
});
```

### 4. Customize Refetch Behavior

Override defaults for specific use cases:

```tsx
const { data } = useComments(postId, {
  refetchInterval: 5000, // Poll every 5 seconds for live comments
});
```

## Debugging

### React Query DevTools

Add the DevTools to inspect cache state (development only):

```tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

<QueryClientProvider client={queryClient}>
  {children}
  <ReactQueryDevtools initialIsOpen={false} />
</QueryClientProvider>
```

### Cache Inspection

Access the query client in components:

```tsx
import { trpc } from '@/lib/trpc/provider';

const utils = trpc.useUtils();

// Inspect cache
const cachedData = utils.posts.bySlug.getData({ slug });

// Manually invalidate
utils.posts.list.invalidate();
```

## Advanced Patterns

### Prefetching

Prefetch data before navigation:

```tsx
const utils = trpc.useUtils();

const handleMouseEnter = () => {
  utils.posts.bySlug.prefetch({ slug });
};
```

### Infinite Queries

For paginated lists:

```tsx
const { 
  data, 
  fetchNextPage, 
  hasNextPage 
} = trpc.posts.list.useInfiniteQuery(
  { limit: 10 },
  {
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  }
);
```

### Dependent Queries

Wait for one query before running another:

```tsx
const { data: user } = useUser(userId);

const { data: posts } = usePostsByAuthor(
  user?.id || '',
  { enabled: !!user?.id }
);
```

## Resources

- [TanStack Query Docs](https://tanstack.com/query/latest)
- [tRPC React Query Docs](https://trpc.io/docs/client/react)
- [Optimistic Updates Guide](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)
