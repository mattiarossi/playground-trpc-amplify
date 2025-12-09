# TanStack Query Integration with tRPC

This project uses **TanStack Query (React Query)** with tRPC for efficient data fetching and state management. The implementation provides automatic cache management, optimistic updates, real-time synchronization via WebSocket subscriptions, and shared query data across components.

## Architecture

### Core Components

1. **TRPCProvider** (`src/lib/trpc/provider.tsx`)
   - Configured QueryClient with optimized defaults
   - 30-second stale time for queries
   - 5-minute garbage collection time
   - Automatic retry with exponential backoff
   - Integrated with tRPC through `@trpc/react-query`
   - WebSocket link for real-time subscriptions

2. **Custom Hooks** (`src/lib/hooks/`)
   - Type-safe wrappers around tRPC queries and mutations
   - Built-in cache management
   - Optimistic updates for better UX
   - Automatic invalidation of related queries
   - Real-time synchronization via AppSync Events subscriptions

3. **Subscription System** (`src/lib/utils/query-subscriptions.ts`)
   - WebSocket-based real-time updates
   - Automatic cache invalidation when other clients make changes
   - Efficient subscription management with shared connections
   - Client ID tracking to avoid invalidating own mutations

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

// Fetch comments with real-time updates via subscriptions
const { data: comments } = useComments(postId, {
  includeReplies: true,
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

### 4. Real-Time Synchronization

WebSocket subscriptions provide automatic updates across all connected clients:

```tsx
// Component automatically receives updates when ANY client modifies data
const { data: comments } = useComments(postId);

// When another user adds a comment, your UI updates automatically
// No manual refetching or polling needed
```

**How it works:**
- Custom hooks automatically subscribe to relevant AppSync Events channels
- When mutations occur (create/update/delete), events are published to subscribers
- The subscription system intelligently invalidates only affected queries
- Your own mutations don't trigger invalidation (client ID filtering)
- Shared WebSocket connection for efficiency

### 5. Background Refetching

Components can customize refetch behavior:

```tsx
const { data: user } = useUser(userId, {
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
3. **Real-Time Synchronization**: WebSocket subscriptions eliminate the need for polling
4. **Smarter Refetching**: Only fetch when data is actually stale
5. **Automatic Deduplication**: Multiple identical requests are merged
6. **Efficient Subscriptions**: Shared WebSocket connection for all subscriptions
7. **Intelligent Invalidation**: Only affected queries are refreshed based on mutation events

## Real-Time Subscriptions

### How Subscriptions Work

The application uses **AppSync Events** with WebSocket connections to provide real-time updates across all connected clients. This eliminates the need for polling and ensures users always see the latest data.

### Architecture Overview

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Client A  │────────▶│ tRPC Mutation│────────▶│  Database   │
│  (Browser)  │◀────────│   Handler    │◀────────│             │
└─────────────┘         └──────────────┘         └─────────────┘
       │                       │
       │                       ▼
       │                ┌──────────────┐
       │                │ Publish Event│
       │                │  to AppSync  │
       │                └──────────────┘
       │                       │
       ▼                       ▼
┌─────────────┐         ┌──────────────┐
│ WebSocket   │◀────────│ AppSync      │
│ Subscription│         │ Events       │
└─────────────┘         │ Channel      │
       │                └──────────────┘
       │                       │
       ▼                       ▼
┌─────────────┐         ┌─────────────┐
│  Invalidate │         │   Client B  │
│   Queries   │         │  (Browser)  │
└─────────────┘         └─────────────┘
```

### Event Flow

1. **Mutation Occurs**: Client A creates/updates/deletes data via tRPC mutation
2. **Database Updated**: The mutation handler updates the database
3. **Event Published**: The backend publishes a mutation event to AppSync Events channel
4. **Subscribers Notified**: All connected clients receive the event via WebSocket
5. **Selective Invalidation**: Each client invalidates only the affected queries
6. **Automatic Refetch**: TanStack Query automatically refetches invalidated queries
7. **UI Updates**: Components re-render with fresh data

### Subscription Setup

Custom hooks automatically set up subscriptions using `useEventsQuery`:

```tsx
export function useComments(postId: number) {
  // This automatically subscribes to the 'comments' channel
  useEventsQuery('comments');
  
  return trpc.comments.byPostId.useQuery({ postId });
}
```

### Mutation Events

When a mutation occurs, the backend publishes an event with this structure:

```typescript
interface MutationEvent {
  userId: string;              // Who made the change
  resource: string;            // What changed (posts, comments, tags, users)
  mutationType: 'create' | 'update' | 'delete';
  ids?: Array<string | number>; // Specific IDs affected
  related?: Record<string, any>; // Related data (e.g., postId for comments)
}
```

### Smart Invalidation

The subscription system intelligently determines which queries to invalidate:

**For Posts:**
- `posts.bySlug`: Invalidate if the slug is in the event IDs
- `posts.byAuthor`: Invalidate if the author ID matches
- `posts.list`: Always invalidate (affects count and list items)
- `posts.adminListAll`: Always invalidate

**For Comments:**
- `comments.byPostId`: Invalidate if the postId matches the event's related data

**For Tags:**
- `tags.bySlug`: Invalidate if the slug is in the event IDs
- `tags.list`: Invalidate for creates and deletes only

**For Users:**
- `users.byName`: Invalidate if the username is in the event IDs
- `users.byId`: Invalidate if the user ID is in the event IDs
- `users.list`: Invalidate for creates and deletes only

### Client ID Filtering

To avoid unnecessary refetches, the system filters out events from the same client:

```tsx
// Each client has a unique ID
const clientId = uuidv4();

// Backend includes the client's userId in events
if (eventData.userId === clientId) {
  return; // Skip - this client triggered the mutation
}
```

This means your own mutations won't trigger redundant refetches, as optimistic updates already handle the local state.

### Shared WebSocket Connection

All subscriptions use a single shared WebSocket connection for efficiency:

```tsx
// Multiple hooks can subscribe to different channels
useEventsQuery('posts');    // Channel: subscriptions/posts
useEventsQuery('comments'); // Channel: subscriptions/comments
useEventsQuery('tags');     // Channel: subscriptions/tags

// All use the same underlying WebSocket connection
```

### Connection Health Management

The subscription system monitors WebSocket health and automatically reconnects:

- Checks connection status before subscribing
- Retries with exponential backoff on failure
- Gracefully handles authentication expiry
- Falls back to refetch on window focus if subscriptions fail

### Subscription Best Practices

1. **Trust the System**: Subscriptions work automatically in custom hooks
2. **No Manual Polling**: Avoid `refetchInterval` for subscribed resources
3. **Let Optimistic Updates Handle Local Changes**: Your mutations update immediately
4. **Use `refetchOnWindowFocus`**: Good fallback if connection is lost
5. **Monitor DevTools**: Check subscription status in browser network tab

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

### 4. Rely on Subscriptions for Real-Time Data

The subscription system handles real-time updates automatically:

```tsx
// Subscriptions are built-in - no need to configure polling
const { data } = useComments(postId);

// Updates happen automatically when any client makes changes
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
