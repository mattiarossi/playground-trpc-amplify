'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useTags, useCreateTag } from '@/lib/hooks/useTags';
import { useCreatePost, useCheckSlug } from '@/lib/hooks/usePosts';

export default function NewPostPage() {
  const router = useRouter();
  const { user } = useAuthenticator((context) => [context.user]);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [published, setPublished] = useState(false);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [showNewTagInput, setShowNewTagInput] = useState(false);

  // Use custom hooks with automatic cache management
  const { data: tags } = useTags();
  const createPost = useCreatePost();
  const createTagMutation = useCreateTag();
  const checkSlugQuery = useCheckSlug(slug, slug.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const authorId = user?.userId || user?.username || '';
    
    createPost.mutate(
      {
        title,
        slug: slug || title.toLowerCase().replace(/\s+/g, '-'),
        content,
        excerpt: excerpt || undefined,
        published,
        tagIds: selectedTags.length > 0 ? selectedTags : undefined,
        authorId,
      },
      {
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
      }
    );
  };

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

  const handleCreateTag = (e: React.FormEvent) => {
    e.preventDefault();
    const tagSlug = newTagName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();
    createTagMutation.mutate(
      {
        name: newTagName,
        slug: tagSlug,
      },
      {
        onSuccess: (newTag) => {
          setSelectedTags((prev) => [...prev, newTag.id]);
          setNewTagName('');
          setShowNewTagInput(false);
        },
        onError: (error) => {
          console.error('Error creating tag:', error.message);
        },
      }
    );
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
