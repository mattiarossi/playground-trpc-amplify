'use client';

import { trpc } from '@/lib/trpc/provider';
import Link from 'next/link';

export default function TagsPage() {
  const { data: tags, isLoading, error } = trpc.tags.list.useQuery();

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-48 mb-8"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
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
          <p className="text-red-800">Error loading tags: {error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Browse Tags</h1>
        <p className="text-gray-600">
          Explore posts organized by topics and categories
        </p>
      </div>

      {!tags || tags.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <p className="text-gray-600">No tags available yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/tags/${tag.slug}`}
              className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all p-6 border border-gray-200 hover:border-blue-500"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    #{tag.name}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {tag.postCount} {tag.postCount === 1 ? 'post' : 'posts'}
                  </p>
                </div>
                <div className="text-blue-600">
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
