'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/provider';
import { useRouter } from 'next/navigation';

export default function NewPostPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [published, setPublished] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);

  const createPost = trpc.posts.create.useMutation({
    onSuccess: (data) => {
      console.log('onSuccess called with data:', data);
      if (data && data.slug) {
        router.push(`/posts/${data.slug}`);
      } else {
        console.error('Data or slug is undefined:', data);
      }
    },
    onError: (error) => {
      console.error('Create post error:', error);
      // If slug conflict, suggest an alternative
      if (error.message.includes('slug') && error.message.includes('already exists')) {
        const timestamp = Date.now();
        const suggestedSlug = `${slug}-${timestamp}`;
        if (confirm(`The slug "${slug}" is already taken. Would you like to use "${suggestedSlug}" instead?`)) {
          setSlug(suggestedSlug);
        }
      }
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    createPost.mutate({
      title,
      slug: slug || title.toLowerCase().replace(/\s+/g, '-'),
      content,
      excerpt: excerpt || undefined,
      published,
    });
  };

  const checkSlugQuery = trpc.posts.checkSlug.useQuery(
    { slug },
    { 
      enabled: slug.length > 0,
      refetchOnWindowFocus: false,
    }
  );

  const validateSlug = async () => {
    if (!slug || slug.trim().length === 0) {
      setSlugError('Slug is required');
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
      console.error('Error checking slug:', error);
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
    setSlug(generatedSlug);
    setSlugError(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow-sm p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Create New Post</h1>

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
              onBlur={generateSlug}
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
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
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
            {!slugError && !isCheckingSlug && slug && checkSlugQuery.data?.available && (
              <p className="mt-1 text-sm text-green-600">✓ This slug is available</p>
            )}
            {!slugError && !isCheckingSlug && !slug && (
              <p className="mt-1 text-sm text-gray-500">
                Must be unique. Auto-generated from title when you leave the title field.
              </p>
            )}
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
              Publish immediately
            </label>
          </div>

          {/* Error Message */}
          {createPost.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">{createPost.error.message}</p>
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
              disabled={createPost.isPending || !!slugError || isCheckingSlug || !slug}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createPost.isPending ? 'Creating...' : 'Create Post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
