'use client';

import { trpc } from '@/lib/trpc/provider';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

export default function HomePage() {
  const { data, isLoading, error, fetchNextPage, hasNextPage } = 
    trpc.posts.list.useInfiniteQuery(
      { limit: 10 },
      {
        getNextPageParam: (lastPage) => {
          if (!lastPage) return undefined;
          // Handle potential nested data structure
          const pageData = (lastPage as any)?.data || lastPage;
          return pageData?.nextCursor;
        },
      }
    );

  // Handle potential nested data structure
  const normalizedPages = data?.pages.map((page) => {
    if (!page) return { items: [], nextCursor: undefined };
    const pageData = (page as any)?.data || page;
    return {
      items: pageData?.items || [],
      nextCursor: pageData?.nextCursor,
    };
  }) ?? [];

  const posts = normalizedPages.flatMap((page) => page?.items || []);

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
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          Latest Posts
        </h1>
        <p className="text-gray-600">
          Discover the latest articles from our community
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-6">
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
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <p className="text-gray-600 mb-4">No posts yet. Be the first to create one!</p>
          <Link
            href="/posts/new"
            className="inline-block bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 rounded-md font-medium"
          >
            Create Post
          </Link>
        </div>
      ) : (
        <>
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
                    <span className="flex items-center">
                      <svg
                        className="w-4 h-4 mr-1"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                      </svg>
                      {post.author?.name || 'Unknown'}
                    </span>
                    <span>
                      {formatDistanceToNow(new Date(post.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
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
                    <div className="flex gap-2">
                      {post.postsTags.map((pt: any) => (
                        <span
                          key={pt.tag.id}
                          className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs"
                        >
                          {pt.tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>

          {hasNextPage && (
            <div className="mt-8 text-center">
              <button
                onClick={() => fetchNextPage()}
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-6 py-3 rounded-md font-medium"
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
