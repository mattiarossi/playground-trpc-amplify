/**
 * Server-side utility for publishing cache invalidation events to AppSync Events
 * 
 * This is automatically called by the tRPC mutation middleware for all mutations.
 * The middleware intercepts mutation results and publishes events based on the
 * router path and returned data structure.
 * 
 * Uses AWS Signature V4 to sign requests to AppSync Events HTTP API
 */

import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@aws-sdk/protocol-http';

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const EVENTS_ENDPOINT = process.env.EVENTS_ENDPOINT || '';

// Initialize SigV4 signer with Lambda execution role credentials
const signer = new SignatureV4({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    sessionToken: process.env.AWS_SESSION_TOKEN,
  },
  region: AWS_REGION,
  service: 'appsync',
  sha256: Sha256,
});

/**
 * Interface for mutation events - minimal data to identify what changed
 */
interface MutationEvent {
  /** User ID who performed the mutation (to filter own mutations) */
  userId: string;
  /** Resource type that changed (e.g., 'posts', 'comments') */
  resource: string;
  /** Type of mutation performed */
  mutationType: 'create' | 'update' | 'delete';
  /** Specific resource IDs affected (e.g., post slugs, comment IDs) */
  ids?: Array<string | number>;
  /** Related resource IDs (e.g., authorId for posts) */
  related?: Record<string, any>;
}

/**
 * Publishes a mutation event to the AppSync Events subscriptions channel
 * This notifies all subscribed clients to invalidate their query caches for specific resources
 * 
 * NOTE: This function is automatically called by the tRPC mutation middleware.
 * You typically don't need to call this directly from your router code.
 * 
 * The middleware extracts:
 * - resource: from the router path (e.g., 'posts.create' -> 'posts')
 * - ids: from result.id or result.slug
 * - related: from result.authorId, result.postId, etc.
 * 
 * @param resource - Resource type (e.g., 'posts', 'comments', 'tags')
 * @param mutationType - Type of mutation ('create', 'update', 'delete')
 * @param ids - Specific resource IDs affected
 * @param userId - User ID who performed the mutation
 * @param related - Related resource identifiers (e.g., { authorId: '...', postId: 123 })
 * 
 * @example
 * ```typescript
 * // Automatic - middleware handles this:
 * // When a post mutation returns { id: 1, slug: 'my-post', authorId: 'user123', ... }
 * // Event published: resource='posts', mutationType='create', ids=['my-post'], userId=ctx.user.sub, related={ authorId: 'user123' }
 * 
 * // Manual call (if needed for special cases):
 * await publishMutationEvent('posts', 'update', ['my-post-slug'], ctx.user.sub, { authorId: ctx.user.sub });
 * ```
 */
export async function publishMutationEvent(
  resource: string,
  mutationType: 'create' | 'update' | 'delete',
  ids: Array<string | number>,
  userId: string,
  related?: Record<string, any>,
): Promise<void> {
  try {
    const event: MutationEvent = {
      userId,
      resource,
      mutationType,
      ids,
      related,
    };

    const channel = `subscriptions/${resource}`;
    const { hostname, pathname } = new URL(EVENTS_ENDPOINT);
    
    const params = {
      method: 'POST',
      hostname: hostname,
      path: pathname,
      headers: {
        accept: 'application/json, text/javascript',
        'content-encoding': 'amz-1.0',
        'content-type': 'application/json; charset=UTF-8',
        host: hostname,
      },
      body: JSON.stringify({
        channel: channel,
        events: [JSON.stringify(event)],
      }),
    };

    const requestToBeSigned = new HttpRequest(params);

    // Sign the request with AWS Signature V4
    const signedRequest = await signer.sign(requestToBeSigned, { signingDate: new Date() });
    
    console.log(`[Subscription] Publishing update to channel: ${channel}`);
    
    // Send the signed request to AppSync Events
    const response = await fetch(EVENTS_ENDPOINT, {
      method: 'POST',
      headers: signedRequest.headers as HeadersInit,
      body: signedRequest.body,
    });

    if (!response.ok) {
      console.error(`[Subscription] Failed to publish event: ${response.statusText}`);
      return;
    }

    const responseData = await response.json();

    if (responseData && responseData.errors) {
      console.error('[Subscription] Publishing failed:', responseData.errors);
    } else {
      console.log(`[Subscription] Successfully published mutation event for ${resource}:`, ids);
    }
  } catch (error) {
    console.error('[Subscription] Failed to publish mutation event:', error);
    // Don't throw - we don't want to break mutations if events fail
  }
}
