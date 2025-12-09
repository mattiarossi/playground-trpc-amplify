'use client';

import { trpc } from '@/lib/trpc/provider';
import { useState } from 'react';

interface CognitoUser {
  username?: string;
  email?: string;
  status?: string;
  enabled?: boolean;
  createdDate?: Date;
  lastModifiedDate?: Date;
  mfaOptions?: any[];
}

export default function AdminUserManagement() {
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Queries
  const { data: usersData, isLoading, error, refetch } = trpc.admin.listAllUsers.useQuery();
  
  // Mutations
  const createUserMutation = trpc.admin.createUser.useMutation({
    onSuccess: () => {
      refetch();
      setNewUserEmail('');
      setShowCreateForm(false);
      alert('User created successfully!');
    },
    onError: (error) => {
      alert(`Error creating user: ${error.message}`);
    },
  });

  const deleteUserMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      refetch();
      setSelectedUser(null);
      alert('User deleted successfully!');
    },
    onError: (error) => {
      alert(`Error deleting user: ${error.message}`);
    },
  });

  const resetPasswordMutation = trpc.admin.resetUserPassword.useMutation({
    onSuccess: () => {
      alert('Password reset email sent!');
    },
    onError: (error) => {
      alert(`Error resetting password: ${error.message}`);
    },
  });

  const enableMfaMutation = trpc.admin.enableUserMfa.useMutation({
    onSuccess: () => {
      refetch();
      alert('MFA enabled successfully!');
    },
    onError: (error) => {
      alert(`Error enabling MFA: ${error.message}`);
    },
  });

  const disableMfaMutation = trpc.admin.disableUserMfa.useMutation({
    onSuccess: () => {
      refetch();
      alert('MFA disabled successfully!');
    },
    onError: (error) => {
      alert(`Error disabling MFA: ${error.message}`);
    },
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (newUserEmail) {
      createUserMutation.mutate({
        username: newUserEmail,
        sendEmail: true,
      });
    }
  };

  const handleDeleteUser = (username: string) => {
    if (confirm(`Are you sure you want to delete user ${username}?`)) {
      deleteUserMutation.mutate({ username });
    }
  };

  const handleResetPassword = (username: string) => {
    if (confirm(`Send password reset email to ${username}?`)) {
      resetPasswordMutation.mutate({ username });
    }
  };

  const handleToggleMfa = (username: string, currentlyEnabled: boolean) => {
    if (currentlyEnabled) {
      disableMfaMutation.mutate({ username });
    } else {
      enableMfaMutation.mutate({ username, mfaType: 'SOFTWARE_TOKEN' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading users...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Error Loading Users</h2>
          <p className="text-gray-600 mb-2">{error.message}</p>
          {error.data?.code === 'FORBIDDEN' && (
            <p className="text-gray-600">You need admin group membership to access this page.</p>
          )}
          <button
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const users = usersData?.users || [];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">User Management</h1>
        <p className="text-gray-600">Manage Cognito users in your application</p>
      </div>

      {/* Create User Section */}
      <div className="mb-8 bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Create New User</h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {showCreateForm ? 'Cancel' : 'New User'}
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="user@example.com"
                required
              />
            </div>
            <button
              type="submit"
              disabled={createUserMutation.isPending}
              className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
            >
              {createUserMutation.isPending ? 'Creating...' : 'Create User'}
            </button>
          </form>
        )}
      </div>

      {/* Users List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">Users ({users.length})</h2>
        </div>

        {users.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No users found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Enabled
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user: CognitoUser) => (
                  <tr key={user.username} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {user.email || user.username}
                      </div>
                      <div className="text-sm text-gray-500">
                        {user.username}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          user.status === 'CONFIRMED'
                            ? 'bg-green-100 text-green-800'
                            : user.status === 'FORCE_CHANGE_PASSWORD'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.enabled ? 'Yes' : 'No'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.createdDate
                        ? new Date(user.createdDate).toLocaleDateString()
                        : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleResetPassword(user.username!)}
                        className="text-blue-600 hover:text-blue-900"
                        disabled={resetPasswordMutation.isPending}
                      >
                        Reset Password
                      </button>
                      <button
                        onClick={() =>
                          handleToggleMfa(
                            user.username!,
                            !!(user.mfaOptions && user.mfaOptions.length > 0)
                          )
                        }
                        className="text-purple-600 hover:text-purple-900"
                        disabled={enableMfaMutation.isPending || disableMfaMutation.isPending}
                      >
                        {user.mfaOptions && user.mfaOptions.length > 0
                          ? 'Disable MFA'
                          : 'Enable MFA'}
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.username!)}
                        className="text-red-600 hover:text-red-900"
                        disabled={deleteUserMutation.isPending}
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

      {/* Loading States */}
      {(deleteUserMutation.isPending ||
        resetPasswordMutation.isPending ||
        enableMfaMutation.isPending ||
        disableMfaMutation.isPending) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg">
            <div className="text-lg">Processing...</div>
          </div>
        </div>
      )}
    </div>
  );
}
