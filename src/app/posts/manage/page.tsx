'use client';

import { useAuthenticator } from '@aws-amplify/ui-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePostsByAuthor, useUpdatePost, useDeletePost } from '@/lib/hooks/usePosts';

export default function ManagePostsPage() {
  const router = useRouter();
  const { user } = useAuthenticator((context) => [context.user]);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const authorId = user?.userId || user?.username || '';

  // Use custom hook with automatic cache management
  const { data: posts, isLoading, error } = usePostsByAuthor(authorId, true);

  // Use custom hooks with optimistic updates
  const updatePostMutation = useUpdatePost();
  const deletePostMutation = useDeletePost();

  const togglePublish = (postId: number, currentPublished: boolean) => {
    updatePostMutation.mutate(
      {
        id: postId,
        published: !currentPublished,
      },
      {
        onError: (error) => {
          alert(`Error updating post: ${error.message}`);
        },
      }
    );
  };

  const handleDelete = (postId: number, title: string) => {
    if (confirm(`Are you sure you want to delete "${title}"?`)) {
      setDeletingId(postId);
      deletePostMutation.mutate(
        { id: postId },
        {
          onSuccess: () => {
            setDeletingId(null);
          },
          onError: (error) => {
            alert(`Error deleting post: ${error.message}`);
            setDeletingId(null);
          },
        }
      );
    }
  };

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-800 mb-4">Please sign in to manage your posts.</p>
          <Link
            href="/"
            className="inline-block bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 rounded-md font-medium"
          >
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading posts: {error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Manage My Posts
          </h1>
          <p className="text-gray-600">
            Edit, publish, or delete your posts
          </p>
        </div>
        <Link
          href="/posts/new"
          className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 rounded-md font-medium"
        >
          Create New Post
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-lg shadow-sm p-6 animate-pulse"
            >
              <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      ) : !posts || posts.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <p className="text-gray-600 mb-4">You haven't created any posts yet.</p>
          <Link
            href="/posts/new"
            className="inline-block bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 rounded-md font-medium"
          >
            Create Your First Post
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post: any) => (
            <article
              key={post.id}
              className={`bg-white rounded-lg shadow-sm p-6 ${
                !post.published ? 'border-l-4 border-yellow-400' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Link href={`/posts/${post.slug}`}>
                      <h2 className="text-2xl font-bold text-gray-900 hover:text-blue-600">
                        {post.title}
                      </h2>
                    </Link>
                    {!post.published && (
                      <span className="bg-yellow-100 text-yellow-800 text-xs font-semibold px-2.5 py-0.5 rounded">
                        DRAFT
                      </span>
                    )}
                  </div>

                  {post.excerpt && (
                    <p className="text-gray-600 mb-3">{post.excerpt}</p>
                  )}

                  <div className="flex items-center text-sm text-gray-500 space-x-4">
                    <span>
                      Created {formatDistanceToNow(new Date(post.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                    {post.updatedAt && post.updatedAt !== post.createdAt && (
                      <span>
                        Updated {formatDistanceToNow(new Date(post.updatedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    )}
                    <span className="flex items-center">
                      <svg
                        className="w-4 h-4 mr-1"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                        <path
                          fillRule="evenodd"
                          d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {post.viewCount || 0} views
                    </span>
                  </div>

                  {post.postsTags && post.postsTags.length > 0 && (
                    <div className="flex gap-2 mt-3">
                      {post.postsTags.map((pt: any) => (
                        <span
                          key={pt.tag.id}
                          className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs"
                        >
                          #{pt.tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 ml-6">
                  <button
                    onClick={() => togglePublish(post.id, post.published)}
                    disabled={updatePostMutation.isPending}
                    className={`px-4 py-2 rounded-md font-medium text-sm whitespace-nowrap ${
                      post.published
                        ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                        : 'bg-green-100 text-green-800 hover:bg-green-200'
                    } disabled:opacity-50`}
                  >
                    {updatePostMutation.isPending ? (
                      'Updating...'
                    ) : post.published ? (
                      '📦 Unpublish'
                    ) : (
                      '✓ Publish'
                    )}
                  </button>

                  <Link
                    href={`/posts/${post.slug}/edit`}
                    className="px-4 py-2 rounded-md font-medium text-sm text-center bg-blue-100 text-blue-800 hover:bg-blue-200"
                  >
                    ✏️ Edit
                  </Link>

                  <button
                    onClick={() => handleDelete(post.id, post.title)}
                    disabled={deletingId === post.id}
                    className="px-4 py-2 rounded-md font-medium text-sm bg-red-100 text-red-800 hover:bg-red-200 disabled:opacity-50"
                  >
                    {deletingId === post.id ? 'Deleting...' : '🗑️ Delete'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
