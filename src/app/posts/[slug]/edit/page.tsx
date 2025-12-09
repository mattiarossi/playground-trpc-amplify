'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc/provider';
import { useRouter, useParams } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';

export default function EditPostPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const { user } = useAuthenticator((context) => [context.user]);

  const [title, setTitle] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [published, setPublished] = useState(false);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Fetch the post
  const { data: post, isLoading: isLoadingPost, error: postError } = trpc.posts.bySlug.useQuery(
    { slug },
    { enabled: !!slug }
  );

  // Fetch available tags
  const { data: tags, refetch: refetchTags } = trpc.tags.list.useQuery();

  // Initialize form with post data
  useEffect(() => {
    if (post && !isInitialized) {
      const postData = (post as any)?.data || post;
      setTitle(postData.title || '');
      setNewSlug(postData.slug || '');
      setContent(postData.content || '');
      setExcerpt(postData.excerpt || '');
      setPublished(postData.published || false);
      
      // Set selected tags
      if (postData.postsTags && postData.postsTags.length > 0) {
        const tagIds = postData.postsTags.map((pt: any) => pt.tag.id);
        setSelectedTags(tagIds);
      }
      
      setIsInitialized(true);
    }
  }, [post, isInitialized]);

  const updatePost = trpc.posts.update.useMutation({
    onSuccess: (data) => {
      router.push(`/posts/${newSlug || slug}`);
    },
    onError: (error) => {
      if (error.message.includes('slug') && error.message.includes('already exists')) {
        setSlugError('This slug is already taken. Please choose a different one.');
      }
    },
  });

  const createTagMutation = trpc.tags.create.useMutation({
    onSuccess: (newTag) => {
      refetchTags();
      setSelectedTags((prev) => [...prev, newTag.id]);
      setNewTagName('');
      setShowNewTagInput(false);
    },
    onError: (error) => {
      // Error creating tag
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!post) return;

    const postData = (post as any)?.data || post;

    updatePost.mutate({
      id: postData.id,
      title,
      slug: newSlug,
      content,
      excerpt: excerpt || undefined,
      published,
      tagIds: selectedTags,
    });
  };

  const checkSlugQuery = trpc.posts.checkSlug.useQuery(
    { slug: newSlug },
    { 
      enabled: newSlug.length > 0 && newSlug !== slug,
      refetchOnWindowFocus: false,
    }
  );

  const validateSlug = async () => {
    if (!newSlug || newSlug.trim().length === 0) {
      setSlugError('Slug is required');
      return;
    }

    // If slug hasn't changed, don't validate
    if (newSlug === slug) {
      setSlugError(null);
      return;
    }

    setIsCheckingSlug(true);
    setSlugError(null);

    try {
      const result = await checkSlugQuery.refetch();
      if (result.data && !result.data.available) {
        setSlugError('This slug is already taken. Please choose a different one.');
      }
    } catch (error) {
      // Error checking slug
    } finally {
      setIsCheckingSlug(false);
    }
  };

  const generateSlug = () => {
    const generatedSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    setNewSlug(generatedSlug);
    setSlugError(null);
  };

  const handleCreateTag = (e: React.FormEvent) => {
    e.preventDefault();
    const tagSlug = newTagName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();
    createTagMutation.mutate({
      name: newTagName,
      slug: tagSlug,
    });
  };

  // Check authorization
  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-800 mb-4">Please sign in to edit posts.</p>
        </div>
      </div>
    );
  }

  if (postError) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading post: {postError.message}</p>
        </div>
      </div>
    );
  }

  if (isLoadingPost || !isInitialized) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
            <div className="h-40 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  const postData = (post as any)?.data || post;
  const authorId = user?.userId || user?.username || '';

  // Check if current user is the author
  if (postData.authorId !== authorId) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-800">You don't have permission to edit this post.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow-sm p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Edit Post</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter post title..."
              required
            />
          </div>

          {/* Slug */}
          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-2">
              Slug
            </label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                /posts/
              </span>
              <input
                type="text"
                id="slug"
                value={newSlug}
                onChange={(e) => {
                  setNewSlug(e.target.value);
                  setSlugError(null);
                }}
                onBlur={validateSlug}
                className={`flex-1 px-4 py-2 border rounded-r-md focus:ring-blue-500 focus:border-blue-500 ${
                  slugError ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="post-slug"
                required
              />
            </div>
            {isCheckingSlug && (
              <p className="mt-1 text-sm text-gray-500">Checking availability...</p>
            )}
            {slugError && (
              <p className="mt-1 text-sm text-red-600">{slugError}</p>
            )}
            {!slugError && !isCheckingSlug && newSlug && newSlug !== slug && checkSlugQuery.data?.available && (
              <p className="mt-1 text-sm text-green-600">✓ This slug is available</p>
            )}
            {newSlug === slug && (
              <p className="mt-1 text-sm text-gray-500">Current slug (unchanged)</p>
            )}
            <button
              type="button"
              onClick={generateSlug}
              className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Generate from title
            </button>
          </div>

          {/* Excerpt */}
          <div>
            <label htmlFor="excerpt" className="block text-sm font-medium text-gray-700 mb-2">
              Excerpt (optional)
            </label>
            <textarea
              id="excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="Brief description of your post..."
            />
          </div>

          {/* Content */}
          <div>
            <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">
              Content
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={15}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              placeholder="Write your post content here... (supports HTML)"
              required
            />
            <p className="mt-1 text-sm text-gray-500">
              You can use HTML formatting in your content
            </p>
          </div>

          {/* Tags */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Tags (optional)
              </label>
              <button
                type="button"
                onClick={() => setShowNewTagInput(!showNewTagInput)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {showNewTagInput ? 'Cancel' : '+ New Tag'}
              </button>
            </div>
            
            {showNewTagInput && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateTag(e as any);
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="Enter tag name..."
                  />
                  <button
                    type="button"
                    onClick={handleCreateTag}
                    disabled={createTagMutation.isPending || !newTagName.trim()}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    {createTagMutation.isPending ? 'Creating...' : 'Create'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Creates a new tag and automatically adds it to this post
                </p>
              </div>
            )}

            {tags && tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => {
                      setSelectedTags((prev) =>
                        prev.includes(tag.id)
                          ? prev.filter((id) => id !== tag.id)
                          : [...prev, tag.id]
                      );
                    }}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                      selectedTags.includes(tag.id)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    #{tag.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No tags available yet. Create one above!</p>
            )}
          </div>

          {/* Published */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="published"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="published" className="ml-2 text-sm font-medium text-gray-700">
              Published
            </label>
          </div>

          {/* Error Message */}
          {updatePost.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">{updatePost.error.message}</p>
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updatePost.isPending || !!slugError || isCheckingSlug || !newSlug}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updatePost.isPending ? 'Updating...' : 'Update Post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
