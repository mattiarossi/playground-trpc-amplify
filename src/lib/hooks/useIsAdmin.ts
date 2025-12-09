'use client';

import { useAuthenticator } from '@aws-amplify/ui-react';
import { useEffect, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * Hook to check if the current user is in the admin group
 */
export function useIsAdmin() {
  const { user } = useAuthenticator((context) => [context.user]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAdminStatus() {
      if (!user) {
        setIsAdmin(false);
        setIsLoading(false);
        return;
      }

      try {
        const session = await fetchAuthSession();
        const groups = session.tokens?.accessToken?.payload['cognito:groups'] as string[] | undefined;
        setIsAdmin(groups?.includes('admin') ?? false);
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkAdminStatus();
  }, [user]);

  return { isAdmin, isLoading };
}
