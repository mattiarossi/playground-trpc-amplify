'use client';

import { trpc } from '@/lib/trpc/provider';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { CommentSection } from '@/components/CommentSection';
import { getAvatarUrl } from '@/lib/utils/avatar';
import { useIsAdmin } from '@/lib/hooks/useIsAdmin';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useState } from 'react';

export default function PostPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { user } = useAuthenticator((context) => [context.user]);
  const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: post, isLoading, error, refetch } = trpc.posts.bySlug.useQuery(
    { slug },
    {
      // Refetch when window regains focus
      refetchOnWindowFocus: true,
      // Refetch every 15 seconds
      refetchInterval: 15000,
      refetchIntervalInBackground: false,
    }
  );

  const adminPublishMutation = trpc.posts.adminPublish.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      alert(`Error publishing post: ${error.message}`);
    },
  });

  const adminUnpublishMutation = trpc.posts.adminUnpublish.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      alert(`Error unpublishing post: ${error.message}`);
    },
  });

  const adminDeleteMutation = trpc.posts.adminDelete.useMutation({
    onSuccess: () => {
      router.push('/posts/manage');
    },
    onError: (error) => {
      alert(`Error deleting post: ${error.message}`);
      setIsDeleting(false);
    },
  });

  const handleAdminPublish = (postId: number) => {
    if (confirm('Publish this post?')) {
      adminPublishMutation.mutate({ id: postId });
    }
  };

  const handleAdminUnpublish = (postId: number) => {
    if (confirm('Unpublish this post?')) {
      adminUnpublishMutation.mutate({ id: postId });
    }
  };

  const handleAdminDelete = (postId: number, title: string) => {
    if (confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
      setIsDeleting(true);
      adminDeleteMutation.mutate({ id: postId });
    }
  };

  // Debug logging
  console.log('Post data:', post);
  console.log('Post data type:', typeof post);
  console.log('Post data keys:', post ? Object.keys(post) : 'null/undefined');
  console.log('Is loading:', isLoading);
  console.log('Error:', error);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading post: {error.message}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-10 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Post Not Found</h2>
          <p className="text-gray-600">The post you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  // Handle potential nested data structure
  const postData = (post as any)?.data || post;

  // Check if current user is the author
  const userId = user?.userId || user?.username;
  const isAuthor = userId && postData?.authorId === userId;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <article className="bg-white rounded-lg shadow-sm p-8 mb-8">
        {/* Post Header */}
        <header className="mb-8">
          <div className="flex items-start justify-between mb-4">
            <h1 className="text-4xl font-bold text-gray-900 flex-1 mr-4">
              {postData.title}
            </h1>
            
            {/* Admin Actions - Only show for admins on other users' posts */}
            {isAdmin && !isAuthor && !isAdminLoading && (
              <div className="flex gap-2">
                {postData.published ? (
                  <button
                    onClick={() => handleAdminUnpublish(postData.id)}
                    disabled={adminUnpublishMutation.isPending}
                    className="px-4 py-2 rounded-md font-medium text-sm bg-yellow-100 text-yellow-800 hover:bg-yellow-200 disabled:opacity-50 whitespace-nowrap"
                    title="Admin: Unpublish this post"
                  >
                    {adminUnpublishMutation.isPending ? 'Unpublishing...' : '📦 Unpublish'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleAdminPublish(postData.id)}
                    disabled={adminPublishMutation.isPending}
                    className="px-4 py-2 rounded-md font-medium text-sm bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-50 whitespace-nowrap"
                    title="Admin: Publish this post"
                  >
                    {adminPublishMutation.isPending ? 'Publishing...' : '✓ Publish'}
                  </button>
                )}
                <button
                  onClick={() => handleAdminDelete(postData.id, postData.title)}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-md font-medium text-sm bg-red-100 text-red-800 hover:bg-red-200 disabled:opacity-50 whitespace-nowrap"
                  title="Admin: Delete this post"
                >
                  {isDeleting ? 'Deleting...' : '🗑️ Delete'}
                </button>
              </div>
            )}

            {/* Author Actions - Only show for post authors */}
            {isAuthor && !isAdminLoading && (
              <Link
                href={`/posts/${postData.slug}/edit`}
                className="px-4 py-2 rounded-md font-medium text-sm bg-blue-100 text-blue-800 hover:bg-blue-200 whitespace-nowrap"
                title="Edit this post"
              >
                ✏️ Edit
              </Link>
            )}
          </div>

          <div className="flex items-center text-sm text-gray-600 mb-4">
            <img
              src={postData.author?.avatarUrl || getAvatarUrl(postData.author?.name || 'User')}
              alt={postData.author?.name || 'User'}
              className="w-10 h-10 rounded-full mr-3"
            />
            <div>
              {postData.author?.name ? (
                <Link
                  href={`/users/${postData.author.name}`}
                  className="font-medium text-gray-900 hover:text-blue-600"
                >
                  {postData.author.name}
                </Link>
              ) : (
                <div className="font-medium text-gray-900">Unknown</div>
              )}
              <div className="flex items-center space-x-3">
                <span>
                  {formatDistanceToNow(new Date(postData.createdAt), {
                    addSuffix: true,
                  })}
                </span>
                <span>•</span>
                <span>{postData.viewCount || 0} views</span>
              </div>
            </div>
          </div>

          {postData.postsTags && postData.postsTags.length > 0 && (
            <div className="flex gap-2">
              {postData.postsTags.map((pt: any) => (
                <Link
                  key={pt.tag.id}
                  href={`/tags/${pt.tag.slug}`}
                  className="bg-blue-100 text-blue-800 hover:bg-blue-200 px-3 py-1 rounded-full text-sm transition-colors"
                >
                  #{pt.tag.name}
                </Link>
              ))}
            </div>
          )}
        </header>

        {/* Post Content */}
        <div className="prose prose-lg max-w-none">
          <div dangerouslySetInnerHTML={{ __html: postData.content }} />
        </div>
      </article>

      {/* Author Bio */}
      {postData.author?.bio && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h3 className="text-lg font-bold text-gray-900 mb-2">About the Author</h3>
          <div className="flex items-start">
            <img
              src={postData.author.avatarUrl || getAvatarUrl(postData.author.name)}
              alt={postData.author.name}
              className="w-16 h-16 rounded-full mr-4"
            />
            <div>
              <div className="font-medium text-gray-900 mb-1">{postData.author.name}</div>
              <p className="text-gray-600 text-sm">{postData.author.bio}</p>
            </div>
          </div>
        </div>
      )}

      {/* Comments Section */}
      <CommentSection postId={postData.id} />
    </div>
  );
}
