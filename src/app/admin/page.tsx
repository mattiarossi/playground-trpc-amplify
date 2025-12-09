'use client';

import AdminUserManagement from '@/components/AdminUserManagement';
import { useIsAdmin } from '@/lib/hooks/useIsAdmin';
import Link from 'next/link';

export default function AdminPage() {
  const { isAdmin, isLoading } = useIsAdmin();

  if (isLoading) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600">You do not have permission to access this page.</p>
          <p className="text-gray-600 mt-2">Admin group membership is required.</p>
          <Link href="/" className="text-blue-600 hover:underline mt-4 inline-block">
            Return to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <AdminUserManagement />
    </main>
  );
}
