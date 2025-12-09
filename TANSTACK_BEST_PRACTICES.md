# TanStack Query Best Practices & Patterns

## Quick Reference

### Import Pattern
```typescript
// ✅ Use custom hooks
import { usePost, useUpdatePost } from '@/lib/hooks/usePosts';

// ❌ Avoid direct tRPC calls
import { trpc } from '@/lib/trpc/provider';
```

### Basic Query
```typescript
const { data, isLoading, error } = usePost(slug);

if (isLoading) return <Skeleton />;
if (error) return <Error message={error.message} />;
if (!data) return <NotFound />;

return <PostView post={data} />;
```

### Basic Mutation
```typescript
const updatePost = useUpdatePost();

const handleSave = () => {
  updatePost.mutate(
    { id, title, content },
    {
      onSuccess: () => {
        toast.success('Post updated!');
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }
  );
};
```

## Common Patterns

### 1. Conditional Queries

Only fetch when needed:

```typescript
const { data: user } = useUser(userId, {
  enabled: !!userId,
});

const { data: posts } = usePostsByAuthor(
  user?.id || '',
  { enabled: !!user?.id }
);
```

### 2. Dependent Queries

Wait for first query before running second:

```typescript
const { data: post } = usePost(slug);

const { data: author } = useUser(post?.authorId || '', {
  enabled: !!post?.authorId,
});
```

### 3. Polling / Real-time Updates

```typescript
const { data: comments } = useComments(postId, {
  refetchInterval: 10000, // Poll every 10 seconds
  refetchOnWindowFocus: true, // Refetch on tab focus
});
```

### 4. Optimistic Updates with UI Feedback

```typescript
const createComment = useCreateComment(postId);

const handleSubmit = () => {
  createComment.mutate(
    { content, postId },
    {
      onMutate: () => {
        // UI already updated optimistically
        setContent(''); // Clear form
      },
      onError: () => {
        // Rolled back automatically
        toast.error('Failed to post comment');
      },
      onSuccess: () => {
        toast.success('Comment posted!');
      },
    }
  );
};
```

### 5. Loading States

```typescript
const updatePost = useUpdatePost();

<button
  disabled={updatePost.isPending}
  onClick={() => updatePost.mutate({ id, title })}
>
  {updatePost.isPending ? 'Saving...' : 'Save'}
</button>
```

### 6. Error Handling

```typescript
const createPost = useCreatePost();

const handleCreate = () => {
  createPost.mutate(
    { title, content },
    {
      onError: (error) => {
        if (error.message.includes('slug')) {
          setSlugError('Slug already taken');
        } else {
          toast.error('Failed to create post');
        }
      },
    }
  );
};
```

### 7. Prefetching

Improve navigation speed:

```typescript
const utils = trpc.useUtils();

const prefetchPost = (slug: string) => {
  utils.posts.bySlug.prefetch({ slug });
};

<Link
  href={`/posts/${post.slug}`}
  onMouseEnter={() => prefetchPost(post.slug)}
>
  {post.title}
</Link>
```

### 8. Manual Cache Updates

Sometimes needed for complex scenarios:

```typescript
const utils = trpc.useUtils();

const handleLike = (postId: number) => {
  // Optimistically update cache
  utils.posts.bySlug.setData({ slug }, (old) =>
    old ? { ...old, likes: old.likes + 1 } : old
  );
  
  // Make API call
  likeMutation.mutate({ postId });
};
```

### 9. Cache Invalidation

```typescript
const utils = trpc.useUtils();

// Invalidate specific query
utils.posts.bySlug.invalidate({ slug });

// Invalidate all posts queries
utils.posts.invalidate();

// Invalidate everything
utils.invalidate();
```

### 10. Combining Multiple Queries

```typescript
const { data: post, isLoading: postLoading } = usePost(slug);
const { data: tags, isLoading: tagsLoading } = useTags();
const { data: author, isLoading: authorLoading } = useUser(post?.authorId || '');

const isLoading = postLoading || tagsLoading || authorLoading;

if (isLoading) return <Skeleton />;
```

## Performance Tips

### 1. Use Appropriate Stale Times

```typescript
// Frequently changing data
const { data } = useComments(postId); // 10 seconds

// Moderate changes
const { data } = usePost(slug); // 60 seconds

// Rarely changes
const { data } = useTags(); // 5 minutes
```

### 2. Avoid Over-fetching

```typescript
// ❌ Bad: Fetching all user data for just the name
const { data: user } = useUser(userId);
const name = user?.name;

// ✅ Better: If you frequently need just names, create a dedicated hook
const { data: userName } = useUserName(userId);
```

### 3. Batch Queries

```typescript
// Instead of multiple individual queries
const { data: post1 } = usePost(slug1);
const { data: post2 } = usePost(slug2);
const { data: post3 } = usePost(slug3);

// Use a list query when possible
const { data: posts } = usePostsByAuthor(authorId);
```

### 4. Optimize Re-renders

```typescript
// Extract only what you need
const { data: post } = usePost(slug);
const title = post?.title; // Only re-renders if title changes

// Or use selectors
const { data: postTitle } = trpc.posts.bySlug.useQuery(
  { slug },
  {
    select: (data) => data.title,
  }
);
```

## Common Mistakes to Avoid

### ❌ Don't: Call hooks conditionally

```typescript
// Wrong
if (shouldFetch) {
  const { data } = usePost(slug);
}
```

```typescript
// Right
const { data } = usePost(slug, { enabled: shouldFetch });
```

### ❌ Don't: Forget error handling

```typescript
// Wrong
const { data } = usePost(slug);
return <div>{data.title}</div>; // Can crash!
```

```typescript
// Right
const { data, error, isLoading } = usePost(slug);
if (isLoading) return <Skeleton />;
if (error) return <Error />;
if (!data) return null;
return <div>{data.title}</div>;
```

### ❌ Don't: Manually refetch after mutations

```typescript
// Wrong
const { data, refetch } = usePost(slug);
const updatePost = trpc.posts.update.useMutation({
  onSuccess: () => refetch(),
});
```

```typescript
// Right - hooks handle this automatically
const { data } = usePost(slug);
const updatePost = useUpdatePost();
```

### ❌ Don't: Fetch the same data multiple times

```typescript
// Wrong - fetches twice
function ParentComponent() {
  const { data: post } = usePost(slug);
  return <ChildComponent slug={slug} />;
}

function ChildComponent({ slug }) {
  const { data: post } = usePost(slug); // Same query!
  return <div>{post.title}</div>;
}
```

```typescript
// Right - share the data
function ParentComponent() {
  const { data: post } = usePost(slug);
  if (!post) return null;
  return <ChildComponent post={post} />;
}

function ChildComponent({ post }) {
  return <div>{post.title}</div>;
}
```

## Debugging

### Check Cache State

```typescript
import { trpc } from '@/lib/trpc/provider';

const utils = trpc.useUtils();

// Get cached data
const cachedPost = utils.posts.bySlug.getData({ slug });
console.log('Cached post:', cachedPost);

// Check query state
const queryState = utils.posts.bySlug.getQueryState({ slug });
console.log('Is stale:', queryState?.isStale);
console.log('Last fetched:', queryState?.dataUpdatedAt);
```

### React Query DevTools

Add to your app for visual debugging:

```typescript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

export function TRPCProvider({ children }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

### Enable Logging

```typescript
const [queryClient] = useState(() => new QueryClient({
  logger: {
    log: console.log,
    warn: console.warn,
    error: console.error,
  },
}));
```

## Testing

### Mock hooks in tests

```typescript
import { renderHook } from '@testing-library/react';
import { usePost } from '@/lib/hooks/usePosts';

// Mock the hook
jest.mock('@/lib/hooks/usePosts', () => ({
  usePost: jest.fn(),
}));

it('renders post title', () => {
  usePost.mockReturnValue({
    data: { title: 'Test Post' },
    isLoading: false,
    error: null,
  });
  
  const { getByText } = render(<PostView slug="test" />);
  expect(getByText('Test Post')).toBeInTheDocument();
});
```

## Resources

- [TanStack Query Docs](https://tanstack.com/query/latest)
- [tRPC React Query Docs](https://trpc.io/docs/client/react)
- [Optimistic Updates Guide](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)
- [Testing Guide](https://tanstack.com/query/latest/docs/react/guides/testing)
