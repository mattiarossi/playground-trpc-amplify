'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAuthSession } from 'aws-amplify/auth';
import { v4 as uuidv4 } from 'uuid';
import { waitForAmplifyConfig } from './amplify-config';
import { getSharedWebSocketLink } from '../trpc/appsync-ws-link';

/**
 * Interface for mutation events published to AppSync Events by the backend
 */
interface MutationEvent {
  /** User ID who performed the mutation */
  userId: string;
  /** Resource type that changed */
  resource: string;
  /** Type of mutation performed */
  mutationType: 'create' | 'update' | 'delete';
  /** Specific resource IDs affected */
  ids?: Array<string | number>;
  /** Related resource IDs */
  related?: Record<string, any>;
}

/**
 * Global registry to track active subscription channels
 */
const channels: Record<string, string> = {};

/**
 * React hook that subscribes to AppSync Events for a specific query key
 * Automatically invalidates local queries when mutations occur on other clients
 * 
 * The backend (tRPC mutations) publishes events to the subscriptions/* channels.
 * This hook subscribes to those channels and invalidates queries when events are received.
 * 
 * @param queryKey - The query key to subscribe to (e.g., 'posts', 'comments', 'tags', 'users')
 * @returns Query that provides the client ID for filtering own mutations
 * 
 * @example
 * ```typescript
 * // In your component or hook:
 * const { data: clientId } = useEventsQuery('posts');
 * 
 * // The backend automatically publishes mutation events when data changes
 * // This hook will receive those events and invalidate the appropriate queries
 * ```
 */
export function useEventsQuery(queryKey: string) {
  const queryClient = useQueryClient();

  let handlerId: string | null = null;
  let clientId = uuidv4();

  const connectAndSubscribe = async () => {
    try {
      // Wait for Amplify to be configured
      await waitForAmplifyConfig();

      // Verify authentication
      const session = await fetchAuthSession();
      if (!session.tokens?.accessToken) {
        console.warn(`[Subscription] User not authenticated, skipping connection to ${queryKey}`);
        return;
      }

      // Get the shared WebSocket link (created by tRPC provider)
      const wsLink = getSharedWebSocketLink();
      if (!wsLink) {
        console.warn(`[Subscription] WebSocket link not available yet, will retry`);
        // Retry after a delay
        setTimeout(connectAndSubscribe, 1000);
        return;
      }

      // Subscribe to the subscriptions channel using the shared WebSocket
      handlerId = await wsLink.subscribeToAdditionalChannel(
        `subscriptions/${queryKey}`,
        (eventData: MutationEvent) => {
          // Ignore events from this client (avoid invalidating own mutations)
          if (eventData.userId === clientId) {
            return;
          }

          // Invalidate queries based on the resource, mutation type, and specific IDs
          // tRPC query keys are structured as: [['resource', 'procedure'], { type: 'query', input: {...} }]
          queryClient.invalidateQueries({
            predicate: (query) => {
              const trpcPath = query.queryKey[0];
              const trpcMeta = query.queryKey[1] as any;
              
              // Skip if not a tRPC query (can be 'query' or 'infinite' for infinite queries)
              if (!Array.isArray(trpcPath) || !trpcMeta || (trpcMeta.type !== 'query' && trpcMeta.type !== 'infinite')) {
                return false;
              }
              
              // Must be for the same resource type
              if (trpcPath[0] !== eventData.resource) {
                return false;
              }
              
              const procedure = trpcPath[1];
              const input = trpcMeta.input;
              
              // Handle different query procedures based on mutation type
              if (eventData.resource === 'posts') {
                // Invalidate 'bySlug' queries for affected post slugs (update/delete)
                if (procedure === 'bySlug' && eventData.ids) {
                  return eventData.ids.includes(input?.slug);
                }
                
                // Invalidate 'byAuthor' queries if the author's posts changed
                if (procedure === 'byAuthor' && eventData.related?.authorId) {
                  return input?.authorId === eventData.related.authorId;
                }
                
                // Invalidate 'list' queries for all post mutations
                // - create/delete: changes item count
                // - update: can change title, excerpt, published status, etc. visible in list
                if (procedure === 'list') {
                  return true;
                }
                
                // Invalidate 'adminListAll' for any post mutation
                if (procedure === 'adminListAll') {
                  return true;
                }
              }
              
              if (eventData.resource === 'comments') {
                // Invalidate 'byPostId' queries for the affected post
                if (procedure === 'byPostId' && eventData.related?.postId !== undefined) {
                  return input?.postId === eventData.related.postId;
                }
                
                // Also invalidate if comment ID matches (for updates/deletes of specific comments)
                if (procedure === 'byPostId' && eventData.ids && eventData.ids.length > 0) {
                  // Comments are queried by post, so any comment change invalidates the post's comment list
                  return eventData.related?.postId !== undefined && input?.postId === eventData.related.postId;
                }
              }
              
              if (eventData.resource === 'tags') {
                // Invalidate specific tag queries (update/delete)
                if (procedure === 'bySlug' && eventData.ids) {
                  return eventData.ids.includes(input?.slug);
                }
                
                // Invalidate 'list' queries for creates and deletes
                if (procedure === 'list' && (eventData.mutationType === 'create' || eventData.mutationType === 'delete')) {
                  return true;
                }
              }
              
              if (eventData.resource === 'users') {
                // Invalidate specific user queries (update)
                if (procedure === 'byName' && eventData.ids) {
                  return eventData.ids.includes(input?.name);
                }
                
                // Invalidate user ID queries
                if (procedure === 'byId' && eventData.ids) {
                  return eventData.ids.includes(input?.id);
                }
                
                // Invalidate 'list' queries for creates and deletes
                if (procedure === 'list' && (eventData.mutationType === 'create' || eventData.mutationType === 'delete')) {
                  return true;
                }
              }
              
              return false;
            }
          });
        }
      );
    } catch (error) {
      console.error(`[Subscription] Failed to subscribe to ${queryKey}:`, error);
      // Don't throw - we don't want to break the app if subscriptions fail
    }
  };

  const fetchData = () => {
    return clientId;
  };

  // Reuse existing client ID if already subscribed to this query key
  if (channels[queryKey]) {
    clientId = channels[queryKey];
  } else {
    channels[queryKey] = clientId;
    connectAndSubscribe();
  }

  return useQuery({
    queryKey: ['eventsQuery', queryKey],
    queryFn: fetchData,
    staleTime: Infinity, // Client ID never goes stale
    gcTime: Infinity, // Keep in cache forever
  });
}
