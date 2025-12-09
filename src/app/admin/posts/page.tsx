'use client';

import { trpc } from '@/lib/trpc/provider';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIsAdmin } from '@/lib/hooks/useIsAdmin';
import { useAdminPublishPost, useDeletePost } from '@/lib/hooks/usePosts';

export default function AdminManagePostsPage() {
  const router = useRouter();
  const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showUnpublished, setShowUnpublished] = useState(true);

  const { data, isLoading, error } = trpc.posts.adminListAll.useQuery(
    { 
      limit: 50,
      search: searchTerm || undefined,
      publishedOnly: !showUnpublished,
    },
    { 
      enabled: isAdmin,
      staleTime: 30 * 1000,
    }
  );

  // Use custom hooks with automatic cache management
  const { publish: adminPublishMutation, unpublish: adminUnpublishMutation } = useAdminPublishPost();
  const adminDeleteMutation = useDeletePost();

  const handlePublish = (postId: number, title: string) => {
    if (confirm(`Publish "${title}"?`)) {
      adminPublishMutation.mutate(
        { id: postId },
        {
          onError: (error) => {
            alert(`Error publishing post: ${error.message}`);
          },
        }
      );
    }
  };

  const handleUnpublish = (postId: number, title: string) => {
    if (confirm(`Unpublish "${title}"?`)) {
      adminUnpublishMutation.mutate(
        { id: postId },
        {
          onError: (error) => {
            alert(`Error unpublishing post: ${error.message}`);
          },
        }
      );
    }
  };

  const handleDelete = (postId: number, title: string) => {
    if (confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
      setDeletingId(postId);
      adminDeleteMutation.mutate(
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

  if (isAdminLoading || (isLoading && !data)) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-800 mb-4">Access denied. Admin privileges required.</p>
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

  const posts = data?.items || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          Manage All Posts
        </h1>
        <p className="text-gray-600">
          Admin panel to manage posts from all users
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
              Search Posts
            </label>
            <input
              type="text"
              id="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by title or content..."
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={showUnpublished}
                onChange={(e) => setShowUnpublished(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Show unpublished posts</span>
            </label>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
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
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <p className="text-gray-600">No posts found.</p>
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
                    <Link 
                      href={`/users/${post.author.name}`}
                      className="font-medium text-blue-600 hover:text-blue-800"
                    >
                      {post.author.name}
                    </Link>
                    <span>•</span>
                    <span>
                      Created {formatDistanceToNow(new Date(post.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                    {post.updatedAt && post.updatedAt !== post.createdAt && (
                      <>
                        <span>•</span>
                        <span>
                          Updated {formatDistanceToNow(new Date(post.updatedAt), {
                            addSuffix: true,
                          })}
                        </span>
                      </>
                    )}
                    <span>•</span>
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
                        <Link
                          key={pt.tag.id}
                          href={`/tags/${pt.tag.slug}`}
                          className="bg-blue-100 text-blue-800 hover:bg-blue-200 px-2 py-1 rounded text-xs transition-colors"
                        >
                          #{pt.tag.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 ml-6">
                  {post.published ? (
                    <button
                      onClick={() => handleUnpublish(post.id, post.title)}
                      disabled={adminUnpublishMutation.isPending}
                      className="px-4 py-2 rounded-md font-medium text-sm whitespace-nowrap bg-yellow-100 text-yellow-800 hover:bg-yellow-200 disabled:opacity-50"
                    >
                      {adminUnpublishMutation.isPending ? 'Unpublishing...' : '📦 Unpublish'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePublish(post.id, post.title)}
                      disabled={adminPublishMutation.isPending}
                      className="px-4 py-2 rounded-md font-medium text-sm whitespace-nowrap bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-50"
                    >
                      {adminPublishMutation.isPending ? 'Publishing...' : '✓ Publish'}
                    </button>
                  )}

                  <Link
                    href={`/posts/${post.slug}`}
                    className="px-4 py-2 rounded-md font-medium text-sm text-center bg-blue-100 text-blue-800 hover:bg-blue-200"
                  >
                    👁️ View
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

      {posts.length > 0 && (
        <div className="mt-6 text-center text-sm text-gray-500">
          Showing {posts.length} post{posts.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
