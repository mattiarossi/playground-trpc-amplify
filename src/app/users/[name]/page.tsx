'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { getInitials } from '@/lib/utils/avatar';
import { useUserByName, useUpdateUser } from '@/lib/hooks/useUsers';
import { useIsAdmin } from '@/lib/hooks/useIsAdmin';

export default function UserProfilePage() {
  const params = useParams();
  const username = params?.name as string;
  const [isEditing, setIsEditing] = useState(false);
  const { user: currentUser } = useAuthenticator((context) => [context.user]);
  const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();

  const { data: user, isLoading, error } = useUserByName(username);
  const updateUserMutation = useUpdateUser();

  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    avatarUrl: '',
  });

  // Update form data when user data loads
  if (user && !isEditing && formData.name === '') {
    setFormData({
      name: user.name || '',
      bio: user.bio || '',
      avatarUrl: user.avatarUrl || '',
    });
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username && user) {
      updateUserMutation.mutate(
        {
          id: user.id,
          name: formData.name !== user?.name ? formData.name : undefined,
          bio: formData.bio,
          avatarUrl: formData.avatarUrl,
        },
        {
          onSuccess: () => {
            setIsEditing(false);
            alert('Profile updated successfully!');
          },
          onError: (error) => {
            alert(`Error updating profile: ${error.message}`);
          },
        }
      );
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="flex items-center space-x-4 mb-8">
            <div className="w-24 h-24 bg-gray-200 rounded-full"></div>
            <div className="flex-1">
              <div className="h-8 bg-gray-200 rounded w-48 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-64"></div>
            </div>
          </div>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">
            {error?.message || 'User not found'}
          </p>
          <Link href="/" className="text-blue-600 hover:underline mt-2 inline-block">
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  // Check if current user can edit this profile
  const currentUserEmail = currentUser?.signInDetails?.loginId;
  const isOwnProfile = currentUserEmail === user.email;
  const canEdit = isOwnProfile || isAdmin;
  const isAdminOverride = !isOwnProfile && isAdmin;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Profile Header */}
      <div className={`rounded-lg shadow-sm p-8 mb-8 ${isEditing && isAdminOverride ? 'bg-orange-50 border-2 border-orange-300' : 'bg-white'}`}>
        {isEditing && isAdminOverride && (
          <div className="mb-4 p-3 bg-orange-100 border border-orange-300 rounded-md flex items-center">
            <svg className="w-5 h-5 text-orange-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium text-orange-800">
              Admin Override: You are editing another user's profile
            </span>
          </div>
        )}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center space-x-6">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-24 h-24 rounded-full border-4 border-gray-200"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-3xl font-bold">
                {getInitials(user.name)}
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {user.name}
              </h1>
              <p className="text-gray-600">{user.email}</p>
              {user.createdAt && (
                <p className="text-sm text-gray-500 mt-1">
                  Member since {new Date(user.createdAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
          {canEdit && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`px-4 py-2 text-white rounded transition-colors ${
                isAdminOverride
                  ? 'bg-orange-600 hover:bg-orange-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isEditing ? 'Cancel' : isAdminOverride ? 'Admin Edit' : 'Edit Profile'}
            </button>
          )}
        </div>

        {isEditing ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bio
              </label>
              <textarea
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Tell us about yourself..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Avatar URL
              </label>
              <input
                type="url"
                value={formData.avatarUrl}
                onChange={(e) => setFormData({ ...formData, avatarUrl: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://example.com/avatar.jpg"
              />
            </div>
            <button
              type="submit"
              disabled={updateUserMutation.isPending}
              className={`px-6 py-2 text-white rounded disabled:bg-gray-400 transition-colors ${
                isAdminOverride
                  ? 'bg-orange-600 hover:bg-orange-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {updateUserMutation.isPending ? 'Saving...' : isAdminOverride ? 'Save Admin Changes' : 'Save Changes'}
            </button>
          </form>
        ) : (
          user.bio && (
            <div className="border-t pt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">About</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{user.bio}</p>
            </div>
          )
        )}
      </div>

      {/* User's Posts */}
      <div className="bg-white rounded-lg shadow-sm p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Posts by {user.name}
        </h2>

        {!user.posts || user.posts.length === 0 ? (
          <p className="text-gray-600 text-center py-8">
            No posts yet.
          </p>
        ) : (
          <div className="space-y-4">
            {user.posts
              .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((post: any) => (
              <article
                key={post.id}
                className="border-b border-gray-200 pb-4 last:border-b-0"
              >
                <Link href={`/posts/${post.slug}`}>
                  <h3 className="text-xl font-semibold text-gray-900 hover:text-blue-600 mb-2">
                    {post.title}
                  </h3>
                </Link>
                {post.excerpt && (
                  <p className="text-gray-600 mb-2">{post.excerpt}</p>
                )}
                <div className="flex items-center text-sm text-gray-500 space-x-4">
                  {post.createdAt && (
                    <span>
                      {formatDistanceToNow(new Date(post.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  )}
                  {post.published !== undefined && (
                    <span className={post.published ? 'text-green-600' : 'text-yellow-600'}>
                      {post.published ? 'Published' : 'Draft'}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
