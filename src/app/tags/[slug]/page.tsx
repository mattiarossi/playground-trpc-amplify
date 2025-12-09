'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { getInitials } from '@/lib/utils/avatar';
import { useTag } from '@/lib/hooks/useTags';

export default function TagDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const { data: tag, isLoading, error } = useTag(slug);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-10 bg-gray-200 rounded w-64 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-48 mb-8"></div>
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading tag: {error.message}</p>
          <Link href="/tags" className="text-blue-600 hover:underline mt-2 inline-block">
            ← Back to all tags
          </Link>
        </div>
      </div>
    );
  }

  if (!tag) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <p className="text-gray-600">Tag not found</p>
          <Link href="/tags" className="text-blue-600 hover:underline mt-2 inline-block">
            ← Back to all tags
          </Link>
        </div>
      </div>
    );
  }

  const posts = tag.postsTags?.map((pt: any) => pt.post).filter(Boolean) || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <Link href="/tags" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to all tags
        </Link>
        <h1 className="text-4xl font-bold text-gray-900 mb-2">#{tag.name}</h1>
        <p className="text-gray-600">
          {posts.length} {posts.length === 1 ? 'post' : 'posts'} tagged with this topic
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <p className="text-gray-600">No posts with this tag yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {posts.map((post: any) => (
            <article
              key={post.id}
              className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-6"
            >
              <Link href={`/posts/${post.slug}`}>
                <h2 className="text-2xl font-bold text-gray-900 mb-2 hover:text-blue-600">
                  {post.title}
                </h2>
              </Link>

              {post.excerpt && (
                <p className="text-gray-600 mb-4">{post.excerpt}</p>
              )}

              <div className="flex items-center justify-between text-sm text-gray-500">
                <div className="flex items-center space-x-4">
                  {post.author?.name && (
                    <Link
                      href={`/users/${post.author.name}`}
                      className="flex items-center hover:text-blue-600"
                    >
                      {post.author.avatarUrl ? (
                        <img
                          src={post.author.avatarUrl}
                          alt={post.author.name}
                          className="w-6 h-6 rounded-full mr-2"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold mr-2">
                          {getInitials(post.author.name)}
                        </div>
                      )}
                      <span>{post.author.name}</span>
                    </Link>
                  )}
                  {post.createdAt && (
                    <span>
                      {formatDistanceToNow(new Date(post.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  )}
                </div>
                {post.viewCount !== undefined && (
                  <span>{post.viewCount} views</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
