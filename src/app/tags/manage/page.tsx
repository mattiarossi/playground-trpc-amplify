'use client';

import { trpc } from '@/lib/trpc/provider';
import Link from 'next/link';
import { useState } from 'react';
import { useIsAdmin } from '@/lib/hooks/useIsAdmin';

export default function TagsManagementPage() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagSlug, setNewTagSlug] = useState('');

  const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();
  const { data: tags, isLoading, error, refetch } = trpc.tags.list.useQuery();

  const createTagMutation = trpc.tags.create.useMutation({
    onSuccess: () => {
      refetch();
      setNewTagName('');
      setNewTagSlug('');
      setShowCreateForm(false);
      alert('Tag created successfully!');
    },
    onError: (error) => {
      alert(`Error creating tag: ${error.message}`);
    },
  });

  const deleteTagMutation = trpc.tags.delete.useMutation({
    onSuccess: () => {
      refetch();
      alert('Tag deleted successfully!');
    },
    onError: (error) => {
      alert(`Error deleting tag: ${error.message}`);
    },
  });

  const handleCreateTag = (e: React.FormEvent) => {
    e.preventDefault();
    createTagMutation.mutate({
      name: newTagName,
      slug: newTagSlug || newTagName.toLowerCase().replace(/\s+/g, '-'),
    });
  };

  const handleDeleteTag = (id: number, name: string) => {
    if (confirm(`Are you sure you want to delete the tag "${name}"? This will remove it from all posts.`)) {
      deleteTagMutation.mutate({ id });
    }
  };

  const generateSlug = () => {
    const generatedSlug = newTagName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();
    setNewTagSlug(generatedSlug);
  };

  if (isAdminLoading || isLoading) {
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

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Access denied. Admin privileges required.</p>
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
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Manage Tags</h1>
        <p className="text-gray-600">
          Create and organize tags for categorizing posts
        </p>
      </div>

      {/* Create Tag Section */}
      <div className="mb-8 bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Create New Tag</h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {showCreateForm ? 'Cancel' : 'New Tag'}
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={handleCreateTag} className="space-y-4">
            <div>
              <label htmlFor="tagName" className="block text-sm font-medium mb-2">
                Tag Name
              </label>
              <input
                type="text"
                id="tagName"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onBlur={generateSlug}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., JavaScript"
                required
              />
            </div>
            <div>
              <label htmlFor="tagSlug" className="block text-sm font-medium mb-2">
                Slug (URL-friendly name)
              </label>
              <input
                type="text"
                id="tagSlug"
                value={newTagSlug}
                onChange={(e) => setNewTagSlug(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., javascript"
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                Auto-generated from name if left empty
              </p>
            </div>
            <button
              type="submit"
              disabled={createTagMutation.isPending}
              className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
            >
              {createTagMutation.isPending ? 'Creating...' : 'Create Tag'}
            </button>
          </form>
        )}
      </div>

      {/* Tags List */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">All Tags ({tags?.length || 0})</h2>
        </div>

        {!tags || tags.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No tags available yet. Create one above!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Slug
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Posts
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tags.map((tag) => (
                  <tr key={tag.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        #{tag.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{tag.slug}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {tag.postCount} {tag.postCount === 1 ? 'post' : 'posts'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <Link
                        href={`/tags/${tag.slug}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => handleDeleteTag(tag.id, tag.name)}
                        className="text-red-600 hover:text-red-900"
                        disabled={deleteTagMutation.isPending}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
