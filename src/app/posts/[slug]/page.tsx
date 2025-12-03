'use client';

import { trpc } from '@/lib/trpc/provider';
import { useParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { CommentSection } from '@/components/CommentSection';

export default function PostPage() {
  const params = useParams();
  const slug = params.slug as string;

  const { data: post, isLoading, error } = trpc.posts.bySlug.useQuery({ slug });

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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <article className="bg-white rounded-lg shadow-sm p-8 mb-8">
        {/* Post Header */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            {postData.title}
          </h1>

          <div className="flex items-center text-sm text-gray-600 mb-4">
            <img
              src={postData.author?.avatarUrl || `https://ui-avatars.com/api/?name=${postData.author?.name || 'User'}`}
              alt={postData.author?.name || 'User'}
              className="w-10 h-10 rounded-full mr-3"
            />
            <div>
              <div className="font-medium text-gray-900">{postData.author?.name || 'Unknown'}</div>
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
                <span
                  key={pt.tag.id}
                  className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm"
                >
                  {pt.tag.name}
                </span>
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
              src={postData.author.avatarUrl || `https://ui-avatars.com/api/?name=${postData.author.name}`}
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
